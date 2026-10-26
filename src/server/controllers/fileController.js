/**
 * 文件控制器 - 处理文件上传相关逻辑
 * 流程：接收文件 → 去重检查 → 存处理临时文件 + 创建/覆盖 DB 记录 → 加入异步队列 → 立即返回
 * 队列异步处理：按类型转 MD/直读/仅存 → 原文件存本地暂存
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dao = require('../database/dao');
const localStorage = require('../services/localStorage');
const nasService = require('../services/nas');
const nasPaths = require('../utils/nasPaths');
const fileTypes = require('../utils/fileTypes');
const logger = require('../utils/logger');
const projectExtractLog = require('../utils/projectExtractLog');
const { checkProjectAccess, respondProjectAccessCheck, touchUpdaterFromReq } = require('../utils/projectAuth');
const { respondIfProjectLocked, STATUS } = require('../utils/projectStatus');
const userMgmtDao = require('../database/userMgmtDao');
const classifierService = require('../services/classifier');
const archiveTemplates = require('../config/archiveTemplates');

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '..', 'temp');

function requireAccessibleProject(req, res, projectId) {
  const project = dao.getProject(projectId);
  const result = checkProjectAccess(project, req.user?.userid);
  if (!respondProjectAccessCheck(res, result)) return null;
  return project;
}

function requireAccessibleProjectByFile(req, res, file) {
  if (!file) {
    res.status(404).json({ error: '文件不存在' });
    return null;
  }
  return requireAccessibleProject(req, res, file.project_id);
}

function computeContentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseOverwrite(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

/** 可标记「含纸质」的文件状态 */
const PAPER_MARKABLE_STATUSES = new Set(['uploaded', 'done', 'success']);

function isPaperMarkableFile(file) {
  return file && PAPER_MARKABLE_STATUSES.has(file.status);
}

function requireAdminUser(req, res) {
  const userId = req.user?.userid;
  if (!userId || !userMgmtDao.isPrivilegedUser(userId)) {
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }
  return true;
}

function cleanupTempByFile(file) {
  if (!file || !file.id) return;
  const ext = fileTypes.getExt(file.file_name) || path.extname(file.file_name || '') || '';
  const candidates = new Set([
    path.join(TEMP_DIR, `${file.id}${ext}`),
    path.join(TEMP_DIR, `${file.id}.pdf`),
    path.join(TEMP_DIR, `${file.id}.bin`)
  ]);
  for (const p of candidates) {
    try { fs.unlinkSync(p); } catch (e) { /* 忽略 */ }
  }
}

/** 根据扩展名推断 Content-Type（供浏览器内联打开） */
function guessMimeType(fileName) {
  return fileTypes.guessMimeType(fileName);
}

/**
 * inline 查看用的 Content-Disposition
 * @param {string} fileName
 * @returns {string}
 */
function inlineContentDisposition(fileName) {
  const safeAsciiName = String(fileName || 'file').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(fileName || 'file')}`;
}

/**
 * 本机文件：sendFile（Range / ETag / 不整包进内存）
 * @param {import('express').Response} res
 * @param {string} absPath
 * @param {string} fileName
 */
function sendLocalFileInline(res, absPath, fileName) {
  res.sendFile(absPath, {
    acceptRanges: true,
    lastModified: true,
    etag: true,
    cacheControl: false,
    headers: {
      'Content-Type': guessMimeType(fileName),
      'Content-Disposition': inlineContentDisposition(fileName),
      'Cache-Control': 'private, no-store'
    }
  }, (err) => {
    if (!err) return;
    logger.error('文件', `sendFile 失败: ${absPath}`, err);
    if (!res.headersSent) {
      res.status(err.statusCode || 500).json({ error: err.message || '文件发送失败' });
    }
  });
}

/**
 * 尽量删除 NAS 远程文件；失败只记日志，不阻断主流程
 * @param {string|null} nasPath
 */
async function tryDeleteNas(nasPath) {
  if (!nasPath) return;
  try {
    await nasService.deleteRemoteFile(nasPath);
  } catch (error) {
    logger.warn('文件', `删除 NAS 文件失败（继续）: ${nasPath}`, error);
  }
}

/**
 * 写入临时文件并创建/覆盖记录后入队
 * @returns {Promise<{ file: object, overwritten: boolean }>}
 */
async function saveAndEnqueue({
  projectId,
  docType,
  segNo,
  fileName,
  fileBuffer,
  contentHash,
  folderKey = null,
  existing = null,
  forceReparse = false
}) {
  const taskQueue = require('../services/taskQueue');
  const ext = (path.extname(fileName) || '').toLowerCase() || '.bin';
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  if (existing) {
    cleanupTempByFile(existing);
    localStorage.tryDeleteByRel(existing.local_path);
    await tryDeleteNas(existing.nas_path);

    const fileId = existing.id;
    fs.writeFileSync(path.join(TEMP_DIR, `${fileId}${ext}`), fileBuffer);

    dao.updateFile(fileId, {
      file_name: fileName,
      content_hash: contentHash,
      md_content: null,
      extracted_data: null,
      mineru_output_dir: null,
      nas_path: null,
      local_path: null,
      error_msg: null,
      status: 'pending',
      has_paper: 0,
      paper_reviewed: 0,
      folder_key: folderKey != null ? folderKey : (existing.folder_key || '')
    });

    taskQueue.enqueue(fileId, {
      forceReparse: forceReparse || fileTypes.needsMineru(fileName, docType)
    });
    return { file: dao.getFile(fileId), overwritten: true };
  }

  const fileId = crypto.randomUUID();
  fs.writeFileSync(path.join(TEMP_DIR, `${fileId}${ext}`), fileBuffer);

  dao.createFile({
    id: fileId,
    projectId,
    docType,
    fileName,
    mdContent: null,
    nasPath: null,
    localPath: null,
    segmentNo: segNo,
    contentHash,
    folderKey: folderKey || ''
  });

  taskQueue.enqueue(fileId);
  return { file: dao.getFile(fileId), overwritten: false };
}

/**
 * 处理单个上传（含去重）
 */
async function processOneUpload({ projectId, docType, segNo, fileName, fileBuffer, overwrite, folderKey = null }) {
  const contentHash = computeContentHash(fileBuffer);
  const existing = dao.findDuplicateFile({
    projectId,
    docType,
    segmentNo: segNo,
    fileName,
    contentHash
  });

  if (existing && !overwrite) {
    const sameName = existing.file_name === fileName;
    const sameHash = existing.content_hash === contentHash;
    let conflictBy = 'name';
    if (sameName && sameHash) conflictBy = 'both';
    else if (sameHash) conflictBy = 'hash';

    const tip = conflictBy === 'hash'
      ? `与已有文件「${existing.file_name}」内容相同（hash 一致）`
      : `文件名「${fileName}」已存在`;

    const err = new Error(`文件已存在：${tip}。继续上传将覆盖原文件` +
      (fileTypes.needsMineru(fileName, docType) ? '；将重新解析转换 Markdown' : ''));
    err.status = 409;
    err.payload = {
      error: err.message,
      code: 'FILE_EXISTS',
      conflictBy,
      existing,
      tip
    };
    throw err;
  }

  return saveAndEnqueue({
    projectId,
    docType,
    segNo,
    fileName,
    fileBuffer,
    contentHash,
    folderKey,
    existing: existing || null,
    forceReparse: !!(existing && fileTypes.needsMineru(fileName, docType))
  });
}

module.exports = {
  /**
   * POST /api/files/upload
   */
  async upload(req, res) {
    try {
      const { projectId, docType, segmentNo, overwrite } = req.body;
      const segNo = parseInt(segmentNo, 10) || 0;
      const rawFolderKey = req.body.folderKey !== undefined ? req.body.folderKey : req.body.folder_key;
      const folderKey = rawFolderKey === undefined ? null : String(rawFolderKey || '').trim();

      if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
      }
      if (!projectId || !docType) {
        return res.status(400).json({ error: '缺少 projectId 或 docType 参数' });
      }
      if (folderKey && !archiveTemplates.isValidFolderKey(folderKey)) {
        return res.status(400).json({ error: '归档目录无效' });
      }

      const project = requireAccessibleProject(req, res, projectId);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      const result = await processOneUpload({
        projectId,
        docType,
        segNo,
        fileName: req.file.originalname,
        fileBuffer: req.file.buffer,
        overwrite: parseOverwrite(overwrite),
        folderKey
      });

      touchUpdaterFromReq(projectId, req.user);

      res.status(result.overwritten ? 200 : 201).json({
        success: true,
        overwritten: result.overwritten,
        file: result.file,
        message: result.overwritten
          ? '已覆盖原文件，正在排队处理'
          : '文件已上传，正在排队处理'
      });
    } catch (error) {
      if (error.status === 409 && error.payload) {
        return res.status(409).json(error.payload);
      }
      console.error('[File Upload] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/files/upload-batch
   */
  async batchUpload(req, res) {
    try {
      const { projectId, docType, segmentNo, overwrite } = req.body;
      const segNo = parseInt(segmentNo, 10) || 0;
      const doOverwrite = parseOverwrite(overwrite);
      const rawFolderKey = req.body.folderKey !== undefined ? req.body.folderKey : req.body.folder_key;
      const folderKey = rawFolderKey === undefined ? null : String(rawFolderKey || '').trim();

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '未上传文件' });
      }
      if (!projectId || !docType) {
        return res.status(400).json({ error: '缺少 projectId 或 docType 参数' });
      }
      if (folderKey && !archiveTemplates.isValidFolderKey(folderKey)) {
        return res.status(400).json({ error: '归档目录无效' });
      }

      const project = requireAccessibleProject(req, res, projectId);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      const results = [];
      const conflicts = [];

      for (const file of req.files) {
        try {
          const one = await processOneUpload({
            projectId,
            docType,
            segNo,
            fileName: file.originalname,
            fileBuffer: file.buffer,
            overwrite: doOverwrite,
            folderKey
          });
          results.push({ ...one.file, overwritten: one.overwritten });
        } catch (error) {
          if (error.status === 409 && error.payload) {
            conflicts.push({
              fileName: file.originalname,
              ...error.payload
            });
          } else {
            throw error;
          }
        }
      }

      if (conflicts.length > 0 && results.length === 0) {
        return res.status(409).json({
          error: '存在重复文件',
          code: 'FILE_EXISTS',
          conflicts
        });
      }

      if (results.length > 0) {
        touchUpdaterFromReq(projectId, req.user);
      }

      res.status(201).json({
        success: true,
        files: results,
        conflicts,
        message: conflicts.length > 0
          ? `已上传 ${results.length} 个，${conflicts.length} 个因重复跳过`
          : `已上传 ${results.length} 个文件，正在排队处理`
      });
    } catch (error) {
      console.error('[Batch Upload] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/files/classify
   * 按文件内容 AI 识别文档类型（不落库、不入队），供「从文件夹导入」兜底使用
   * Body（multipart）：file
   * 返回：{ success, docType, confidence, reason }
   */
  async classify(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
      }
      const result = await classifierService.classify(req.file.buffer, req.file.originalname);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[文档分类] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/files/status/:projectId
   */
  async getStatus(req, res) {
    try {
      const project = requireAccessibleProject(req, res, req.params.projectId);
      if (!project) return;

      const files = dao.getFilesByProject(req.params.projectId);
      const taskQueue = require('../services/taskQueue');
      res.json({
        files,
        queue: taskQueue.getStatus()
      });
    } catch (error) {
      console.error('[文件状态] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/files/:id/retry
   * 支持：转换失败重试；或已上传但尚未生成 MD 的 MineRU 类型补转换
   */
  async retry(req, res) {
    try {
      const file = dao.getFile(req.params.id);
      if (!file) return res.status(404).json({ error: '文件不存在' });
      const project = requireAccessibleProjectByFile(req, res, file);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      const needsConvert = fileTypes.needsMineru(file.file_name, file.doc_type);
      const hasMd = !!(file.md_content && String(file.md_content).trim());
      const canRetryFailed = file.status === 'convert_failed';
      const canBackfillMd = needsConvert && !hasMd
        && ['uploaded', 'error', 'pending', 'converting'].includes(file.status);
      if (!canRetryFailed && !canBackfillMd) {
        return res.status(400).json({
          error: hasMd
            ? '文件已有 Markdown，无需重新转换（可直接提取）'
            : '当前状态不可重试转换'
        });
      }

      const ext = (path.extname(file.file_name) || '.bin').toLowerCase();
      const tempPath = path.join(TEMP_DIR, `${file.id}${ext}`);
      if (!fs.existsSync(tempPath)) {
        const stagingAbs = nasPaths.resolveLocalAbs(file.local_path);
        if (stagingAbs && fs.existsSync(stagingAbs)) {
          if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
          fs.copyFileSync(stagingAbs, tempPath);
        } else {
          return res.status(400).json({ error: '临时文件已丢失且本地无副本，请重新上传' });
        }
      }

      dao.updateFile(file.id, { status: 'pending', error_msg: null });
      const taskQueue = require('../services/taskQueue');
      taskQueue.enqueue(file.id, { forceReparse: needsConvert });
      touchUpdaterFromReq(file.project_id, req.user);

      res.json({ success: true, message: '已重新加入处理队列' });
    } catch (error) {
      console.error('[重试] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/files/:id/view
   * 鉴权后：本地 sendFile（Range）；否则读 NAS 整包返回
   */
  async view(req, res) {
    try {
      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });
      if (!requireAccessibleProjectByFile(req, res, existing)) return;

      if (!nasPaths.hasStoredFile(existing)) {
        return res.status(404).json({ error: '文件尚未上传至存储，暂无法查看' });
      }

      const fileName = existing.file_name || 'file';
      const localAbs = nasPaths.resolveLocalAbs(existing.local_path);
      if (localAbs) {
        sendLocalFileInline(res, localAbs, fileName);
        return;
      }

      const buffer = await localStorage.readStoredFile(existing);
      res.setHeader('Content-Type', guessMimeType(fileName));
      res.setHeader('Content-Disposition', inlineContentDisposition(fileName));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error) {
      console.error('[查看文件] 失败:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  },

  /**
   * PUT /api/files/:id
   */
  async update(req, res) {
    try {
      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });
      const project = requireAccessibleProjectByFile(req, res, existing);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      const payload = { ...req.body };
      if (payload.hasPaper !== undefined || payload.has_paper !== undefined) {
        if (!isPaperMarkableFile(existing)) {
          return res.status(400).json({ error: '当前文件状态不可标记含纸质' });
        }
        const raw = payload.hasPaper !== undefined ? payload.hasPaper : payload.has_paper;
        payload.hasPaper = raw === true || raw === 1 || raw === '1' ? 1 : 0;
        delete payload.has_paper;
      }

      const file = dao.updateFile(req.params.id, payload);
      touchUpdaterFromReq(existing.project_id, req.user);

      // 提取/重新提取结果写入项目日志
      const extractedPayload = payload.extracted_data !== undefined
        ? payload.extracted_data
        : payload.extracted;
      if (extractedPayload !== undefined) {
        let parsedResult = extractedPayload;
        if (typeof extractedPayload === 'string') {
          try { parsedResult = JSON.parse(extractedPayload); } catch { /* 保留原字符串 */ }
        }
        const hadPrevious = projectExtractLog.hasExtractedData(existing.extracted_data);
        projectExtractLog.append(existing.project_id, {
          action: hadPrevious ? 're-extract' : 'extract',
          fileId: existing.id,
          fileName: existing.file_name,
          docType: existing.doc_type,
          segmentNo: existing.segment_no,
          result: parsedResult,
        });
      } else if (payload.status === 'error' && existing.status === 'extracting') {
        projectExtractLog.append(existing.project_id, {
          action: 'extract_failed',
          fileId: existing.id,
          fileName: existing.file_name,
          docType: existing.doc_type,
          segmentNo: existing.segment_no,
          error: payload.error_msg || payload.errorMsg || '未知错误',
        });
      }

      res.json(file);
    } catch (error) {
      console.error('[更新文件] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * PUT /api/files/:id/paper-review
   * 管理员确认含纸质文件（待审核项目，绕过项目锁定）
   */
  async updatePaperReview(req, res) {
    try {
      if (!requireAdminUser(req, res)) return;

      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });
      const project = requireAccessibleProjectByFile(req, res, existing);
      if (!project) return;

      if (project.status !== STATUS.PENDING_PAPER) {
        return res.status(409).json({ error: '仅待纸质核对项目可确认含纸质文件' });
      }
      if (!existing.has_paper) {
        return res.status(400).json({ error: '该文件未标记含纸质' });
      }
      if (!isPaperMarkableFile(existing)) {
        return res.status(400).json({ error: '当前文件状态不可确认含纸质' });
      }

      const raw = req.body.paperReviewed !== undefined ? req.body.paperReviewed : req.body.paper_reviewed;
      const paperReviewed = raw === true || raw === 1 || raw === '1' ? 1 : 0;
      const file = dao.updateFile(req.params.id, { paper_reviewed: paperReviewed });
      touchUpdaterFromReq(existing.project_id, req.user);
      res.json(file);
    } catch (error) {
      console.error('[含纸质确认] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * DELETE /api/files/:id
   * 删除 DB 记录、处理临时文件、本地存储，并尽力删除 NAS
   */
  async delete(req, res) {
    try {
      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });
      const project = requireAccessibleProjectByFile(req, res, existing);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      cleanupTempByFile(existing);
      localStorage.tryDeleteByRel(existing.local_path);
      await tryDeleteNas(existing.nas_path);

      dao.deleteFile(req.params.id);
      touchUpdaterFromReq(existing.project_id, req.user);
      res.json({ success: true });
    } catch (error) {
      console.error('[删除文件] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * PUT /api/files/:id/segment-no
   */
  updateSegmentNo(req, res) {
    try {
      const { id } = req.params;
      const file = dao.getFile(id);
      if (!file) return res.status(404).json({ error: '文件不存在' });
      const project = requireAccessibleProjectByFile(req, res, file);
      if (!project) return;
      if (respondIfProjectLocked(res, project)) return;

      const { segmentNo } = req.body;
      dao.updateFileSegmentNo(id, segmentNo || 0);
      touchUpdaterFromReq(file.project_id, req.user);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};
