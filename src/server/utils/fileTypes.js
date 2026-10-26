/**
 * 上传文件类型常量与分类工具
 * 与前端 archive-helper/js/utils.js 中 FILE_TYPES 保持同步
 */

/**
 * 需送 MineRU 转 MD 的扩展名（PDF / image / DOCX / PPTX / XLSX）
 * 不含旧版 .doc/.ppt/.xls
 */
const MINERU_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.pptx', '.xlsx'];

/** PDF：MineRU 转 MD，可提取 */
const PDF_EXTS = ['.pdf'];

/** 图片：MineRU 转 MD，可提取 */
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];

/** Office（OpenXML）：MineRU 转 MD，可提取 */
const OFFICE_MINERU_EXTS = ['.docx', '.pptx', '.xlsx'];

/** 文本直读：跳过 MineRU，写入 md_content，可提取 */
const TEXT_EXTS = ['.md', '.markdown', '.txt'];

/** 仅存储：不转 MD、不可提取，只存本地/NAS */
const STORE_ONLY_EXTS = [
  '.doc',
  '.xls',
  '.ppt',
  '.zip', '.rar', '.7z',
  '.html', '.htm', '.mht'
];

/** 整类仅存储的文档类型（任意扩展名都不走 MineRU / 文本直读；与前端同步） */
// 2026-08-27: 增加 bid_eval_report（评标报告）、handover_list（交接清单）
// 2026-10-18: 增加招标项目文件夹结构中的 approval（批复）、prequal_notice（资格预审公告）、
//             prequal_doc（资格预审文件）、prequal_review（评审报告（资格预审））
const STORE_ONLY_DOC_TYPES = [
  'bid_eval_report',
  'handover_list',
  'other_attach',
  'approval',
  'prequal_notice',
  'prequal_doc',
  'prequal_review'
];

const ALLOWED_EXTS = [...MINERU_EXTS, ...TEXT_EXTS, ...STORE_ONLY_EXTS];

/** 前端 input accept 属性值 */
const ACCEPT_ATTR = ALLOWED_EXTS.join(',');

/** 扩展名 → MIME（提交 MineRU / 浏览器预览） */
const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar'
};

/**
 * @param {string} fileName
 * @returns {string} 小写扩展名（含点），无则空串
 */
function getExt(fileName) {
  if (!fileName) return '';
  const idx = String(fileName).lastIndexOf('.');
  if (idx < 0) return '';
  return String(fileName).slice(idx).toLowerCase();
}

function isAllowed(fileName) {
  return ALLOWED_EXTS.includes(getExt(fileName));
}

/** 文档类型是否整类仅存储（评标报告 / 交接清单 / 其它附件等） */
function isStoreOnlyDocType(docType) {
  return STORE_ONLY_DOC_TYPES.includes(docType);
}

/**
 * 需要 MineRU 转 MD（整类仅存类型跳过）
 * @param {string} fileName
 * @param {string} [docType]
 */
function needsMineru(fileName, docType) {
  if (isStoreOnlyDocType(docType)) return false;
  return MINERU_EXTS.includes(getExt(fileName));
}

/** 文本直读（md/txt；可按文档类型强制跳过） */
function isTextReadable(fileName, docType) {
  if (isStoreOnlyDocType(docType)) return false;
  return TEXT_EXTS.includes(getExt(fileName));
}

/** 可 AI 提取（MinerU 类型 / md / txt；整类仅存类型不可提取） */
function isExtractable(fileName, docType) {
  if (isStoreOnlyDocType(docType)) return false;
  return needsMineru(fileName, docType) || isTextReadable(fileName, docType);
}

/** 仅存储扩展名 */
function isStoreOnly(fileName) {
  return STORE_ONLY_EXTS.includes(getExt(fileName));
}

/** 是否按仅存储处理（扩展名仅存，或整类仅存） */
function isStoreOnlyUpload(fileName, docType) {
  return isStoreOnlyDocType(docType) || isStoreOnly(fileName);
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function guessMimeType(fileName) {
  return MIME_BY_EXT[getExt(fileName)] || 'application/octet-stream';
}

module.exports = {
  PDF_EXTS,
  IMAGE_EXTS,
  OFFICE_MINERU_EXTS,
  MINERU_EXTS,
  TEXT_EXTS,
  STORE_ONLY_EXTS,
  STORE_ONLY_DOC_TYPES,
  ALLOWED_EXTS,
  ACCEPT_ATTR,
  MIME_BY_EXT,
  getExt,
  isAllowed,
  isStoreOnlyDocType,
  needsMineru,
  isTextReadable,
  isExtractable,
  isStoreOnly,
  isStoreOnlyUpload,
  guessMimeType
};
