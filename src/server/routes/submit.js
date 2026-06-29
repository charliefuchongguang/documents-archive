/**
 * 数据提交路由 - /api/submit
 */
const express = require('express');
const router = express.Router();
const submitController = require('../controllers/submitController');

// 提交接口（已停用，返回410）
router.post('/', submitController.submit);

module.exports = router;
