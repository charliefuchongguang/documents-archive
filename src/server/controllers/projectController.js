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

    // 已归档项目数据不允许修改
    if (existing.status === 'archived') {
      return res.status(409).json({ error: '已归档项目数据无法修改' });
    }

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
 * 更新标段配置
 * PUT /api/projects/:id/segments
 * Body: { segments: [{name: "第一标段"}, {name: "第二标段"}] }
 */
function updateSegments(req, res) {
  try {
    const { id } = req.params;
    const existing = dao.getProject(id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    const { segments } = req.body;
    if (!Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments 必须为数组' });
    }
    dao.updateProjectSegments(id, segments);
    res.json({ success: true });
  } catch (error) {
    console.error('[更新标段] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取项目标段配置
 * GET /api/projects/:id/segments
 */
function getSegments(req, res) {
  try {
    const { id } = req.params;
    const segments = dao.getProjectSegments(id);
    res.json({ success: true, segments });
  } catch (error) {
    console.error('[获取标段] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 更新采购内容类型
 * PUT /api/projects/:id/procurement-type
 * Body: { procurementType: 'F' | 'G' | 'H' }
 */
function updateProcurementType(req, res) {
  try {
    const { id } = req.params;
    const existing = dao.getProject(id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    const { procurementType } = req.body;
    if (!procurementType) {
      return res.status(400).json({ error: '缺少 procurementType 参数' });
    }
    dao.updateProjectProcurementType(id, procurementType);
    res.json({ success: true });
  } catch (error) {
    console.error('[更新采购类型] 失败:', error.message);
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
  updateSegments,
  getSegments,
  updateProcurementType,
};
