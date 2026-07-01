/**
 * 项目路由 - /api/projects/*
 */
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { requireAuth } = require('../middleware/auth');

// 获取项目列表
router.get('/', projectController.listProjects);

// 创建新项目
router.post('/', projectController.createProject);

// 获取项目详情
router.get('/:id', projectController.getProject);

// 更新项目信息
router.put('/:id', projectController.updateProject);

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

module.exports = router;
