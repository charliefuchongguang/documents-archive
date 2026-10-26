/**
 * 合同控制器
 */
const contractDao = require('../database/contractDao');
const dao = require('../database/dao');
const { checkProjectAccess, respondProjectAccessCheck } = require('../utils/projectAuth');
const { isProjectLocked } = require('../utils/projectStatus');

function handleDaoError(res, err) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[合同]', err);
  }
  res.status(status).json({ error: err.message || '操作失败' });
}

function requireAccessibleProject(req, res, projectId) {
  const project = dao.getProject(projectId);
  const result = checkProjectAccess(project, req.user?.userid);
  if (!respondProjectAccessCheck(res, result)) return null;
  return project;
}

function listContracts(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const search = String(req.query.search || '').trim();
    const searchType = req.query.searchType === 'project' ? 'project' : 'contract';
    const result = contractDao.listContracts({
      page,
      pageSize,
      search,
      searchType,
      anchorOnly: req.query.anchorOnly,
      paymentOnly: req.query.paymentOnly,
      childOnly: req.query.childOnly,
      linkStatus: String(req.query.linkStatus || '').trim(),
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

function saveContractProjects(req, res) {
  try {
    const projectIds = req.body.projectIds;
    const name = req.body.name;
    const detail = contractDao.saveContractProjects(req.params.id, projectIds, {
      userId: req.user?.userid,
      userName: req.user?.name || '',
      name
    });
    res.json(detail);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function searchProjectsForAdmin(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const excludeContractId = String(req.query.excludeContractId || '').trim();
    const result = contractDao.searchProjectsForAdmin({ q, page, pageSize, excludeContractId });
    res.json(result);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function searchContracts(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = parseInt(req.query.limit, 10) || 20;
    const anchorOnly = req.query.anchorOnly === undefined
      ? true
      : !['0', 'false', 'no'].includes(String(req.query.anchorOnly).toLowerCase());
    const result = contractDao.searchContracts({ q, limit, anchorOnly });
    res.json(result);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function getProjectContracts(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    const items = contractDao.getProjectContracts(project.id, req.user?.userid || '');
    res.json({
      items,
      canEdit: !isProjectLocked(project.status)
    });
  } catch (err) {
    handleDaoError(res, err);
  }
}

function addProjectContract(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    if (isProjectLocked(project.status)) {
      return res.status(409).json({ error: '当前项目状态无法修改合同关联' });
    }
    const contractId = String(req.body.contractId || '').trim();
    if (!contractId) {
      return res.status(400).json({ error: '请选择合同' });
    }
    const link = contractDao.addProjectContract(project.id, contractId, {
      userId: req.user?.userid,
      userName: req.user?.name || ''
    });
    res.status(201).json(link);
  } catch (err) {
    handleDaoError(res, err);
  }
}

function removeProjectContract(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    if (isProjectLocked(project.status)) {
      return res.status(409).json({ error: '当前项目状态无法修改合同关联' });
    }
    const result = contractDao.removeProjectContract(
      req.params.linkId,
      project.id,
      req.user?.userid || ''
    );
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
  saveContractProjects,
  searchProjectsForAdmin,
  searchContracts,
  getProjectContracts,
  addProjectContract,
  removeProjectContract
};
