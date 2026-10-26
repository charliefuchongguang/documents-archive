/**
 * 本地文件存储（文档暂存 / 归档）
 * 路径根：config.localStorage.tempPath / basePath
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const nasService = require('./nas');
const nasPaths = require('../utils/nasPaths');

function ensureDirectory(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 启动时创建暂存与归档根目录
 */
function initLocalStorageDirs() {
  ensureDirectory(config.localStorage.tempPath);
  ensureDirectory(config.localStorage.basePath);
  logger.info('本地存储', `暂存目录: ${config.localStorage.tempPath}`);
  logger.info('本地存储', `归档目录: ${config.localStorage.basePath}`);
}

function writeFile(absPath, fileBuffer) {
  const dir = path.dirname(absPath);
  ensureDirectory(dir);
  fs.writeFileSync(absPath, fileBuffer);
  logger.info('本地存储', `写入: ${absPath}`, { size: fileBuffer ? fileBuffer.length : 0 });
  return { success: true, path: absPath };
}

function readFile(absPath) {
  if (!absPath || !fs.existsSync(absPath)) {
    throw new Error(`本地文件不存在: ${absPath || ''}`);
  }
  return fs.readFileSync(absPath);
}

function fileExists(absPath) {
  return !!absPath && fs.existsSync(absPath) && fs.statSync(absPath).isFile();
}

function moveFile(sourcePath, destPath) {
  if (!sourcePath || !destPath) {
    throw new Error('本地移动路径不能为空');
  }
  if (sourcePath === destPath) {
    return { success: true, path: destPath };
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`本地源文件不存在: ${sourcePath}`);
  }
  ensureDirectory(path.dirname(destPath));
  fs.renameSync(sourcePath, destPath);
  logger.info('本地存储', `已移动: ${sourcePath} → ${destPath}`);
  return { success: true, path: destPath };
}

function deleteFile(absPath) {
  if (!absPath) return { success: true, skipped: true };
  try {
    if (!fs.existsSync(absPath)) {
      return { success: true, skipped: true };
    }
    fs.unlinkSync(absPath);
    logger.info('本地存储', `已删除: ${absPath}`);
    return { success: true };
  } catch (error) {
    logger.error('本地存储', `删除失败: ${absPath}`, error);
    throw error;
  }
}

function deleteDirectory(dirPath) {
  if (!dirPath) return { success: true, skipped: true };
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: true, skipped: true };
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    logger.info('本地存储', `已删除目录: ${dirPath}`);
    return { success: true };
  } catch (error) {
    logger.error('本地存储', `删除目录失败: ${dirPath}`, error);
    throw error;
  }
}

function tryDeleteByRel(relPath) {
  if (!relPath) return;
  for (const abs of [nasPaths.localArchiveAbs(relPath), nasPaths.localStagingAbs(relPath)]) {
    try {
      deleteFile(abs);
    } catch (error) {
      logger.warn('本地存储', `删除失败（继续）: ${abs}`, error);
    }
  }
}

/**
 * 本地优先读取；否则（NAS 已启用且有 nas_path）读 NAS
 * @param {{ local_path?: string, nas_path?: string, file_name?: string, id?: string }} file
 * @returns {Promise<Buffer>}
 */
async function readStoredFile(file) {
  const localAbs = nasPaths.resolveLocalAbs(file?.local_path);
  if (localAbs) {
    return readFile(localAbs);
  }
  if (config.nas?.enabled && file?.nas_path) {
    return nasService.getFileContents(file.nas_path);
  }
  throw new Error(`文件「${file?.file_name || file?.id || ''}」尚未存入存储，无法读取`);
}

module.exports = {
  ensureDirectory,
  initLocalStorageDirs,
  writeFile,
  readFile,
  fileExists,
  moveFile,
  deleteFile,
  deleteDirectory,
  tryDeleteByRel,
  readStoredFile
};
