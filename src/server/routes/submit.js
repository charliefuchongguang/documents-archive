/**
 * 归档提交路由 - /api/submit
 */
const express = require('express');
const router = express.Router();
const submitController = require('../controllers/submitController');
const { requireAdmin } = require('../middleware/auth');

// 提交项目到归档表（登录用户即可）
router.post('/project/:id', submitController.submitProject);

// 获取归档列表（仅管理员）
router.get('/archives', requireAdmin, submitController.listArchives);

// 导出归档数据（仅管理员）
router.get('/export-excel', requireAdmin, submitController.exportArchivesExcel);

// 撤回归档 - 单条（仅管理员）
router.delete('/archive/:id', requireAdmin, submitController.undoArchive);

// 批量撤回归档（仅管理员）
router.post('/archive/undo-batch', requireAdmin, submitController.undoArchiveBatch);

module.exports = router;
