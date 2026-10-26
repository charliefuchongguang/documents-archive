/**
 * 项目提取结果日志
 * - 按项目写入：server/logs/{项目ID}.log
 * - 记录每次提取/重新提取的结果，便于调试排查
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function safeProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string') return 'unknown';
  // 仅保留文件名安全字符，防止路径穿越
  return projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function formatJson(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (_) {
    return String(data);
  }
}

function hasExtractedData(data) {
  if (data == null) return false;
  if (typeof data === 'string') return data.trim().length > 0;
  if (typeof data === 'object') return Object.keys(data).length > 0;
  return false;
}

/**
 * 追加一条提取结果日志
 * @param {string} projectId - 项目 ID（projects.id）
 * @param {Object} entry
 * @param {'extract'|'re-extract'|'extract_failed'} entry.action
 * @param {string} entry.fileId
 * @param {string} [entry.fileName]
 * @param {string} [entry.docType]
 * @param {number} [entry.segmentNo]
 * @param {Object} [entry.result] - 提取结果
 * @param {string} [entry.error] - 失败原因
 */
function append(projectId, entry) {
  if (!projectId) return;

  ensureLogDir();
  const filePath = path.join(LOG_DIR, `${safeProjectId(projectId)}.log`);

  const actionLabel = {
    extract: '提取',
    're-extract': '重新提取',
    extract_failed: '提取失败',
  }[entry.action] || entry.action || '提取';

  const lines = [
    '='.repeat(80),
    `[${new Date().toISOString()}] ${actionLabel}`,
    `项目ID: ${projectId}`,
    `文件ID: ${entry.fileId || '-'}`,
    `文件名: ${entry.fileName || '-'}`,
    `文档类型: ${entry.docType || '-'}`,
    `标段: ${entry.segmentNo != null ? entry.segmentNo : '-'}`,
  ];

  if (entry.error) {
    lines.push(`错误: ${entry.error}`);
  }

  if (entry.result !== undefined) {
    const fieldCount = entry.result && typeof entry.result === 'object' && !Array.isArray(entry.result)
      ? Object.keys(entry.result).length
      : 0;
    lines.push(`字段数: ${fieldCount}`);
    lines.push('结果:');
    lines.push(formatJson(entry.result));
  }

  lines.push('');

  try {
    fs.appendFileSync(filePath, lines.join('\n'), 'utf8');
  } catch (err) {
    console.error(`[projectExtractLog] 写日志失败 (${projectId}): ${err.message}`);
  }
}

module.exports = {
  append,
  hasExtractedData,
  logDir: LOG_DIR,
};
