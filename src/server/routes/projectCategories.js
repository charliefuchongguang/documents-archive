/**
 * 项目业务分类路由 - /api/project-categories/*
 */
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// 只读：列出招标/咨询/造价
router.get('/', projectController.listProjectCategories);

module.exports = router;
