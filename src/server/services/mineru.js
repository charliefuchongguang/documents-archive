/**
 * MineRU PDF 转 Markdown 服务封装
 * 对齐 hegui mineru 异步队列：入队 mineru_tasks → worker 调 POST/GET /tasks → 取 md
 * 替换原同步 file_parse；对外契约 convertToMarkdown 保持不变
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const dao = require('../database/dao');
const mineruDao = require('../database/mineruDao');
const mineruClient = require('./mineruClient');

const MINERU_TEMP_ROOT = path.join(__dirname, '..', 'temp', 'mineru');

/**
 * 获取日期子目录名 YYYY-MM-DD
 * @returns {string}
 */
function getDateDirName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {string}
 */
function contentHash(pdfBuffer) {
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从 completed 行读取 markdown
 * @param {object} row
 * @returns {string}
 */
function readMarkdownFromRow(row) {
  if (row.document_text && String(row.document_text).trim()) {
    return String(row.document_text);
  }
  if (row.md_path && fs.existsSync(row.md_path)) {
    const text = fs.readFileSync(row.md_path, 'utf-8');
    if (text && text.trim()) return text;
  }
  throw new Error('MinerU 任务已完成但无法读取 markdown');
}

/**
 * 轮询本地队列直至 completed / failed
 * @param {string} queueId
 * @param {number} pollIntervalMs
 * @param {number} waitBudgetMs
 * @returns {Promise<object>}
 */
async function waitMineruQueue(queueId, pollIntervalMs, waitBudgetMs) {
  const started = Date.now();
  while (Date.now() - started < waitBudgetMs) {
    const row = mineruDao.getById(queueId);
    if (!row) {
      throw new Error(`MinerU 队列任务不存在: ${queueId}`);
    }
    if (row.queue_status === 'completed') {
      return row;
    }
    if (row.queue_status === 'failed') {
      throw new Error(row.remark || 'MinerU 转换失败');
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`等待 MinerU 队列超时（>${waitBudgetMs}ms） queueId=${queueId}`);
}

/**
 * 解析项目归属用户
 * @param {string|null|undefined} projectId
 * @returns {{ userId: string, username: string|null }}
 */
function resolveUser(projectId) {
  if (!projectId) {
    return { userId: 'system', username: null };
  }
  const project = dao.getProject(projectId);
  if (!project) {
    return { userId: 'system', username: null };
  }
  const userId = project.created_by || 'system';
  return {
    userId: String(userId),
    username: project.created_by_name || null,
  };
}

/**
 * 写入复用结果到当前 fileId 产物目录（便于审计）
 * @param {string} outputDir
 * @param {string} markdown
 * @param {object} extraManifest
 */
function writeLocalArtifacts(outputDir, markdown, extraManifest) {
  fs.mkdirSync(outputDir, { recursive: true });
  const mdPath = path.join(outputDir, 'result.md');
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(extraManifest, null, 2),
    'utf-8'
  );
  return mdPath;
}

class MineruService {
  /**
   * 将文档转换为 Markdown（异步队列，对外仍同步等待结果）
   * 支持 PDF / 图片 / DOCX / PPTX / XLSX
   * @param {Buffer} fileBuffer - 文件内容
   * @param {string} fileName - 原始文件名
   * @param {string} fileId - 文件 ID（用于产物目录命名）
   * @param {{ forceReparse?: boolean }} [options]
   * @returns {Promise<{markdown: string, metadata: object}>}
   */
  async convertToMarkdown(fileBuffer, fileName, fileId, options = {}) {
    if (!config.mineru.baseUrl) {
      throw new Error('未配置 MineRU 解析地址（MINERU_BASE_URL）');
    }
    if (!fileId) {
      throw new Error('缺少 fileId，无法创建 MineRU 产物目录');
    }

    const forceReparse = !!(options.forceReparse || config.mineru.forceReparse);

    const outputDir = path.join(MINERU_TEMP_ROOT, getDateDirName(), fileId);
    fs.mkdirSync(outputDir, { recursive: true });

    const ext = path.extname(fileName || '') || '.bin';
    const sourceFilePath = path.join(outputDir, `source${ext.toLowerCase()}`);
    fs.writeFileSync(sourceFilePath, fileBuffer);

    const hash = contentHash(fileBuffer);
    const file = dao.getFile(fileId);
    const { userId, username } = resolveUser(file?.project_id);

    const startedAt = Date.now();
    console.log(`[MineRU] 开始转换(异步): ${fileName} hash=${hash.slice(0, 12)} forceReparse=${forceReparse} → ${config.mineru.baseUrl}`);

    let row = null;
    let reused = false;

    if (!forceReparse) {
      const reusable = mineruDao.findReusable(userId, hash);
      if (reusable) {
        row = reusable;
        reused = true;
        console.log(`[MineRU] 命中同日复用 task=${String(row.id).slice(0, 8)}`);
      }
    }

    if (!row) {
      const enqueued = mineruDao.findOrEnqueue({
        userId,
        username,
        fileAbsPath: sourceFilePath,
        contentHash: hash,
        fileId,
        forceNew: forceReparse,
      });
      row = enqueued.row;
      if (enqueued.merged) {
        console.log(`[MineRU] 合并到进行中任务 task=${String(row.id).slice(0, 8)}`);
      } else {
        console.log(`[MineRU] 已入队 queued task=${String(row.id).slice(0, 8)}`);
      }

      if (row.queue_status !== 'completed') {
        const pollInterval = Math.max(1000, Number(config.mineru.pollIntervalMs) || 5000);
        const waitBudget = Math.max(60000, Number(config.mineru.taskTimeoutMs) || 1800000) + 600000;
        row = await waitMineruQueue(row.id, pollInterval, waitBudget);
      }
    }

    const markdown = readMarkdownFromRow(row);
    const mdPath = writeLocalArtifacts(outputDir, markdown, {
      fileId,
      fileName,
      baseUrl: config.mineru.baseUrl,
      parseParams: config.mineru.parseParams,
      sourceFile: sourceFilePath,
      sourcePdf: sourceFilePath,
      resultZip: row.result_zip_path || path.join(outputDir, 'result.zip'),
      extractDir: row.result_dir_path || path.join(outputDir, 'result'),
      markdownFile: path.join(outputDir, 'result.md'),
      queueTaskId: row.id,
      mineruTaskId: row.mineru_task_id,
      contentHash: hash,
      reused,
      convertedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });

    console.log(`[MineRU] 成功获取 Markdown，长度: ${markdown.length} 字符 → ${mdPath}${reused ? ' (复用)' : ''}`);

    return {
      markdown,
      metadata: {
        fileName,
        fileId,
        outputDir,
        sourceFilePath,
        sourcePdfPath: sourceFilePath,
        zipPath: row.result_zip_path || path.join(outputDir, 'result.zip'),
        extractDir: row.result_dir_path || path.join(outputDir, 'result'),
        mdPath,
        contentLength: markdown.length,
        convertedAt: new Date().toISOString(),
        queueTaskId: row.id,
        reused,
      },
    };
  }

  /**
   * 检查 MineRU 服务连通性
   */
  async checkConnection() {
    try {
      const { healthUrl, baseUrl } = config.mineru;
      if (!baseUrl) {
        return { success: false, message: '未配置 MineRU 解析地址' };
      }

      const url = healthUrl || `${String(baseUrl).replace(/\/+$/, '')}/health`;
      const fetch = require('node-fetch');
      const response = await fetch(url, {
        method: 'GET',
        timeout: 5000,
      });

      if (response.ok) {
        return { success: true, message: 'MineRU 服务连接正常' };
      }
      return { success: false, message: `MineRU 服务返回 ${response.status}` };
    } catch (error) {
      return { success: false, message: 'MineRU 服务连接失败: ' + error.message };
    }
  }
}

module.exports = new MineruService();
