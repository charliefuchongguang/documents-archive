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
const path = require('path');

class NasService {
  constructor() {
    this.client = null;
  }

  /**
   * 获取 WebDAV 客户端（懒初始化）
   */
  getClient() {
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
    try {
      const client = this.getClient();
      const exists = await client.exists('/');
      return { success: exists, message: exists ? 'NAS 连接成功' : 'NAS 根目录不可访问' };
    } catch (error) {
      return { success: false, message: 'NAS 连接失败: ' + error.message };
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
      const exists = await client.exists(currentPath);
      if (!exists) {
        await client.createDirectory(currentPath);
      }
    }
  }

  /**
   * 上传文件到 NAS
   * @param {string} remotePath - NAS 上的完整路径（如 /归档文件/2025/ZEC-001/招标文件.pdf）
   * @param {Buffer} fileBuffer - 文件内容
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async uploadFile(remotePath, fileBuffer) {
    try {
      const client = this.getClient();
      // 确保目标目录存在
      const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
      await this.ensureDirectory(dir);
      // 上传文件
      await client.putFileContents(remotePath, fileBuffer, { overwrite: true });
      return { success: true, path: remotePath };
    } catch (error) {
      throw new Error('NAS 文件上传失败: ' + error.message);
    }
  }

  /**
   * 从 NAS WebDAV 下载文件
   * @param {string} remotePath - 远程路径（相对于 basePath）
   * @returns {Promise<Buffer>} 文件内容
   */
  async downloadFile(remotePath) {
    try {
      const client = this.getClient();
      const content = await client.getFileContents(remotePath);
      return content;
    } catch (error) {
      throw new Error('NAS 文件下载失败: ' + error.message);
    }
  }

  /**
   * 构建归档文件的 NAS 存储路径
   * @param {string} projectNo - 项目编号
   * @param {string} docType - 文档类型（如 "招标文件"）
   * @param {string} fileName - 原始文件名
   * @returns {string} NAS 上的完整路径
   */
  buildArchivePath(projectNo, docType, fileName) {
    const year = new Date().getFullYear().toString();
    const basePath = config.nas.basePath || '/归档文件';
    const ext = path.extname(fileName);
    return `${basePath}/${year}/${projectNo}/${docType}${ext}`;
  }
}

module.exports = new NasService();
