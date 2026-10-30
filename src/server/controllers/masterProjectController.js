/**
 * 工程项目控制器（业主立项工程，仅用于归档分组）
 */
const crypto = require('crypto');
const masterProjectDao = require('../database/masterProjectDao');
const userMgmtDao = require('../database/userMgmtDao');

function handleError(res, err) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[工程项目]', err);
  }
  res.status(status).json({ error: err.message || '操作失败' });
}

function isAdmin(userId) {
  try {
    return !!userId && userMgmtDao.isUserAdmin(userId);
  } catch (e) {
    return false;
  }
}

function listMasterProjects(req, res) {
  try {
    const result = masterProjectDao.listMasterProjects({
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20,
      search: String(req.query.search || '').trim(),
      ownerName: String(req.query.ownerName || '').trim(),
      year: String(req.query.year || '').trim(),
      status: String(req.query.status || '').trim()
    });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

function searchMasterProjects(req, res) {
  try {
    const result = masterProjectDao.searchMasterProjects({
      q: String(req.query.q || '').trim(),
      limit: parseInt(req.query.limit, 10) || 5
    });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

function getMasterProject(req, res) {
  try {
    const detail = masterProjectDao.getMasterProjectDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: '工程项目不存在' });
    }
    res.json(detail);
  } catch (err) {
    handleError(res, err);
  }
}

function createMasterProject(req, res) {
  try {
    const userId = req.user?.userid;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: '工程项目名称不能为空' });

    const created = masterProjectDao.createMasterProject({
      id: crypto.randomUUID(),
      name,
      projectNo: body.projectNo ?? body.project_no ?? '',
      ownerName: body.ownerName ?? body.owner_name ?? '',
      ownerCreditCode: body.ownerCreditCode ?? body.owner_credit_code ?? '',
      region: body.region ?? '',
      industry: body.industry ?? '公路',
      totalInvestment: body.totalInvestment ?? body.total_investment ?? null,
      constructionScale: body.constructionScale ?? body.construction_scale ?? '',
      manager: body.manager ?? '',
      status: body.status ?? 'active',
      remark: body.remark ?? '',
      createdBy: userId,
      createdByName: req.user?.name || ''
    });
    res.status(201).json(created);
  } catch (err) {
    handleError(res, err);
  }
}

function updateMasterProject(req, res) {
  try {
    const userId = req.user?.userid;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const existing = masterProjectDao.getMasterProject(req.params.id);
    if (!existing) return res.status(404).json({ error: '工程项目不存在' });
    if (!isAdmin(userId) && existing.createdBy !== userId) {
      return res.status(403).json({ error: '仅创建人或管理员可编辑该工程项目' });
    }
    const updated = masterProjectDao.updateMasterProject(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
}

function deleteMasterProject(req, res) {
  try {
    const result = masterProjectDao.deleteMasterProject(req.params.id);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  listMasterProjects,
  searchMasterProjects,
  getMasterProject,
  createMasterProject,
  updateMasterProject,
  deleteMasterProject
};