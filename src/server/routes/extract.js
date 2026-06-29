/**
 * 信息提取路由 - /api/extract
 */
const express = require('express');
const router = express.Router();
const extractController = require('../controllers/extractController');

// 代理 DeepSeek 信息提取
router.post('/', extractController.extract);

module.exports = router;
