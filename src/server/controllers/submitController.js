/**
 * 归档提交控制器
 * - 提交审核 / 审核驳回 / 审核通过并归档
 * - 管理员查看归档列表
 * - 管理员撤回归档（支持单条/批量）
 * - 管理员导出归档数据
 */
const dao = require('../database/dao');
const archiveDao = require('../database/archiveDao');
const userMgmtDao = require('../database/userMgmtDao');
const nasPaths = require('../utils/nasPaths');
const nasArchive = require('../services/nasArchive');
const archiveTemplates = require('../config/archiveTemplates');
const { nowCN } = require('../utils/time');
const localStorage = require('../services/localStorage');
const { ALLOWED_REGIONS } = require('../utils/provinces');
const AdmZip = require('adm-zip');
const {
  STATUS,
  canSubmitForReview,
  canAdminReview,
  canPaperReview
} = require('../utils/projectStatus');
const {
  checkProjectAccess,
  respondProjectAccessCheck
} = require('../utils/projectAuth');

/** 文档类型中文标签（与前端 Utils.DOC_TYPES 同步） */
const DOC_TYPE_LABELS = {
  tender_notice: '招标公告截图',
  tender_doc: '招标文件',
  win_notice: '中标通知书',
  win_public: '中标公示',
  evaluation: '履约评价',
  contract: '代理服务合同',
  bid_eval_report: '评标报告',
  handover_list: '交接清单',
  other_attach: '其它附件',
  approval: '批复',
  prequal_notice: '资格预审公告',
  prequal_doc: '资格预审文件',
  prequal_review: '评审报告（资格预审）'
};

const MAX_ZIP_FILE_COUNT = 100;
/** 单个 ZIP 包大小上限 50MB */
const MAX_ZIP_PACKAGE_BYTES = 50 * 1024 * 1024;

/**
 * 解析地域查询参数
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function parseRegionQuery(req) {
  const raw = req.query.region;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const expanded = list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean));
  return [...new Set(expanded.filter((s) => ALLOWED_REGIONS.has(s)))];
}

/**
 * 清理 ZIP 内路径非法字符
 * @param {string} name
 * @returns {string}
 */
function sanitizeZipPathPart(name) {
  return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

/**
 * 归档附件列表项（与前端约定字段）
 * @param {Object} file
 * @returns {Object}
 */
function mapArchiveFile(file) {
  return {
    id: file.id,
    file_name: file.file_name,
    doc_type: file.doc_type,
    segment_no: file.segment_no || 0,
    status: file.status,
    has_nas: nasPaths.hasStoredFile(file)
  };
}

/**
 * 清理下载文件名
 * @param {string} name
 * @returns {string}
 */
function sanitizeDownloadName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || '归档附件';
}

function downloadDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/**
 * 构建 ZIP 下载基础名：单项目用项目名称，多项目用“首项目等N个项目_日期”
 * @param {Array} files
 * @param {Map<string, Object>} archiveMap
 * @returns {string}
 */
function buildDownloadBaseName(files, archiveMap) {
  const archiveKeys = new Set();
  const projects = new Map();

  for (const file of files) {
    const key = `${file.project_id}_${file.segment_no || 0}`;
    archiveKeys.add(key);
    if (!projects.has(file.project_id)) {
      const archive = archiveMap.get(key);
      projects.set(file.project_id, {
        name: sanitizeDownloadName(archive?.project_name || '归档附件')
      });
    }
  }

  if (projects.size === 1) {
    const project = projects.values().next().value;
    let base = project.name;
    if (archiveKeys.size === 1) {
      const [key] = archiveKeys;
      const archive = archiveMap.get(key);
      const segmentNo = Number(archive?.segment_no || 0);
      if (segmentNo > 0 && archive?.segment_name) {
        base += `_${sanitizeDownloadName(archive.segment_name)}`;
      }
    }
    return base;
  }

  if (projects.size > 1) {
    const first = projects.values().next().value;
    return `${first.name}等${projects.size}个项目_${downloadDateStamp()}`;
  }

  return `归档附件_${downloadDateStamp()}`;
}

/**
 * ZIP 内层项目目录：地域/项目名称（标段>0 时追加标段名），去掉【编号】前缀
 * @param {Object} archive
 * @param {Object} file
 * @returns {string}
 */
function resolveZipProjectRef(archive, file) {
  const refParts = sanitizeZipRef(archive?.archive_ref).split('/').filter(Boolean);
  let region = '';
  let legacyDir = '';

  if (refParts.length >= 2) {
    region = refParts[0];
    legacyDir = refParts[refParts.length - 1];
  } else if (refParts.length === 1) {
    legacyDir = refParts[0];
  }

  if (!region) {
    const fileRefParts = refFromFilePath(file).split('/').filter(Boolean);
    if (fileRefParts.length >= 2) region = fileRefParts[0];
  }

  const fallbackName = legacyDir ? legacyDir.replace(/^【[^】]*】/, '') : '';
  const baseName = sanitizeDownloadName(archive?.project_name || fallbackName || file?.project_name);
  const segmentNo = Number(archive?.segment_no || file?.segment_no || 0);
  const dirName = (segmentNo > 0 && archive?.segment_name)
    ? `${baseName}_${sanitizeDownloadName(archive.segment_name)}`
    : baseName;

  return sanitizeZipRef(region ? `${region}/${dirName}` : dirName);
}

/**
 * 将文件按 50MB 分包（单文件超过 50MB 独立成包）
 * @param {Array<{ id: string, size: number }>} filesWithSize
 * @returns {string[][]}
 */
function groupFilesIntoZipPackages(filesWithSize) {
  const packages = [];
  let current = [];
  let currentSize = 0;

  for (const file of filesWithSize) {
    if (file.size > MAX_ZIP_PACKAGE_BYTES) {
      if (current.length > 0) {
        packages.push(current.map((f) => f.id));
        current = [];
        currentSize = 0;
      }
      packages.push([file.id]);
      continue;
    }

    if (currentSize + file.size > MAX_ZIP_PACKAGE_BYTES && current.length > 0) {
      packages.push(current.map((f) => f.id));
      current = [];
      currentSize = 0;
    }

    current.push(file);
    currentSize += file.size;
  }

  if (current.length > 0) {
    packages.push(current.map((f) => f.id));
  }

  return packages;
}

/**
 * 构建 ZIP 并返回 Buffer
 * @param {Array} files - 含 nas_path、file_name、doc_type 等
 * @param {Map<string, Object>} archiveMap - `${projectId}_${segmentNo}` -> archive row
 * @param {Map<string, Buffer>} [bufferMap] - fileId -> 已读取内容
 * @returns {Promise<Buffer>}
 */
function sanitizeZipRef(ref) {
  return String(ref || '')
    .split('/')
    .filter(Boolean)
    .map((part) => sanitizeZipPathPart(part))
    .join('/');
}

function refFromFilePath(file) {
  const rel = String((file && file.local_path) || '').replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  if (parts.length >= 3) return sanitizeZipRef(`${parts[0]}/${parts[1]}`);
  return '';
}

function parseMergedFormData(projectId) {
  try {
    const merged = dao.getMergedData(projectId);
    if (!merged || !merged.form_data) return {};
    return typeof merged.form_data === 'string' ? JSON.parse(merged.form_data) : merged.form_data;
  } catch {
    return {};
  }
}

function resolveArchiveTemplate(projectId, archive, cache) {
  const cacheKey = `${projectId}_${(archive && archive.template_code) || ''}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let template = null;
  if (archive && archive.template_code) {
    template = archiveTemplates.getTemplate(archive.template_code);
  }
  if (!template) {
    const project = dao.getProjectWithDepartment(projectId) || dao.getProject(projectId);
    const formData = parseMergedFormData(projectId);
    const code = archiveTemplates.resolveTemplateCode(project || {}, formData);
    template = archiveTemplates.getTemplate(code);
  }
  cache.set(cacheKey, template);
  return template;
}

async function buildZipBuffer(files, archiveMap, bufferMap) {
  const zip = new AdmZip();
  const usedPaths = new Set();
  const usedDirs = new Set();
  const templateCache = new Map();
  const groups = new Map();
  const projectDirByArchiveKey = new Map();

  const getProjectDir = (archiveKey, archive, file) => {
    if (projectDirByArchiveKey.has(archiveKey)) {
      return projectDirByArchiveKey.get(archiveKey);
    }
    const baseDir = resolveZipProjectRef(archive, file);
    const usedProjectDirs = new Set(projectDirByArchiveKey.values());
    let dir = baseDir;
    let suffix = 2;
    while (usedProjectDirs.has(dir)) {
      dir = `${baseDir}_${suffix}`;
      suffix += 1;
    }
    projectDirByArchiveKey.set(archiveKey, dir);
    return dir;
  };

  for (const file of files) {
    if (!nasPaths.hasStoredFile(file) && !bufferMap?.has(file.id)) {
      throw new Error(`文件「${file.file_name || file.id}」尚未存入存储，无法下载`);
    }

    const archiveKey = `${file.project_id}_${file.segment_no || 0}`;
    const archive = archiveMap.get(archiveKey);
    const template = resolveArchiveTemplate(file.project_id, archive, templateCache);
    const folderItem = archiveTemplates.resolveFolderItem(template, file);
    const folderName = archiveTemplates.getFolderDisplayName(folderItem, true);
    const ref = getProjectDir(archiveKey, archive, file);
    const dirPath = `${ref}/${sanitizeZipPathPart(folderName)}`;
    const fileName = sanitizeZipPathPart(file.file_name || 'file');

    let entryPath = `${dirPath}/${fileName}`;
    let suffix = 1;
    while (usedPaths.has(entryPath)) {
      const dot = fileName.lastIndexOf('.');
      const base = dot > 0 ? fileName.slice(0, dot) : fileName;
      const ext = dot > 0 ? fileName.slice(dot) : '';
      entryPath = `${dirPath}/${base}_${suffix}${ext}`;
      suffix += 1;
    }
    usedPaths.add(entryPath);
    usedDirs.add(dirPath);

    if (!groups.has(archiveKey)) {
      groups.set(archiveKey, { archive, files: [], segmentNo: file.segment_no || 0 });
    }
    groups.get(archiveKey).files.push(file);

    const buffer = bufferMap?.get(file.id) || await localStorage.readStoredFile(file);
    zip.addFile(entryPath, buffer);
  }

  // 整项目/整标段下载时补齐模板空目录，空目录名追加“（空）”
  for (const { archive, files: groupFiles, segmentNo } of groups.values()) {
    const projectId = groupFiles[0]?.project_id;
    if (!projectId) continue;
    const archiveKey = `${projectId}_${segmentNo}`;
    const allFiles = dao.getFilesByProjectAndSegment(projectId, segmentNo);
    const selectedIds = new Set(groupFiles.map((f) => f.id));
    const isFullSelection = allFiles.length > 0 && allFiles.every((f) => selectedIds.has(f.id));
    if (!isFullSelection) continue;

    const template = resolveArchiveTemplate(projectId, archive, templateCache);
    if (!template) continue;
    const ref = getProjectDir(archiveKey, archive, groupFiles[0]);

    for (const item of template.items) {
      if (item.createIfFiles) continue;
      const dirPath = `${ref}/${sanitizeZipPathPart(item.folderName)}`;
      if (usedDirs.has(dirPath)) continue;
      const emptyName = archiveTemplates.getFolderDisplayName(item, false);
      const emptyDirPath = `${ref}/${sanitizeZipPathPart(emptyName)}/`;
      if (usedPaths.has(emptyDirPath)) continue;
      zip.addFile(emptyDirPath, Buffer.alloc(0));
      usedPaths.add(emptyDirPath);
    }
  }

  return zip.toBuffer();
}

/**
 * 为文件列表构建归档信息映射
 * @param {Array} files
 * @returns {Map<string, Object>}
 */
function buildArchiveMapForFiles(files) {
  const archiveMap = new Map();
  for (const file of files) {
    const archiveKey = `${file.project_id}_${file.segment_no || 0}`;
    if (!archiveMap.has(archiveKey)) {
      const archive = archiveDao.getArchiveByProjectAndSegment(file.project_id, file.segment_no || 0)
        || archiveDao.getArchive(file.project_id);
      archiveMap.set(archiveKey, archive);
    }
  }
  return archiveMap;
}

/**
 * 格式化 ZIP 下载文件名：优先使用项目名称
 * @param {Object} options
 * @param {Array} [options.files]
 * @param {Map<string, Object>} [options.archiveMap]
 * @param {number} [options.packageIndex]
 * @param {number} [options.totalPackages]
 * @returns {string}
 */
function formatZipDownloadName({ files = [], archiveMap = new Map(), packageIndex, totalPackages } = {}) {
  const base = buildDownloadBaseName(files, archiveMap);
  if (totalPackages && totalPackages > 1) {
    return `${base}_第${packageIndex}包共${totalPackages}包.zip`;
  }
  return `${base}.zip`;
}

/**
 * 合并文件提取结果与表单数据，并校验 NAS 归档就绪状态
 * @param {Object} project
 * @param {string} projectId
 * @param {import('express').Request} [req]
 * @returns {{ files: Array, globalExtracted: Object, segmentExtractedMap: Object, finalFormData: Object, readiness: Object }}
 */
function prepareArchiveContext(project, projectId, req) {
  const files = dao.getFilesByProject(projectId);
  const { globalExtracted, segmentExtractedMap } = nasPaths.buildExtractedMaps(files);

  const existingMerged = dao.getMergedData(projectId);
  const existingFormData = (existingMerged && existingMerged.form_data)
    ? (typeof existingMerged.form_data === 'string'
      ? JSON.parse(existingMerged.form_data)
      : existingMerged.form_data)
    : {};

  const finalFormData = { ...globalExtracted, ...existingFormData };

  let extraSegmentFormData = req?.body?.segmentFormData || [];
  if ((!extraSegmentFormData || extraSegmentFormData.length === 0) && existingMerged?.segment_form_data) {
    extraSegmentFormData = Array.isArray(existingMerged.segment_form_data)
      ? existingMerged.segment_form_data
      : [];
  }
  const readiness = nasPaths.validateArchiveNasReadiness(
    project,
    files,
    finalFormData,
    segmentExtractedMap,
    extraSegmentFormData
  );

  return {
    files,
    globalExtracted,
    segmentExtractedMap,
    finalFormData,
    readiness
  };
}

/**
 * 执行归档：合并数据并写入 archives 表
 * @param {string} projectId
 * @param {import('express').Request} req
 * @returns {Promise<{ archiveResult: *, projectNo: string }>}
 */
async function performArchive(projectId, req) {
  const project = dao.getProject(projectId);
  if (!project) {
    throw new Error('项目不存在');
  }
  if (project.status === STATUS.ARCHIVED) {
    const err = new Error('已归档项目无法重复提交');
    err.statusCode = 409;
    throw err;
  }

  const {
    globalExtracted,
    segmentExtractedMap,
    finalFormData,
    readiness
  } = prepareArchiveContext(project, projectId, req);

  if (!readiness.ok) {
    const err = new Error(readiness.errors.join('；'));
    err.statusCode = 400;
    throw err;
  }

  const year = readiness.year;
  // 新项目创建时已发号；历史草稿归档时再发号
  let projectNo = project.project_no || '';
  if (!projectNo) {
    const projectNoYear = new Date().getFullYear().toString().slice(-2);
    const procurementType = project.procurement_type || 'G';
    projectNo = archiveDao.generateProjectNo(projectNoYear, procurementType);
    dao.updateProject(projectId, { project_no: projectNo });
  }

  const projectWithDept = dao.getProjectWithDepartment(projectId) || project;
  const templateCode = archiveTemplates.resolveTemplateCode(projectWithDept, finalFormData);
  const template = archiveTemplates.getTemplate(templateCode);
  const templateVersion = template?.version || '';
  const archiveBase = {
    region: project.region,
    year,
    procurementType: project.procurement_type || 'G',
    categoryName: projectWithDept.category_name || '招标',
    projectName: project.name
  };

  // 先将暂存文件搬迁到最终存储路径，并按模板创建标准子目录
  await nasArchive.moveProjectFilesToFinalArchive(projectId, project, year, templateCode);

  // 写入系统项目编号；不覆盖招标文件编号 tenderDocNo
  finalFormData.projectNo = projectNo;

  dao.saveMergedData({
    projectId,
    formData: finalFormData,
    conflicts: dao.getMergedData(projectId)?.conflicts || {}
  });

  console.log(`[提交归档] 项目 ${project.name} 合并完成：全局${Object.keys(globalExtracted).length}个字段，${Object.keys(segmentExtractedMap).length}个标段组 → 共享${Object.keys(finalFormData).length}个字段`);

  const segments = JSON.parse(project.segments || '[]');
  let archiveResult;

  if (segments.length <= 1) {
    archiveResult = archiveDao.archiveProject({
      projectId,
      projectName: project.name,
      formData: finalFormData,
      submittedBy: req.user.userid,
      submittedByName: req.user.name,
      segmentNo: 0,
      segmentName: '',
      projectNo,
      templateCode,
      templateVersion,
      archiveRef: nasPaths.relativeProjectDir({ ...archiveBase, segmentNo: 0 })
    });
  } else {
    const segmentFormData = req.body.segmentFormData || [];
    const formDataArray = segments.map((seg, i) => {
      const segNo = i + 1;
      if (segmentFormData[i] && segmentFormData[i].formData) {
        const segData = { ...segmentFormData[i].formData };
        segData.projectNo = projectNo;
        return segData;
      }
      const segExtracted = segmentExtractedMap[segNo] || {};
      const segData = { ...finalFormData, ...segExtracted };
      segData.projectNo = projectNo;
      return segData;
    });

    archiveResult = archiveDao.archiveProjectBatch({
      projectId,
      projectName: project.name,
      segments,
      formDataArray,
      projectNo,
      templateCode,
      templateVersion,
      archiveRefBuilder: (segmentNo) => nasPaths.relativeProjectDir({ ...archiveBase, segmentNo }),
      submittedBy: req.user.userid,
      submittedByName: req.user.name
    });
  }

  dao.updateProject(projectId, {
    status: STATUS.ARCHIVED,
    updated_by: req.user.userid,
    updated_by_name: req.user.name || ''
  });

  return { archiveResult, projectNo };
}

/**
 * 电子档审核通过后的归档与状态流转
 * - 立即生成归档记录并搬迁文件，电子档可查询
 * - 存在含纸质文件时进入 pending_paper，否则直接 archived
 * @param {string} projectId
 * @param {import('express').Request} req
 * @param {string} comment
 * @returns {Promise<{ archiveResult: *, projectNo: string, status: string, paperTotal: number }>}
 */
async function archiveAfterElectronicReview(projectId, req, comment) {
  const now = nowCN();
  const { archiveResult, projectNo } = await performArchive(projectId, req);

  const paperFiles = dao.getFilesByProject(projectId).filter((f) => f && f.has_paper);
  const paperTotal = paperFiles.length;
  // 电子档审核通过后统一进入纸质档核对；即使没有含纸质文件，也保留第二步待办
  const status = STATUS.PENDING_PAPER;

  dao.updateProject(projectId, {
    status,
    review_comment: comment,
    reviewed_by: req.user.userid,
    reviewed_by_name: req.user.name || '',
    reviewed_at: now,
    paper_reviewed_by: null,
    paper_reviewed_by_name: null,
    paper_reviewed_at: null,
    paper_review_comment: ''
  });

  return { archiveResult, projectNo, status, paperTotal };
}

function requireAdminUser(req, res) {
  const userId = req.user?.userid;
  if (!userId || !userMgmtDao.isUserAdmin(userId)) {
    res.status(403).json({ error: '仅管理员可执行此操作' });
    return false;
  }
  return true;
}

module.exports = {
  performArchive,

  /**
   * POST /api/submit/project/:id
   * 兼容旧接口：仅管理员在待审核状态下可归档
   */
  async submitProject(req, res) {
    try {
      if (!requireAdminUser(req, res)) return;

      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      if (!canAdminReview(project.status)) {
        return res.status(409).json({ error: '仅待审核项目可通过此接口归档' });
      }

      const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
      const result = await archiveAfterElectronicReview(projectId, req, comment);

      res.status(201).json({
        success: true,
        archive: result.archiveResult,
        projectNo: result.projectNo,
        status: result.status,
        paperTotal: result.paperTotal,
        message: result.status === STATUS.PENDING_PAPER
          ? '电子档审核通过，已生成待纸质核对'
          : '项目已成功提交到归档表'
      });
    } catch (error) {
      console.error('[提交归档] 失败:', error.message);
      if (error.statusCode === 409 || error.message.includes('已归档')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/project/:id/request-review
   * 提交审核（草稿 / 审核不通过 → 待审核）
   */
  async requestReview(req, res) {
    try {
      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      if (!canSubmitForReview(project.status)) {
        return res.status(409).json({ error: '当前项目状态无法提交审核' });
      }

      const { readiness } = prepareArchiveContext(project, projectId, req);
      if (!readiness.ok) {
        return res.status(400).json({ error: readiness.errors.join('；') });
      }

      dao.updateProject(projectId, {
        status: STATUS.PENDING_REVIEW,
        review_comment: '',
        reviewed_by: null,
        reviewed_by_name: null,
        reviewed_at: null,
        paper_reviewed_by: null,
        paper_reviewed_by_name: null,
        paper_reviewed_at: null,
        paper_review_comment: '',
        updated_by: req.user.userid,
        updated_by_name: req.user.name || ''
      });

      // 再次进入待审核时清零纸质确认，管理员需重新核对
      dao.resetPaperReviewedByProject(projectId);

      res.json({ success: true, message: '已提交审核' });
    } catch (error) {
      console.error('[提交审核] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/project/:id/reject
   * 审核不通过（仅管理员）
   */
  async rejectReview(req, res) {
    try {
      if (!requireAdminUser(req, res)) return;

      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      if (!canAdminReview(project.status)) {
        return res.status(409).json({ error: '仅待审核项目可审核' });
      }

      const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
      if (!comment) {
        return res.status(400).json({ error: '请填写审核不通过原因' });
      }

      const now = nowCN();
      dao.updateProject(projectId, {
        status: STATUS.REVIEW_REJECTED,
        review_comment: comment,
        reviewed_by: req.user.userid,
        reviewed_by_name: req.user.name || '',
        reviewed_at: now,
        updated_by: req.user.userid,
        updated_by_name: req.user.name || ''
      });

      res.json({ success: true, message: '已驳回审核' });
    } catch (error) {
      console.error('[审核不通过] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/project/:id/approve
   * 审核通过并归档（仅管理员）
   */
  async approveAndArchive(req, res) {
    try {
      if (!requireAdminUser(req, res)) return;

      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      if (!canAdminReview(project.status)) {
        return res.status(409).json({ error: '仅待审核项目可审核通过并归档' });
      }

      const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
      const result = await archiveAfterElectronicReview(projectId, req, comment);

      res.status(201).json({
        success: true,
        archive: result.archiveResult,
        projectNo: result.projectNo,
        status: result.status,
        paperTotal: result.paperTotal,
        message: result.status === STATUS.PENDING_PAPER
          ? '电子档审核通过，已生成待纸质核对'
          : '审核通过，项目已归档'
      });
    } catch (error) {
      console.error('[审核通过并归档] 失败:', error.message);
      if (error.statusCode === 409 || error.message.includes('已归档')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/project/:id/paper-complete
   * 完成纸质档核对（仅管理员，待纸质核对状态）
   */
  async completePaperReview(req, res) {
    try {
      if (!requireAdminUser(req, res)) return;

      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      if (!canPaperReview(project.status)) {
        return res.status(409).json({ error: '仅待纸质核对项目可完成纸质档核对' });
      }
      if (!archiveDao.getArchive(projectId)) {
        return res.status(409).json({ error: '归档记录不存在，请先完成电子档审核' });
      }

      const paperFiles = dao.getFilesByProject(projectId).filter((f) => f && f.has_paper);
      const unconfirmed = paperFiles.filter((f) => !f.paper_reviewed);
      if (unconfirmed.length > 0) {
        return res.status(409).json({
          error: `尚有 ${unconfirmed.length} 份含纸质文件未确认收到，无法完成纸质档核对`,
          unconfirmed: unconfirmed.map((f) => ({
            id: f.id,
            fileName: f.file_name,
            docType: f.doc_type
          }))
        });
      }

      const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
      const now = nowCN();
      dao.updateProject(projectId, {
        status: STATUS.ARCHIVED,
        paper_reviewed_by: req.user.userid,
        paper_reviewed_by_name: req.user.name || '',
        paper_reviewed_at: now,
        paper_review_comment: comment,
        updated_by: req.user.userid,
        updated_by_name: req.user.name || ''
      });

      res.json({ success: true, status: STATUS.ARCHIVED, message: '纸质档核对完成，项目已全部归档' });
    } catch (error) {
      console.error('[完成纸质核对] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/submit/archives?page=1&pageSize=50&search=&region=
   * 获取归档列表（仅管理员）
   */
  async listArchives(req, res) {
    try {
      const { page = 1, pageSize = 50, search = '' } = req.query;
      const regions = parseRegionQuery(req);
const result = archiveDao.getArchives({
        page: Number(page),
        pageSize: Number(pageSize),
        search: String(search).trim(),
        regions
      });

      const projectIds = [...new Set(result.items.map((item) => item.project_id).filter(Boolean))];
      const filesByArchive = new Map();
      if (projectIds.length > 0) {
        for (const file of dao.getFilesForProjects(projectIds)) {
          const key = `${file.project_id}_${file.segment_no || 0}`;
          if (!filesByArchive.has(key)) filesByArchive.set(key, []);
          filesByArchive.get(key).push(mapArchiveFile(file));
        }
      }
      result.items.forEach((item) => {
        const key = `${item.project_id}_${item.segment_no || 0}`;
        item.files = filesByArchive.get(key) || [];
      });

      res.json(result);
    } catch (error) {
      console.error('[归档列表] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/submit/archives/:projectId/files?segmentNo=0
   * 懒加载归档项目附件（仅管理员）
   */
  async listArchiveFiles(req, res) {
    try {
      const { projectId } = req.params;
      const segmentNo = Number(req.query.segmentNo);
      if (Number.isNaN(segmentNo)) {
        return res.status(400).json({ error: '请提供有效的 segmentNo 参数' });
      }

      const archive = archiveDao.getArchiveByProjectAndSegment(projectId, segmentNo);
      if (!archive) {
        return res.status(404).json({ error: '归档记录不存在' });
      }

const files = dao.getFilesByProjectAndSegment(projectId, segmentNo).map(mapArchiveFile);

      res.json({ files });
    } catch (error) {
      console.error('[归档附件列表] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/archives/download-zip
   * 批量下载所选附件（仅管理员）
   * Body: { fileIds: string[] }
   * - 单包：直接返回 zip 流
   * - 多包（单文件>50MB 或合计超限）：返回 JSON { multiple, totalPackages, packages }
   */
  async downloadArchiveZip(req, res) {
    try {
      const { fileIds } = req.body || {};
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: '请提供要下载的文件 ID 列表' });
      }
      if (fileIds.length > MAX_ZIP_FILE_COUNT) {
        return res.status(400).json({ error: `单次最多下载 ${MAX_ZIP_FILE_COUNT} 个文件` });
      }

      const uniqueIds = [...new Set(fileIds.map(String))];
      const files = dao.getFilesByIds(uniqueIds);
      if (files.length !== uniqueIds.length) {
        return res.status(400).json({ error: '部分文件不存在' });
      }

      const missingStored = files.filter((f) => !nasPaths.hasStoredFile(f));
      if (missingStored.length > 0) {
        return res.status(400).json({
          error: `以下文件尚未存入存储，无法下载：${missingStored.map((f) => f.file_name || f.id).join('、')}`
        });
      }

      const filesWithSize = [];
      for (const file of files) {
        const buffer = await localStorage.readStoredFile(file);
        filesWithSize.push({ id: file.id, size: buffer.length, file, buffer });
      }

      const packages = groupFilesIntoZipPackages(filesWithSize);
      const bufferMap = new Map(filesWithSize.map((item) => [item.id, item.buffer]));

      if (packages.length > 1) {
        return res.json({
          multiple: true,
          totalPackages: packages.length,
          packages
        });
      }

const archiveMap = buildArchiveMapForFiles(files);
      const zipBuffer = await buildZipBuffer(files, archiveMap, bufferMap);
      const downloadName = formatZipDownloadName({ files, archiveMap });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (error) {
      console.error('[归档附件ZIP] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/archives/download-zip-package
   * 下载指定分包（仅管理员）
   * Body: { fileIds: string[], packageIndex?: number, totalPackages?: number }
   */
  async downloadArchiveZipPackage(req, res) {
    try {
      const { fileIds, packageIndex = 1, totalPackages = 1 } = req.body || {};
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: '请提供要下载的文件 ID 列表' });
      }

      const uniqueIds = [...new Set(fileIds.map(String))];
      const files = dao.getFilesByIds(uniqueIds);
      if (files.length !== uniqueIds.length) {
        return res.status(400).json({ error: '部分文件不存在' });
      }

      const missingStored = files.filter((f) => !nasPaths.hasStoredFile(f));
      if (missingStored.length > 0) {
        return res.status(400).json({
          error: `以下文件尚未存入存储，无法下载：${missingStored.map((f) => f.file_name || f.id).join('、')}`
        });
      }

const archiveMap = buildArchiveMapForFiles(files);
      const zipBuffer = await buildZipBuffer(files, archiveMap);
      const downloadName = formatZipDownloadName({
        files,
        archiveMap,
        packageIndex: Number(packageIndex) || 1,
        totalPackages: Number(totalPackages) || 1
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (error) {
      console.error('[归档附件ZIP分包] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * DELETE /api/submit/archive/:id
   * 撤回归档 - 单条（仅管理员）
   * 删除归档记录，同时删除关联项目数据
   */
  async undoArchive(req, res) {
    try {
      const projectId = req.params.id;

      const archive = archiveDao.getArchive(projectId);
      if (!archive) {
        return res.status(404).json({ error: '归档记录不存在' });
      }

      await nasArchive.cleanupProjectStoredFiles(projectId);
      archiveDao.removeArchive(projectId);
      dao.deleteProject(projectId);

      res.json({ success: true, message: '归档已撤回，项目及相关数据已删除' });
    } catch (error) {
      console.error('[撤回归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/archive/undo-batch
   * 批量撤回归档（仅管理员）
   */
  async undoArchiveBatch(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要撤回的归档项目 ID 列表' });
      }

      const results = { success: [], failed: [] };

      for (const projectId of ids) {
        try {
          const archive = archiveDao.getArchive(projectId);
          if (!archive) {
            results.failed.push({ id: projectId, reason: '归档记录不存在' });
            continue;
          }

          await nasArchive.cleanupProjectStoredFiles(projectId);
          archiveDao.removeArchive(projectId);
          dao.deleteProject(projectId);
          results.success.push(projectId);
        } catch (err) {
          results.failed.push({ id: projectId, reason: err.message });
        }
      }

      res.json({
        success: true,
        message: `成功撤回 ${results.success.length} 条，失败 ${results.failed.length} 条`,
        results
      });
    } catch (error) {
      console.error('[批量撤回归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/submit/export-excel
   * 获取全部归档数据供前端生成Excel（仅管理员）
   */
  async exportArchivesExcel(req, res) {
    try {
      const data = archiveDao.getAllArchivesForExport();
      res.json({ success: true, data, count: data.length });
    } catch (error) {
      console.error('[导出归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};

