/**
 * 归档模板路由 - /api/archive-templates
 */
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

router.get('/', projectController.listArchiveTemplates);

module.exports = router;