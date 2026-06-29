/**
 * 项目控制器 - 处理项目 CRUD 及关联数据查询
 */
const dao = require('../database/dao');

/**
 * 获取项目列表
 * GET /api/projects
 */
function listProjects(req, res) {
  try {
    const { page = 1, pageSize = 20, search = '' } = req.query;
    const result = dao.getProjects({ page: Number(page), pageSize: Number(pageSize), search });
    res.json(result);
  } catch (error) {
    console.error('[项目列表] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 创建新项目
 * POST /api/projects
 */
function createProject(req, res) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '项目名称不能为空' });

    const id = crypto.randomUUID();
    const project = dao.createProject({
      id,
      name,
      createdBy: req.user?.userid || 'unknown',
      createdByName: req.user?.name || '未知用户'
    });
    res.status(201).json(project);
  } catch (error) {
    console.error('[创建项目] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取项目详情
 * GET /api/projects/:id
 */
function getProject(req, res) {
  try {
    const project = dao.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json(project);
  } catch (error) {
    console.error('[项目详情] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 更新项目信息
 * PUT /api/projects/:id
 */
function updateProject(req, res) {
  try {
    const existing = dao.getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    const project = dao.updateProject(req.params.id, req.body);
    res.json(project);
  } catch (error) {
    console.error('[更新项目] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取项目下的文件列表
 * GET /api/projects/:id/files
 */
function listProjectFiles(req, res) {
  try {
    const files = dao.getFilesByProject(req.params.id);
    // 解析 extracted_data JSON 字符串为对象
    files.forEach(f => {
      try { f.extracted_data = JSON.parse(f.extracted_data); } catch {}
    });
    res.json(files);
  } catch (error) {
    console.error('[项目文件列表] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取项目合并后的表单数据
 * GET /api/projects/:id/merged-data
 */
function getMergedData(req, res) {
  try {
    const data = dao.getMergedData(req.params.id);
    res.json(data || { formData: {}, conflicts: {} });
  } catch (error) {
    console.error('[合并数据] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 保存项目合并后的表单数据
 * POST /api/projects/:id/merged-data
 * Body: { formData: object, conflicts?: object }
 */
function saveMergedData(req, res) {
  try {
    const existing = dao.getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    const { formData, conflicts } = req.body;
    if (!formData) return res.status(400).json({ error: '缺少 formData 参数' });

    const result = dao.saveMergedData({
      projectId: req.params.id,
      formData,
      conflicts: conflicts || {}
    });
    res.json(result);
  } catch (error) {
    console.error('[保存合并数据] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 删除项目（级联删除关联数据）
 * DELETE /api/projects/:id
 */
function deleteProject(req, res) {
  try {
    const existing = dao.getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    dao.deleteProject(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[删除项目] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  listProjectFiles,
  getMergedData,
  saveMergedData,
  deleteProject,
};
