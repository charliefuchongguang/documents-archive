/**
 * 存储路径构建与归档就绪校验
 * - 未归档本地暂存：{localTemp}/{projectId}/{sanitizedFileName}
 * - 归档：{localBase|NAS_BASE}/{region}/【{year}-{采购}-{类型}-{标段编号}】{项目名}/{fileName}
 * - NAS「暂存」目录已废弃，getStagingDir 仅用于清理历史远程目录
 */
const path = require('path');
const fs = require('fs');
const config = require('../config');

/** WebDAV URL 编码路径保守上限（实测 OK≈347、失败≈381） */
const NAS_MAX_ENCODED_PATH_LEN = 340;

/** NAS 单文件名最大字符数 */
const NAS_MAX_FILE_NAME_CHARS = 255;

/** 采购类型代码 → 中文标签 */
const PROCUREMENT_LABELS = {
  G: '工程',
  H: '货物',
  F: '服务'
};

/**
 * 清理路径段中的非法字符（保留中文）
 * @param {string} segment
 * @returns {string}
 */
function sanitizePathSegment(segment) {
  if (!segment) return '未知';
  const cleaned = String(segment)
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '未知';
}

/**
 * 清理文件名中的非法字符
 * @param {string} fileName
 * @returns {string}
 */
function sanitizeFileName(fileName) {
  if (!fileName) return 'file';
  const cleaned = String(fileName)
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim();
  return cleaned || 'file';
}

/**
 * WebDAV 路径编码（与 node-fetch / webdav 客户端行为一致：分段 encodeURIComponent）
 * @param {string} remotePath
 * @returns {string}
 */
function encodeNasPath(remotePath) {
  return remotePath.split('/').map((segment) => {
    if (!segment) return segment;
    return encodeURIComponent(segment);
  }).join('/');
}

/**
 * 拆分文件名与扩展名
 * @param {string} fileName
 * @returns {{ base: string, ext: string }}
 */
function splitFileNameParts(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return { base: fileName, ext: '' };
  }
  return { base: fileName.slice(0, lastDot), ext: fileName.slice(lastDot) };
}

/**
 * NAS 远程文件名清洗（仅用于暂存上传路径，不影响系统内 file_name）
 * - 去除 NAS 禁止字符：/ # $ ^ * < > ' " \ 及 .. 等
 * - 按 URL 编码后完整路径长度截断（保留扩展名）
 * @param {string} fileName - 原始文件名
 * @param {Object} [options]
 * @param {string} [options.parentPath] - 父目录完整路径（含末尾 /），用于计算编码长度预算
 * @param {number} [options.maxEncodedPathLen] - 编码路径最大长度
 * @returns {string}
 */
function sanitizeNasFileName(fileName, options = {}) {
  const {
    parentPath = '',
    maxEncodedPathLen = NAS_MAX_ENCODED_PATH_LEN
  } = options;

  if (!fileName) return 'file';

  let { base, ext } = splitFileNameParts(String(fileName).trim());

  const cleanSegment = (segment) => String(segment)
    .replace(/[/\\#$\^*<>'"\\:?|]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[()]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  base = cleanSegment(base).replace(/^\.+/, '');
  ext = cleanSegment(ext);

  if (!base) base = 'file';
  if (ext && !ext.startsWith('.')) ext = '.' + ext;

  let safeName = base + ext;

  if (safeName.length > NAS_MAX_FILE_NAME_CHARS) {
    const maxBaseLen = Math.max(1, NAS_MAX_FILE_NAME_CHARS - ext.length);
    base = base.slice(0, maxBaseLen);
    safeName = base + ext;
  }

  const parent = parentPath.endsWith('/') ? parentPath : `${parentPath}/`;
  while (safeName.length > 1) {
    const fullPath = parent + safeName;
    if (encodeNasPath(fullPath).length <= maxEncodedPathLen) {
      break;
    }
    if (base.length <= 1) {
      safeName = 'file' + ext;
      break;
    }
    base = base.slice(0, -1);
    safeName = base + ext;
  }

  return safeName || 'file';
}

/**
 * @param {string} code - G / H / F
 * @returns {string}
 */
function procurementTypeToLabel(code) {
  return PROCUREMENT_LABELS[code] || PROCUREMENT_LABELS.G;
}

function getBasePath() {
  return config.nas?.basePath || '/归档文件';
}

/**
 * 暂存相对路径（相对 localStorage.tempPath）
 * @param {string} projectId
 * @param {string} fileName
 * @returns {string}
 */
function relativeStaging(projectId, fileName) {
  const safeName = sanitizeNasFileName(fileName, { parentPath: `${projectId}/` });
  return `${projectId}/${safeName}`;
}

/**
 * 归档相对路径（相对 localStorage.basePath / NAS basePath，两边一致）
 * @param {Object} params
 * @returns {string}
 */
function relativeProjectDir({
  region,
  year,
  procurementType,
  categoryName,
  segmentNo,
  projectName
}) {
  const procurementLabel = procurementTypeToLabel(procurementType);
  const dirName = buildProjectDirName({
    year,
    procurementLabel,
    categoryName: sanitizePathSegment(categoryName || '招标'),
    segmentNo,
    projectName
  });
  return `${sanitizePathSegment(region)}/${dirName}`;
}

function relativeArchive({
  region,
  year,
  procurementType,
  categoryName,
  segmentNo,
  projectName,
  folderName,
  fileName
}) {
  const projectDir = relativeProjectDir({
    region,
    year,
    procurementType,
    categoryName,
    segmentNo,
    projectName
  });
  const folderPart = folderName ? `${sanitizePathSegment(folderName)}/` : '';
  const safeFileName = sanitizeFileName(fileName);
  return `${projectDir}/${folderPart}${safeFileName}`;
}

function toFsAbs(root, relPath) {
  const parts = String(relPath || '').split('/').filter(Boolean);
  return path.join(root, ...parts);
}

function localStagingAbs(relPath) {
  return toFsAbs(config.localStorage.tempPath, relPath);
}

function localArchiveAbs(relPath) {
  return toFsAbs(config.localStorage.basePath, relPath);
}

function nasArchiveAbs(relPath) {
  const base = getBasePath().replace(/\/+$/, '');
  const rel = String(relPath || '').replace(/^\/+/, '');
  return `${base}/${rel}`;
}

/**
 * 解析本地绝对路径：归档目录优先，其次暂存目录
 * @param {string|null} relPath
 * @returns {string|null}
 */
function resolveLocalAbs(relPath) {
  if (!relPath) return null;
  const archiveAbs = localArchiveAbs(relPath);
  if (fs.existsSync(archiveAbs) && fs.statSync(archiveAbs).isFile()) {
    return archiveAbs;
  }
  const stagingAbs = localStagingAbs(relPath);
  if (fs.existsSync(stagingAbs) && fs.statSync(stagingAbs).isFile()) {
    return stagingAbs;
  }
  return null;
}

function hasLocalFile(relPath) {
  return !!resolveLocalAbs(relPath);
}

/**
 * 是否可读取存储文件（本地优先，其次 NAS）
 * @param {{ local_path?: string, nas_path?: string }} file
 * @returns {boolean}
 */
function hasStoredFile(file) {
  if (!file) return false;
  if (hasLocalFile(file.local_path)) return true;
  return !!(config.nas?.enabled && file.nas_path);
}

/**
 * NAS 历史暂存目录（仅清理旧数据）
 * @param {string} projectId
 * @returns {string}
 */
function getStagingDir(projectId) {
  return `${getBasePath()}/暂存/${projectId}`;
}

/**
 * @deprecated 未归档不再写入 NAS 暂存；保留供覆盖删除历史路径
 */
function buildStagingPath(projectId, fileName) {
  const dir = getStagingDir(projectId);
  const safeName = sanitizeNasFileName(fileName, { parentPath: `${dir}/` });
  return `${dir}/${safeName}`;
}

/**
 * 构建项目目录名（不含 basePath / region）
 * @param {Object} params
 * @returns {string}
 */
function buildProjectDirName({ year, procurementLabel, categoryName, segmentNo, projectName }) {
  const segLabel = segmentNo !== undefined && segmentNo !== null ? String(segmentNo) : '0';
  const tag = `【${year}-${procurementLabel}-${categoryName}-${segLabel}】`;
  return `${tag}${sanitizePathSegment(projectName)}`;
}

/**
 * 构建归档后的最终 NAS 文件路径
 * @param {Object} params
 * @returns {string}
 */
function buildFinalArchivePath({
  region,
  year,
  procurementType,
  categoryName,
  segmentNo,
  projectName,
  folderName,
  fileName
}) {
  return nasArchiveAbs(relativeArchive({
    region,
    year,
    procurementType,
    categoryName,
    segmentNo,
    projectName,
    folderName,
    fileName
  }));
}

/**
 * 解析中标通知书日期
 * @param {string} str
 * @returns {Date|null}
 */
function parseWinNoticeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 从文件列表构建全局与标段提取映射
 * @param {Array} files
 * @returns {{ globalExtracted: Object, segmentExtractedMap: Object }}
 */
function buildExtractedMaps(files) {
  const globalExtracted = {};
  const segmentExtractedMap = {};

  files.forEach((file) => {
    if (!file.extracted_data) return;
    try {
      const data = typeof file.extracted_data === 'string'
        ? JSON.parse(file.extracted_data)
        : file.extracted_data;
      const segNo = file.segment_no || 0;
      if (segNo === 0) {
        Object.assign(globalExtracted, data);
      } else {
        if (!segmentExtractedMap[segNo]) segmentExtractedMap[segNo] = {};
        Object.assign(segmentExtractedMap[segNo], data);
      }
    } catch {
      /* 忽略解析失败 */
    }
  });

  return { globalExtracted, segmentExtractedMap };
}

/**
 * 收集所有可用的中标通知书日期
 * @param {Array} files
 * @param {Object} mergedFormData
 * @param {Object} segmentExtractedMap
 * @param {Object} [extraSegmentFormData] - 审核请求体中的标段表单（可选）
 * @returns {Date[]}
 */
function collectWinNoticeDates(files, mergedFormData, segmentExtractedMap, extraSegmentFormData) {
  const dates = [];

  files
    .filter((f) => f.doc_type === 'win_notice')
    .forEach((file) => {
      if (!file.extracted_data) return;
      try {
        const data = typeof file.extracted_data === 'string'
          ? JSON.parse(file.extracted_data)
          : file.extracted_data;
        const d = parseWinNoticeDate(data.winNoticeDate);
        if (d) dates.push(d);
      } catch {
        /* 忽略 */
      }
    });

  const globalDate = parseWinNoticeDate(mergedFormData?.winNoticeDate);
  if (globalDate) dates.push(globalDate);

  Object.values(segmentExtractedMap || {}).forEach((seg) => {
    const d = parseWinNoticeDate(seg?.winNoticeDate);
    if (d) dates.push(d);
  });

  if (Array.isArray(extraSegmentFormData)) {
    extraSegmentFormData.forEach((item) => {
      const formData = item?.formData || item;
      const d = parseWinNoticeDate(formData?.winNoticeDate);
      if (d) dates.push(d);
    });
  }

  return dates;
}

/**
 * 取最早中标通知书年份（4 位）
 * @returns {string|null}
 */
function getEarliestWinNoticeYear(files, mergedFormData, segmentExtractedMap, extraSegmentFormData) {
  const dates = collectWinNoticeDates(
    files,
    mergedFormData,
    segmentExtractedMap,
    extraSegmentFormData
  );
  if (dates.length === 0) return null;
  const earliest = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  return String(earliest.getFullYear());
}

/**
 * 判断中标通知书日期字符串是否有效
 * @param {*} val
 * @returns {boolean}
 */
function isValidWinNoticeDateValue(val) {
  const d = parseWinNoticeDate(val);
  return !!d;
}

/**
 * 收集指定标段（1-based）的中标通知书日期
 * @param {number} segNo
 * @param {Array} files
 * @param {Object} segmentExtractedMap
 * @param {Array} extraSegmentFormData
 * @returns {Date|null}
 */
function getSegmentWinNoticeDate(segNo, files, segmentExtractedMap, extraSegmentFormData) {
  const dates = [];

  (files || [])
    .filter((f) => f.doc_type === 'win_notice' && (f.segment_no || 0) === segNo)
    .forEach((file) => {
      if (!file.extracted_data) return;
      try {
        const data = typeof file.extracted_data === 'string'
          ? JSON.parse(file.extracted_data)
          : file.extracted_data;
        const d = parseWinNoticeDate(data.winNoticeDate);
        if (d) dates.push(d);
      } catch {
        /* 忽略 */
      }
    });

  const fromMap = parseWinNoticeDate(segmentExtractedMap?.[segNo]?.winNoticeDate);
  if (fromMap) dates.push(fromMap);

  const formItem = Array.isArray(extraSegmentFormData) ? extraSegmentFormData[segNo - 1] : null;
  const formData = formItem?.formData || formItem;
  const fromForm = parseWinNoticeDate(formData?.winNoticeDate);
  if (fromForm) dates.push(fromForm);

  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (d < min ? d : min), dates[0]);
}

/**
 * 校验中标通知书日期是否满足单/多标段要求
 * @param {Object} project
 * @param {Array} files
 * @param {Object} mergedFormData
 * @param {Object} segmentExtractedMap
 * @param {Array} [extraSegmentFormData]
 * @returns {{ ok: boolean, error?: string, year: string|null }}
 */
function validateWinNoticeDateRequirements(
  project,
  files,
  mergedFormData,
  segmentExtractedMap,
  extraSegmentFormData
) {
  let segments = [];
  try {
    segments = JSON.parse(project?.segments || '[]');
  } catch {
    segments = [];
  }

  if (segments.length <= 1) {
    const year = getEarliestWinNoticeYear(
      files,
      mergedFormData,
      segmentExtractedMap,
      extraSegmentFormData
    );
    if (!year) {
      return { ok: false, error: '缺少有效的中标通知书日期', year: null };
    }
    return { ok: true, year };
  }

  const missing = [];
  for (let i = 0; i < segments.length; i++) {
    const segNo = i + 1;
    const segDate = getSegmentWinNoticeDate(segNo, files, segmentExtractedMap, extraSegmentFormData);
    if (!segDate) {
      missing.push(segments[i]?.name || `标段${segNo}`);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `以下标段缺少有效的中标通知书日期：${missing.join('、')}`,
      year: null
    };
  }

  const year = getEarliestWinNoticeYear(
    files,
    mergedFormData,
    segmentExtractedMap,
    extraSegmentFormData
  );
  return { ok: true, year };
}

/**
 * 校验归档所需信息是否齐备（本地文件必须存在）
 * @param {Object} project
 * @param {Array} files
 * @param {Object} mergedFormData
 * @param {Object} segmentExtractedMap
 * @param {Array} [extraSegmentFormData]
 * @returns {{ ok: boolean, errors: string[], year: string|null }}
 */
function validateArchiveNasReadiness(
  project,
  files,
  mergedFormData,
  segmentExtractedMap,
  extraSegmentFormData
) {
  const errors = [];

  if (!project?.region || !String(project.region).trim()) {
    errors.push('所属地域未设置');
  }

  const winNoticeCheck = validateWinNoticeDateRequirements(
    project,
    files,
    mergedFormData,
    segmentExtractedMap,
    extraSegmentFormData
  );
  if (!winNoticeCheck.ok) {
    errors.push(winNoticeCheck.error || '缺少有效的中标通知书日期');
  }
  const year = winNoticeCheck.year;

  const filesWithoutLocal = (files || []).filter((f) => !hasLocalFile(f.local_path));
  if (filesWithoutLocal.length > 0) {
    errors.push(
      `以下文件尚未存入本地：${filesWithoutLocal.map((f) => f.file_name).join('、')}`
    );
  }

  return { ok: errors.length === 0, errors, year };
}

module.exports = {
  PROCUREMENT_LABELS,
  NAS_MAX_ENCODED_PATH_LEN,
  NAS_MAX_FILE_NAME_CHARS,
  sanitizePathSegment,
  sanitizeFileName,
  sanitizeNasFileName,
  encodeNasPath,
  procurementTypeToLabel,
  getBasePath,
  relativeStaging,
  relativeProjectDir,
  relativeArchive,
  localStagingAbs,
  localArchiveAbs,
  nasArchiveAbs,
  resolveLocalAbs,
  hasLocalFile,
  hasStoredFile,
  getStagingDir,
  buildStagingPath,
  buildProjectDirName,
  buildFinalArchivePath,
  parseWinNoticeDate,
  buildExtractedMaps,
  collectWinNoticeDates,
  getEarliestWinNoticeYear,
  isValidWinNoticeDateValue,
  getSegmentWinNoticeDate,
  validateWinNoticeDateRequirements,
  validateArchiveNasReadiness
};
