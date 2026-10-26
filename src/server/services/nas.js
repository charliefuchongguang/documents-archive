/**
 * NAS WebDAV 文件存储服务封装
 * - WebDAV 客户端懒初始化
 * - 文件上传到 NAS
 * - 目录递归创建
 * - 连接检查
 * - 归档路径构建
 */
const { createClient } = require('webdav');
const config = require('../config');
const logger = require('../utils/logger');

class NasService {
  constructor() {
    this.client = null;
  }

  isEnabled() {
    return !!config.nas?.enabled;
  }

  /**
   * 获取 WebDAV 客户端（懒初始化）
   */
  getClient() {
    if (!this.isEnabled()) {
      throw new Error(config.nas?.disabledReason || 'NAS 未启用');
    }
    if (!this.client) {
      this.client = createClient(config.nas.webdavUrl, {
        username: config.nas.username,
        password: config.nas.password,
      });
    }
    return this.client;
  }

  /**
   * 检查 NAS 连通性
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async checkConnection() {
    if (!this.isEnabled()) {
      const message = `NAS 未启用: ${config.nas?.disabledReason || ''}`.trim();
      return { success: false, message };
    }
    try {
      const client = this.getClient();
      const exists = await client.exists('/');
      const result = { success: exists, message: exists ? 'NAS 连接成功' : 'NAS 根目录不可访问' };
      if (exists) {
        logger.info('NAS', result.message, { webdavUrl: config.nas.webdavUrl });
      } else {
        logger.warn('NAS', result.message, { webdavUrl: config.nas.webdavUrl });
      }
      return result;
    } catch (error) {
      const message = 'NAS 连接失败: ' + error.message;
      logger.error('NAS', message, error);
      return { success: false, message };
    }
  }

  /**
   * 确保目录存在（递归创建）
   * @param {string} dirPath - 目录路径
   */
  async ensureDirectory(dirPath) {
    const client = this.getClient();
    const parts = dirPath.split('/').filter(Boolean);
    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      try {
        const exists = await client.exists(currentPath);
        if (!exists) {
          await client.createDirectory(currentPath);
          logger.info('NAS', `创建目录: ${currentPath}`);
        }
      } catch (error) {
        logger.error('NAS', `确保目录失败: ${currentPath}`, error);
        throw error;
      }
    }
  }

  /**
   * 上传文件到 NAS（单次）
   * @param {string} remotePath - NAS 上的完整路径（如 /归档文件/2025/ZEC-001/招标文件.pdf）
   * @param {Buffer} fileBuffer - 文件内容
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async uploadFile(remotePath, fileBuffer) {
    if (!this.isEnabled()) {
      throw new Error(config.nas?.disabledReason || 'NAS 未启用');
    }
    try {
      const size = fileBuffer ? fileBuffer.length : 0;
      logger.info('NAS', `开始上传: ${remotePath}`, { size });
      const client = this.getClient();
      // 确保目标目录存在
      const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
      await this.ensureDirectory(dir);
      // 上传文件
      await client.putFileContents(remotePath, fileBuffer, { overwrite: true });
      logger.info('NAS', `上传成功: ${remotePath}`, { size });
      return { success: true, path: remotePath };
    } catch (error) {
      logger.error('NAS', `文件上传失败: ${remotePath}`, error);
      throw new Error('NAS 文件上传失败: ' + error.message);
    }
  }

  /**
   * 上传文件到 NAS（失败自动重试）
   * 次数与间隔见 config.nas.uploadMaxRetries / uploadRetryDelayMs
   * @param {string} remotePath
   * @param {Buffer} fileBuffer
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async uploadFileWithRetry(remotePath, fileBuffer) {
    const maxRetries = Math.max(1, Number(config.nas.uploadMaxRetries) || 3);
    const delayMs = Math.max(0, Number(config.nas.uploadRetryDelayMs) || 5000);
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info('NAS', `第 ${attempt}/${maxRetries} 次重试上传: ${remotePath}`);
        }
        return await this.uploadFile(remotePath, fileBuffer);
      } catch (error) {
        lastError = error;
        logger.error(
          'NAS',
          `上传失败 (第 ${attempt}/${maxRetries} 次): ${remotePath} — ${error.message}`,
          error
        );
        if (attempt < maxRetries && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('NAS 文件上传失败');
  }

  /**
   * 读取 NAS 上的文件内容（用于浏览器内查看）
   * @param {string} remotePath
   * @returns {Promise<Buffer>}
   */
  async getFileContents(remotePath) {
    if (!this.isEnabled()) {
      throw new Error(config.nas?.disabledReason || 'NAS 未启用');
    }
    if (!remotePath) {
      throw new Error('NAS 路径为空');
    }
    try {
      const client = this.getClient();
      const contents = await client.getFileContents(remotePath);
      return Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    } catch (error) {
      logger.error('NAS', `读取文件失败: ${remotePath}`, error);
      throw new Error('NAS 文件读取失败: ' + error.message);
    }
  }

  /**
   * 删除 NAS 上的文件（不存在则忽略）
   * @param {string} remotePath
   * @returns {Promise<{success: boolean, skipped?: boolean}>}
   */
  async deleteRemoteFile(remotePath) {
    if (!this.isEnabled() || !remotePath) {
      return { success: true, skipped: true };
    }
    try {
      const client = this.getClient();
      const exists = await client.exists(remotePath);
      if (!exists) {
        logger.info('NAS', `远程文件不存在，跳过删除: ${remotePath}`);
        return { success: true, skipped: true };
      }
      await client.deleteFile(remotePath);
      logger.info('NAS', `远程文件已删除: ${remotePath}`);
      return { success: true };
    } catch (error) {
      logger.error('NAS', `远程文件删除失败: ${remotePath}`, error);
      throw new Error('NAS 文件删除失败: ' + error.message);
    }
  }

  /**
   * 移动 NAS 远程文件（目标目录不存在时自动创建）
   * @param {string} sourcePath
   * @param {string} destPath
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async moveRemoteFile(sourcePath, destPath) {
    if (!this.isEnabled()) {
      throw new Error(config.nas?.disabledReason || 'NAS 未启用');
    }
    if (!sourcePath || !destPath) {
      throw new Error('NAS 移动路径不能为空');
    }
    if (sourcePath === destPath) {
      return { success: true, path: destPath };
    }
    try {
      const client = this.getClient();
      const exists = await client.exists(sourcePath);
      if (!exists) {
        throw new Error(`源文件不存在: ${sourcePath}`);
      }
      const dir = destPath.substring(0, destPath.lastIndexOf('/'));
      await this.ensureDirectory(dir);
      await client.moveFile(sourcePath, destPath);
      logger.info('NAS', `文件已移动: ${sourcePath} → ${destPath}`);
      return { success: true, path: destPath };
    } catch (error) {
      logger.error('NAS', `文件移动失败: ${sourcePath} → ${destPath}`, error);
      throw new Error('NAS 文件移动失败: ' + error.message);
    }
  }

  /**
   * 递归删除 NAS 目录（不存在则忽略）
   * @param {string} dirPath
   * @returns {Promise<{success: boolean, skipped?: boolean}>}
   */
  async deleteRemoteDirectory(dirPath) {
    if (!this.isEnabled() || !dirPath) {
      return { success: true, skipped: true };
    }
    try {
      const client = this.getClient();
      const exists = await client.exists(dirPath);
      if (!exists) {
        logger.info('NAS', `远程目录不存在，跳过删除: ${dirPath}`);
        return { success: true, skipped: true };
      }

      const items = await client.getDirectoryContents(dirPath);
      for (const item of items) {
        if (item.type === 'directory') {
          await this.deleteRemoteDirectory(item.filename);
        } else {
          await client.deleteFile(item.filename);
        }
      }
      await client.deleteFile(dirPath);
      logger.info('NAS', `远程目录已删除: ${dirPath}`);
      return { success: true };
    } catch (error) {
      logger.error('NAS', `远程目录删除失败: ${dirPath}`, error);
      throw new Error('NAS 目录删除失败: ' + error.message);
    }
  }
}

module.exports = new NasService();
