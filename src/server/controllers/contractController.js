/**
 * 合同控制器（印花税台账，仅管理员）
 */
const contractDao = require('../database/contractDao');

function handleDaoError(res, err) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[合同]', err);
  }
  res.status(status).json({ error: err.message || '操作失败' });
}

function listContracts(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const search = String(req.query.search || '').trim();
    const result = contractDao.listContracts({
      page,
      pageSize,
      search,
      paymentOnly: req.query.paymentOnly,
      childOnly: req.query.childOnly,
      missingCredit: req.query.missingCredit
    });
    res.json(result);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function createContract(req, res) {
  try {
    const contract = contractDao.createContract({
      ...req.body,
      createdBy: req.user?.userid || '',
      createdByName: req.user?.name || ''
    });
    res.status(201).json(contract);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function getContract(req, res) {
  try {
    const detail = contractDao.getContractDetail(req.params.id, req.user?.userid);
    if (!detail) {
      return res.status(404).json({ error: '合同不存在' });
    }
    res.json(detail);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function updateContract(req, res) {
  try {
    const contract = contractDao.updateContract(req.params.id, req.body || {});
    res.json(contract);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function deleteContract(req, res) {
  try {
    const result = contractDao.deleteContract(req.params.id);
    res.json(result);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function searchContracts(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = contractDao.searchContracts({ q, limit });
    res.json(result);
  } catch (err) {
    handleDaoError(res, err);
  }
}

module.exports = {
  listContracts,
  createContract,
  getContract,
  updateContract,
  deleteContract,
  searchContracts
};
