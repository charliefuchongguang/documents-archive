/**
 * 工程项目路由 - /api/master-projects
 * 工程项目是业主的立项工程，仅用于归档项目分组。
 */
const express = require('express');
const router = express.Router();
const masterProjectController = require('../controllers/masterProjectController');
const { requireAdmin } = require('../middleware/auth');

// 搜索（归档流程内联选择器，须在 /:id 之前）
router.get('/search', masterProjectController.searchMasterProjects);

router.get('/', masterProjectController.listMasterProjects);
router.post('/', masterProjectController.createMasterProject);
router.get('/:id', masterProjectController.getMasterProject);
router.put('/:id', masterProjectController.updateMasterProject);
router.delete('/:id', requireAdmin, masterProjectController.deleteMasterProject);

module.exports = router;