/**
 * 项目路由 - /api/projects/*
 */
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// 获取项目列表
router.get('/', projectController.listProjects);

// 创建新项目
router.post('/', projectController.createProject);

// 管理员：重建查询辅助表（须在 /:id 之前）
router.post('/search-index/rebuild', requireAdmin, projectController.rebuildSearchIndex);

// 归档模板（须在 /:id 通用路由之前）
router.put('/:id/archive-template', requireAuth, projectController.updateArchiveTemplate);

// 项目合同关联（须在 /:id 通用路由之前）
const contractController = require('../controllers/contractController');
router.get('/:id/contracts', contractController.getProjectContracts);
router.post('/:id/contracts', contractController.addProjectContract);
router.delete('/:id/contracts/:linkId', contractController.removeProjectContract);

// 获取项目详情
router.get('/:id', projectController.getProject);

// 更新项目信息
router.put('/:id', projectController.updateProject);

// 删除项目（未归档）
router.delete('/:id', projectController.deleteProject);

// 管理员调整所属部门与临时归属人（须在 /:id 通用路由旁单独注册）
router.put('/:id/ownership', requireAdmin, projectController.reassignOwnership);

// 获取项目下的文件列表
router.get('/:id/files', projectController.listProjectFiles);

// 获取项目合并后的表单数据
router.get('/:id/merged-data', projectController.getMergedData);

// 保存项目合并后的表单数据
router.post('/:id/merged-data', projectController.saveMergedData);

// 保存项目标段配置
router.put('/:id/segments', requireAuth, projectController.updateSegments);

// 获取项目标段配置
router.get('/:id/segments', requireAuth, projectController.getSegments);

// 保存采购内容类型
router.put('/:id/procurement-type', requireAuth, projectController.updateProcurementType);

// 保存所属地域（省份）
router.put('/:id/region', requireAuth, projectController.updateRegion);

module.exports = router;
