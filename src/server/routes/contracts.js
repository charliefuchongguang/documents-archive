/**
 * 合同路由 - /api/contracts
 * 合同台账为管理员专属的印花税台账，与归档项目/工程项目无关联。
 */
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { requireAdmin } = require('../middleware/auth');

// 台账内部搜索（父合同选择等），仅管理员
router.get('/search', requireAdmin, contractController.searchContracts);

router.get('/', requireAdmin, contractController.listContracts);
router.post('/', requireAdmin, contractController.createContract);
router.get('/:id', requireAdmin, contractController.getContract);
router.put('/:id', requireAdmin, contractController.updateContract);
router.delete('/:id', requireAdmin, contractController.deleteContract);

module.exports = router;