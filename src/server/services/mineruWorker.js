/**
 * MinerU 全局队列 worker（对齐 hegui mineru/worker.py）
 * 最多 maxConcurrent 并发上传/轮询；完成后下载 zip 并提取 md
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const config = require('../config');
const mineruClient = require('./mineruClient');
const mineruDao = require('../database/mineruDao');
const logger = require('../utils/logger');

/** @type {Set<string>} */
const inflight = new Set();

/** @type {ReturnType<typeof setInterval>|null} */
let loopTimer = null;

/** @type {boolean} */
let ticking = false;

/**
 * 递归查找目录下 .md；优先 vlm 目录内的 md
 * @param {string} dir
 * @returns {string[]}
 */
function findMdFilesPreferVlm(dir) {
  const all = [];
  const vlm = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        all.push(fullPath);
        const parentName = path.basename(path.dirname(fullPath));
        if (parentName === 'vlm') {
          vlm.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  const list = (vlm.length > 0 ? vlm : all).slice().sort();
  return list;
}

/**
 * @param {string} taskId
 * @param {string} message
 * @param {string|null} [mineruStatus]
 */
function failTask(taskId, message, mineruStatus = null) {
  logger.error('MinerU队列', `任务 ${taskId.slice(0, 8)} 失败: ${message}`);
  const fields = {
    queue_status: 'failed',
    has_error: 1,
    remark: String(message).slice(0, 4000),
    finished_at: mineruDao.utcNow(),
  };
  if (mineruStatus != null) {
    fields.mineru_status = mineruStatus;
  }
  mineruDao.update(taskId, fields);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 处理单条任务（上传或 resume 轮询 → 下 zip → 解压 md）
 * @param {object} row
 * @param {boolean} resume
 */
async function processOne(row, resume = false) {
  const taskId = String(row.id);
  if (inflight.has(taskId)) return;
  inflight.add(taskId);

  try {
    const pdfPath = String(row.file_abs_path || '');
    let mineruTaskId = String(row.mineru_task_id || '').trim();

    if (!resume || !mineruTaskId) {
      try {
        const data = await mineruClient.submitTask(pdfPath);
        mineruTaskId = String(data.task_id || '').trim();
        const statusStr = data.status != null ? String(data.status) : null;
        if (!mineruTaskId) {
          failTask(taskId, `上传成功但无 task_id: ${mineruClient.remarkFromPayload(data)}`, statusStr);
          return;
        }
        mineruDao.update(taskId, {
          mineru_task_id: mineruTaskId,
          mineru_status: statusStr,
          queue_status: 'running',
          remark: mineruClient.remarkFromPayload(data),
          has_error: 0,
        });
        logger.info('MinerU队列', `已提交 mineru_task_id=${mineruTaskId.slice(0, 8)}`, { taskId: taskId.slice(0, 8) });
      } catch (exc) {
        failTask(taskId, `上传 MinerU 失败: ${exc.message}`);
        return;
      }
    }

    const pollInterval = Math.max(1000, Number(config.mineru.pollIntervalMs) || 5000);
    const timeoutMs = Math.max(60000, Number(config.mineru.taskTimeoutMs) || 1800000);
    const started = Date.now();

    while (true) {
      if (Date.now() - started > timeoutMs) {
        failTask(taskId, `等待 MinerU 超时（>${timeoutMs}ms）`);
        return;
      }

      let data;
      try {
        data = await mineruClient.getTaskStatus(mineruTaskId);
      } catch (exc) {
        logger.warn('MinerU队列', `查询状态失败 task=${taskId.slice(0, 8)}: ${exc.message}`);
        await sleep(pollInterval);
        continue;
      }

      const statusStr = data.status != null ? String(data.status) : '';
      const err = data.error;
      mineruDao.update(taskId, {
        mineru_status: statusStr || null,
        remark: mineruClient.remarkFromPayload(data),
      });

      if (err) {
        failTask(taskId, `MinerU error: ${typeof err === 'string' ? err : JSON.stringify(err)}`, statusStr || null);
        return;
      }
      if (statusStr === 'completed') break;
      if (['failed', 'error', 'cancelled'].includes(statusStr)) {
        failTask(taskId, `MinerU 终态 status=${statusStr}`, statusStr);
        return;
      }
      await sleep(pollInterval);
    }

    // 结果路径：PDF 同目录下固定名（与 convert 落盘目录一致）
    const pdfDir = path.dirname(pdfPath);
    const zipPath = path.join(pdfDir, 'result.zip');
    const extractDir = path.join(pdfDir, 'result');
    const resultMdPath = path.join(pdfDir, 'result.md');

    try {
      await mineruClient.downloadResultZip(mineruTaskId, zipPath);

      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractDir, true);

      const mdFiles = findMdFilesPreferVlm(extractDir);
      if (mdFiles.length === 0) {
        throw new Error('zip 解压后未找到 .md 文件');
      }
      fs.copyFileSync(mdFiles[0], resultMdPath);
      const markdown = fs.readFileSync(resultMdPath, 'utf-8');
      if (!markdown || !markdown.trim()) {
        throw new Error('result.md 内容为空');
      }

      mineruDao.update(taskId, {
        queue_status: 'completed',
        mineru_status: 'completed',
        has_error: 0,
        result_zip_path: zipPath,
        result_dir_path: extractDir,
        md_path: resultMdPath,
        document_text: markdown,
        remark: JSON.stringify({
          mineru_task_id: mineruTaskId,
          result_zip_path: zipPath,
          md_path: resultMdPath,
          source_md: mdFiles[0],
        }),
        finished_at: mineruDao.utcNow(),
      });
      logger.info('MinerU队列', `完成 zip=${path.basename(zipPath)} mdLen=${markdown.length}`, {
        taskId: taskId.slice(0, 8),
      });
    } catch (exc) {
      failTask(taskId, `下载/解压结果失败: ${exc.message}`, 'completed');
    }
  } finally {
    inflight.delete(taskId);
  }
}

/**
 * 判断 updated_at 是否超过 staleSeconds
 * @param {string} updatedAt
 * @param {number} staleSeconds
 * @returns {boolean}
 */
function isStale(updatedAt, staleSeconds = 60) {
  try {
    const raw = String(updatedAt || '');
    const normalized = raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
    const age = (Date.now() - new Date(normalized).getTime()) / 1000;
    return Number.isNaN(age) || age > staleSeconds;
  } catch (e) {
    return true;
  }
}

/**
 * worker 主循环一轮
 */
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const maxC = Math.max(1, Number(config.mineru.maxConcurrent) || 2);

    // 孤儿 uploading：不在 inflight 则回收
    for (const row of mineruDao.listByQueueStatus('uploading')) {
      const tid = String(row.id);
      if (inflight.has(tid)) continue;
      const mid = String(row.mineru_task_id || '').trim();
      if (mid) {
        mineruDao.update(tid, { queue_status: 'running' });
        processOne({ ...row, queue_status: 'running' }, true).catch((e) => {
          logger.error('MinerU队列', `resume uploading 异常: ${e.message}`, { taskId: tid.slice(0, 8) });
        });
      } else if (isStale(row.updated_at, 60)) {
        mineruDao.update(tid, { queue_status: 'queued' });
        logger.info('MinerU队列', `孤儿 uploading 已回滚为 queued`, { taskId: tid.slice(0, 8) });
      }
    }

    for (const row of mineruDao.listByQueueStatus('running')) {
      const tid = String(row.id);
      if (!inflight.has(tid) && String(row.mineru_task_id || '').trim()) {
        processOne(row, true).catch((e) => {
          logger.error('MinerU队列', `resume running 异常: ${e.message}`, { taskId: tid.slice(0, 8) });
        });
      }
    }

    const claimed = mineruDao.claimNext(maxC);
    for (const row of claimed) {
      processOne(row, false).catch((e) => {
        logger.error('MinerU队列', `处理异常: ${e.message}`, { taskId: String(row.id).slice(0, 8) });
      });
    }
  } catch (exc) {
    logger.error('MinerU队列', `worker 循环异常: ${exc.message}`, exc);
  } finally {
    ticking = false;
  }
}

/**
 * 启动全局 MinerU worker
 */
function start() {
  try {
    const stats = mineruDao.recoverOnStartup();
    logger.info('MinerU队列', `启动恢复: resetQueued=${stats.resetQueued} toRunning=${stats.toRunning}`);
  } catch (exc) {
    logger.error('MinerU队列', `启动恢复失败: ${exc.message}`, exc);
  }

  if (loopTimer) return;
  loopTimer = setInterval(() => {
    tick().catch((e) => logger.error('MinerU队列', `tick 失败: ${e.message}`));
  }, 1000);
  if (typeof loopTimer.unref === 'function') {
    loopTimer.unref();
  }
  logger.info('MinerU队列', '全局队列 worker 已启动');
  tick().catch(() => {});
}

/**
 * 停止 worker
 */
function stop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  logger.info('MinerU队列', '全局队列 worker 已停止');
}

module.exports = {
  start,
  stop,
  processOne,
  findMdFilesPreferVlm,
};
