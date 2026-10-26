/**
 * 归档提交路由 - /api/submit
 */
const express = require('express');
const router = express.Router();
const submitController = require('../controllers/submitController');
const { requireAdmin } = require('../middleware/auth');

// 提交审核（登录用户 + 项目访问权）
router.post('/project/:id/request-review', submitController.requestReview);

// 审核不通过（仅管理员）
router.post('/project/:id/reject', requireAdmin, submitController.rejectReview);

// 电子档审核通过并生成归档记录（仅管理员）
router.post('/project/:id/approve', requireAdmin, submitController.approveAndArchive);

// 完成纸质档核对（仅管理员）
router.post('/project/:id/paper-complete', requireAdmin, submitController.completePaperReview);

// 提交项目到归档表（仅管理员，待审核状态）
router.post('/project/:id', requireAdmin, submitController.submitProject);

// 获取归档列表（仅管理员）
router.get('/archives', requireAdmin, submitController.listArchives);

// 批量下载所选附件 - 分包规划（仅管理员，须在 :projectId 路由之前）
router.post('/archives/download-zip', requireAdmin, submitController.downloadArchiveZip);
router.post('/archives/download-zip-package', requireAdmin, submitController.downloadArchiveZipPackage);

// 懒加载归档项目附件（仅管理员）
router.get('/archives/:projectId/files', requireAdmin, submitController.listArchiveFiles);

// 导出归档数据（仅管理员）
router.get('/export-excel', requireAdmin, submitController.exportArchivesExcel);

// 撤回归档 - 单条（仅管理员）
router.delete('/archive/:id', requireAdmin, submitController.undoArchive);

// 批量撤回归档（仅管理员）
router.post('/archive/undo-batch', requireAdmin, submitController.undoArchiveBatch);

module.exports = router;
