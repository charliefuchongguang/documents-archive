/**
 * 文件控制器 - 处理文件上传相关逻辑
 * 流程：接收 PDF → 存临时文件 + 创建DB记录(pending) → 加入异步队列 → 立即返回
 * 队列异步处理：MineRU 转 md → 原 PDF 存 NAS → md 存数据库
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dao = require('../database/dao');

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '..', 'temp');

module.exports = {
  /**
   * POST /api/files/upload
   * 接收 PDF 文件 → 存临时文件 + 创建DB记录(pending) → 加入异步队列 → 立即返回
   */
  async upload(req, res) {
    try {
      const { projectId, docType } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
      }
      if (!projectId || !docType) {
        return res.status(400).json({ error: '缺少 projectId 或 docType 参数' });
      }

      // 检查项目是否存在
      const project = dao.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: '项目不存在' });
      }

      const fileId = crypto.randomUUID();
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      // 按原始扩展名保存临时文件（支持 .pdf / .md / .markdown）
      const ext = (path.extname(fileName) || '.pdf').toLowerCase();
      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEMP_DIR, `${fileId}${ext}`), fileBuffer);

      // 创建文件记录（状态为 pending）
      dao.createFile({
        id: fileId,
        projectId,
        docType,
        fileName,
        mdContent: null,
        nasPath: null
      });
      // createFile 默认 status='pending'（已从 'uploaded' 改为 'pending'）

      // 加入处理队列
      const taskQueue = require('../services/taskQueue');
      taskQueue.enqueue(fileId);

      res.status(201).json({
        success: true,
        file: dao.getFile(fileId),
        message: '文件已上传，正在排队处理'
      });
    } catch (error) {
      console.error('[File Upload] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/files/status/:projectId
   * 获取项目下所有文件的状态及队列状态
   */
  async getStatus(req, res) {
    try {
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
   * 重试转换失败的文件
   */
  async retry(req, res) {
    try {
      const file = dao.getFile(req.params.id);
      if (!file) return res.status(404).json({ error: '文件不存在' });
      if (file.status !== 'convert_failed') {
        return res.status(400).json({ error: '只有转换失败的文件可以重试' });
      }

      // 检查临时文件是否还在（按原始扩展名查找）
      const ext = (path.extname(file.file_name) || '.pdf').toLowerCase();
      const tempPath = path.join(TEMP_DIR, `${file.id}${ext}`);
      if (!fs.existsSync(tempPath)) {
        return res.status(400).json({ error: '临时文件已丢失，请重新上传' });
      }

      dao.updateFile(file.id, { status: 'pending', error_msg: null });
      const taskQueue = require('../services/taskQueue');
      taskQueue.enqueue(file.id);

      res.json({ success: true, message: '已重新加入处理队列' });
    } catch (error) {
      console.error('[重试] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * PUT /api/files/:id
   * 更新文件信息（提取结果、状态等）
   */
  async update(req, res) {
    try {
      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });

      const file = dao.updateFile(req.params.id, req.body);
      res.json(file);
    } catch (error) {
      console.error('[更新文件] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * DELETE /api/files/:id
   * 删除文件
   */
  async delete(req, res) {
    try {
      const existing = dao.getFile(req.params.id);
      if (!existing) return res.status(404).json({ error: '文件不存在' });

      // 清理临时文件（如果存在，按原始扩展名查找）
      const ext = (path.extname(existing.file_name) || '.pdf').toLowerCase();
      const tempPath = path.join(TEMP_DIR, `${req.params.id}${ext}`);
      try { fs.unlinkSync(tempPath); } catch (e) {}

      dao.deleteFile(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('[删除文件] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};
