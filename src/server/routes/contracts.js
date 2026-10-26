/**
 * 合同路由 - /api/contracts
 */
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { requireAdmin } = require('../middleware/auth');

// 登录用户：按合同名搜索（项目页）
router.get('/search', contractController.searchContracts);

// 管理员：搜索全部项目（须在 /:id 之前）
router.get('/projects/search', requireAdmin, contractController.searchProjectsForAdmin);

router.get('/', requireAdmin, contractController.listContracts);
router.post('/', requireAdmin, contractController.createContract);
router.get('/:id', requireAdmin, contractController.getContract);
router.put('/:id', requireAdmin, contractController.updateContract);
router.delete('/:id', requireAdmin, contractController.deleteContract);
router.put('/:id/projects', requireAdmin, contractController.saveContractProjects);

module.exports = router;
