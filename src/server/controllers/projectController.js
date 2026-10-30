/**
 * 项目控制器 - 处理项目 CRUD 及关联数据查询
 */
const crypto = require('crypto');
const dao = require('../database/dao');
const userMgmtDao = require('../database/userMgmtDao');
const { ALLOWED_REGIONS } = require('../utils/provinces');
const {
  ALLOWED_TENDER_TYPES,
  ALLOWED_PROJECT_TYPES,
  ALLOWED_ROAD_LEVELS,
  ALLOWED_INDUSTRIES
} = require('../utils/projectEnums');
const {
  checkProjectAccess,
  respondProjectAccessCheck,
  touchUpdaterFromReq
} = require('../utils/projectAuth');
const { respondIfProjectLocked, STATUS } = require('../utils/projectStatus');
const nasArchive = require('../services/nasArchive');
const archiveTemplates = require('../config/archiveTemplates');

/**
 * 加载项目并校验访问权限，失败时已写响应
 * @returns {Object|null}
 */
function requireAccessibleProject(req, res, projectId) {
  const project = dao.getProject(projectId);
  const result = checkProjectAccess(project, req.user?.userid);
  if (!respondProjectAccessCheck(res, result)) return null;
  return project;
}

/**
 * 解析 query 中的 status 参数（支持重复参数或逗号分隔）
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function parseStatusQuery(req) {
  const raw = req.query.status;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const allowed = new Set(['draft', 'pending_review', 'review_rejected', 'pending_paper', 'archived']);
  const expanded = list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean));
  return [...new Set(expanded.filter((s) => allowed.has(s)))];
}

/**
 * 解析 query 中的 categoryCode 参数（支持重复参数或逗号分隔）
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function parseCategoryCodeQuery(req) {
  const raw = req.query.categoryCode;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const allowed = new Set(['tender', 'consult', 'cost']);
  const expanded = list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean));
  return [...new Set(expanded.filter((s) => allowed.has(s)))];
}

/**
 * 解析 query 中的 region 参数（支持重复参数或逗号分隔）
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function parseRegionQuery(req) {
  const raw = req.query.region;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const expanded = list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean));
  return [...new Set(expanded.filter((s) => ALLOWED_REGIONS.has(s)))];
}

/**
 * 解析 query 中的枚举多选参数（支持重复参数或逗号分隔）
 * @param {import('express').Request} req
 * @param {string} paramName
 * @param {Set<string>} allowed
 * @returns {string[]}
 */
function parseEnumQuery(req, paramName, allowed) {
  const raw = req.query[paramName];
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const expanded = list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean));
  return [...new Set(expanded.filter((s) => allowed.has(s)))];
}

/**
 * 解析 query 中的普通多值参数（支持重复参数或逗号分隔）
 * @param {import('express').Request} req
 * @param {string} paramName
 * @returns {string[]}
 */
function parseListQuery(req, paramName) {
  const raw = req.query[paramName];
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(
    list.flatMap((item) => String(item).split(',').map((s) => s.trim()).filter(Boolean))
  )];
}

/**
 * 获取项目列表
 * GET /api/projects
 * 非 user 角色：全部；普通用户：本部门（无部门则仅归属人项目）
 * 同时返回可见部门骨架（含无项目的部门），供前端分组展示
 */
function listProjects(req, res) {
  try {
    const { page = 1, pageSize = 20, search = '', categoryId = '' } = req.query;
    const statuses = parseStatusQuery(req);
    const categoryCodes = parseCategoryCodeQuery(req);
    const regions = parseRegionQuery(req);
    const tenderTypes = parseEnumQuery(req, 'tenderType', ALLOWED_TENDER_TYPES);
    const projectTypes = parseEnumQuery(req, 'projectType', ALLOWED_PROJECT_TYPES);
    const roadLevels = parseEnumQuery(req, 'roadLevel', ALLOWED_ROAD_LEVELS);
    const industries = parseEnumQuery(req, 'industry', ALLOWED_INDUSTRIES);
    const userId = req.user?.userid;
    const isPrivileged = userId ? userMgmtDao.isPrivilegedUser(userId) : false;
    let departmentId = '';
    let user = null;
    if (userId) {
      user = userMgmtDao.getUserWithRelations(userId);
      if (!isPrivileged) {
        departmentId = user?.departmentId || '';
      }
    }

    const listOptions = {
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      searchField: String(req.query.searchField || 'name_overview'),
      isPrivileged,
      userId,
      departmentId,
      categoryId,
      categoryCodes,
      statuses,
      regions,
      tenderTypes,
      projectTypes,
      roadLevels,
      industries,
      dateField: String(req.query.dateField || ''),
      dateFrom: String(req.query.dateFrom || ''),
      dateTo: String(req.query.dateTo || ''),
      amountField: String(req.query.amountField || 'totalInvestment'),
      amountMin: req.query.amountMin,
      amountMax: req.query.amountMax,
      mileageMin: req.query.mileageMin,
      mileageMax: req.query.mileageMax,
      masterProjectId: String(req.query.masterProjectId || '').trim(),
      years: parseListQuery(req, 'year'),
      ownerNames: parseListQuery(req, 'owner')
    };

    const result = dao.getProjects(listOptions);
    const stats = dao.getProjectStats({
      isPrivileged,
      userId,
      departmentId
    });
    const categoryCounts = dao.getProjectCategoryCounts({ isPrivileged, userId, departmentId });
    const unassignedCount = dao.countUnassignedProjects({ isPrivileged, userId, departmentId });

    // 部门骨架：privileged 全部部门；普通用户仅本部门
    let departments = [];
    if (isPrivileged) {
      departments = userMgmtDao.getDepartments().map((d) => ({
        id: d.id,
        name: d.name,
        sortOrder: d.sortOrder
      }));
    } else if (user?.departmentId) {
      departments = [{
        id: user.departmentId,
        name: user.departmentName || '未命名部门',
        sortOrder: 0
      }];
      // 尽量用部门表中的真实 sort_order
      const dept = userMgmtDao.getDepartmentById(user.departmentId);
      if (dept) {
        departments[0].name = dept.name;
        departments[0].sortOrder = dept.sortOrder;
      }
    }

    res.json({ ...result, departments, stats, categoryCounts, unassignedCount });
  } catch (error) {
    console.error('[项目列表] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 列出归档模板及目录项
 * GET /api/archive-templates
 */
function listArchiveTemplates(req, res) {
  try {
    const list = Object.values(archiveTemplates.TEMPLATES).map((t) => ({
      code: t.code,
      label: t.label,
      version: t.version,
      items: t.items.map((it) => ({
        key: it.key,
        name: it.name,
        number: it.number,
        folderName: it.folderName,
        keywords: it.keywords,
        docTypes: it.docTypes
      }))
    }));
    res.json({ version: archiveTemplates.TEMPLATE_VERSION, templates: list });
  } catch (error) {
    console.error('[归档模板列表] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 更新项目归档模板（空值表示自动）
 * PUT /api/projects/:id/archive-template
 * Body: { archiveTemplate: '' | 'tender_agency' | 'gov_procurement' | 'ppp_consult' | 'cost_consult' }
 */
function updateArchiveTemplate(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    if (respondIfProjectLocked(res, project)) return;

    const raw = req.body.archiveTemplate !== undefined ? req.body.archiveTemplate : req.body.archive_template;
    const code = String(raw || '').trim();
    if (code && !archiveTemplates.isValidTemplateCode(code)) {
      return res.status(400).json({ error: '归档模板无效' });
    }
    const updated = dao.updateProject(project.id, { archive_template: code });
    touchUpdaterFromReq(project.id, req.user);
    res.json(updated);
  } catch (error) {
    console.error('[更新归档模板] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 列出项目业务分类（招标/咨询/造价）
 * GET /api/project-categories
 */
function listProjectCategories(req, res) {
  try {
    const items = dao.listProjectCategories();
    res.json({ items });
  } catch (error) {
    console.error('[项目分类列表] 查询失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 创建新项目
 * POST /api/projects
 * Body: { name, categoryId?, categoryCode?, region, procurementType }
 * 创建时校验同分类同名、必选地域，并立即生成项目编号
 */
function createProject(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    const region = String(req.body.region || '').trim();
    const procurementType = String(req.body.procurementType || req.body.procurement_type || 'G').trim().toUpperCase();
    const masterProjectId = String(req.body.masterProjectId || req.body.master_project_id || '').trim();
    const { categoryId, categoryCode } = req.body;

    if (!name) return res.status(400).json({ error: '项目名称不能为空' });
    if (region && !ALLOWED_REGIONS.has(region)) {
      return res.status(400).json({ error: '所属地域无效' });
    }
    if (!['F', 'G', 'H'].includes(procurementType)) {
      return res.status(400).json({ error: '采购类型无效，须为 F / G / H' });
    }

    const userId = req.user?.userid;
    if (!userId) return res.status(401).json({ error: '未登录' });

    const resolved = dao.resolveProjectCategory(categoryId, categoryCode);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
    }

    let masterProject = null;
    if (masterProjectId) {
      const masterProjectDao = require('../database/masterProjectDao');
      masterProject = masterProjectDao.getMasterProjectBrief(masterProjectId);
      if (!masterProject) {
        return res.status(400).json({ error: '所属工程项目不存在' });
      }
    }

    const archiveDao = require('../database/archiveDao');
    const projectNoYear = new Date().getFullYear().toString().slice(-2);
    const projectNo = archiveDao.generateProjectNo(projectNoYear, procurementType);

    const user = userMgmtDao.getUserWithRelations(userId);
    const id = crypto.randomUUID();
    const project = dao.createProject({
      id,
      name,
      createdBy: userId,
      createdByName: req.user?.name || user?.name || '未知用户',
      departmentId: user?.departmentId || null,
      categoryId: resolved.category.id,
      procurementType,
      region,
      projectNo,
      masterProjectId: masterProject ? masterProject.id : null,
      ownerNameSnapshot: masterProject ? masterProject.ownerName : ''
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
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    const enriched = dao.getProjectWithDepartment(req.params.id) || project;
    res.json(enriched);
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
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;
    if (respondIfProjectLocked(res, project)) return;

    const payload = { ...req.body };
    // 禁止客户端伪造更新者；由服务端注入
    delete payload.updated_by;
    delete payload.updatedBy;
    delete payload.updated_by_name;
    delete payload.updatedByName;
    delete payload.created_by;
    delete payload.createdBy;
    delete payload.created_by_name;
    delete payload.createdByName;
    // 业务分类 / 项目编号创建后不可改
    delete payload.category_id;
    delete payload.categoryId;
    delete payload.category_code;
    delete payload.categoryCode;
    delete payload.project_no;
    delete payload.projectNo;
    // 地域/采购类型走专用接口（普通用户不可改，管理员可）
    delete payload.region;
    delete payload.procurement_type;
    delete payload.procurementType;

    if (payload.name !== undefined) {
      const newName = String(payload.name || '').trim();
      if (!newName) return res.status(400).json({ error: '项目名称不能为空' });
      payload.name = newName;
      if (newName !== project.name) {
        const dup = dao.findProjectByNameInCategory(newName, project.category_id, project.id);
        if (dup) {
          return res.status(409).json({ error: '同分类下已存在同名项目，请修改项目名称' });
        }
      }
    }

    if (req.user?.userid) {
      payload.updated_by = req.user.userid;
      payload.updated_by_name = req.user.name || '';
    }

    const updated = dao.updateProject(req.params.id, payload);
    res.json(updated);
  } catch (error) {
    console.error('[更新项目] 失败:', error.message);
    if (error && /UNIQUE|unique/i.test(String(error.message))) {
      return res.status(409).json({ error: '同分类下已存在同名项目，请修改项目名称' });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取项目下的文件列表
 * GET /api/projects/:id/files
 */
function listProjectFiles(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;

    const files = dao.getFilesByProject(req.params.id);
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
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;

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
    const existing = requireAccessibleProject(req, res, req.params.id);
    if (!existing) return;

    if (respondIfProjectLocked(res, existing)) return;

    const { formData, conflicts, segmentFormData } = req.body;
    if (!formData) return res.status(400).json({ error: '缺少 formData 参数' });

    const result = dao.saveMergedData({
      projectId: req.params.id,
      formData,
      conflicts: conflicts || {},
      segmentFormData: segmentFormData || null
    });
    touchUpdaterFromReq(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    console.error('[保存合并数据] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 推断被删除的标段索引（前端未传 removedIndex 时兜底）
 * @param {Array} oldSegments
 * @param {Array} newSegments
 * @returns {number}
 */
function inferRemovedSegmentIndex(oldSegments, newSegments) {
  const len = Math.min(oldSegments.length, newSegments.length);
  for (let i = 0; i < len; i++) {
    if (String(oldSegments[i]?.name || '') !== String(newSegments[i]?.name || '')) {
      return i;
    }
  }
  return newSegments.length;
}

/**
 * 更新标段配置
 * PUT /api/projects/:id/segments
 * Body: { segments: [{name: "第一标段"}, {name: "第二标段"}], removedIndex? }
 */
function updateSegments(req, res) {
  try {
    const { id } = req.params;
    const existing = requireAccessibleProject(req, res, id);
    if (!existing) return;
    if (respondIfProjectLocked(res, existing)) return;

    const { segments } = req.body;
    if (!Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments 必须为数组' });
    }

    const oldSegments = dao.getProjectSegments(id);
    if (segments.length < oldSegments.length) {
      const provided = Number(req.body.removedIndex);
      const removedIndex = Number.isInteger(provided) && provided >= 0
        ? provided
        : inferRemovedSegmentIndex(oldSegments, segments);
      const affectedCount = dao.countFilesFromSegment(id, removedIndex + 1);
      if (affectedCount > 0) {
        return res.status(409).json({
          error: `该标段或其后续标段下已有 ${affectedCount} 个文件，删除会导致标段错位，请先调整或删除相关文件`
        });
      }
    }

    dao.updateProjectSegments(id, segments);
    touchUpdaterFromReq(id, req.user);
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
    const project = requireAccessibleProject(req, res, id);
    if (!project) return;

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
    const existing = requireAccessibleProject(req, res, id);
    if (!existing) return;
    if (respondIfProjectLocked(res, existing)) return;

    // 创建后仅管理员可改采购类型（普通用户在详情页锁定）
    if (!userMgmtDao.isUserAdmin(req.user?.userid)) {
      return res.status(403).json({ error: '创建后仅管理员可修改采购类型' });
    }

    const { procurementType } = req.body;
    if (!procurementType) {
      return res.status(400).json({ error: '缺少 procurementType 参数' });
    }
    const type = String(procurementType).trim().toUpperCase();
    if (!['F', 'G', 'H'].includes(type)) {
      return res.status(400).json({ error: '采购类型无效，须为 F / G / H' });
    }
    dao.updateProjectProcurementType(id, type);
    touchUpdaterFromReq(id, req.user);
    res.json({ success: true });
  } catch (error) {
    console.error('[更新采购类型] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 更新所属地域（省份）
 * PUT /api/projects/:id/region
 * Body: { region: string } — 中国省份名称，可为空
 */
function updateRegion(req, res) {
  try {
    const { id } = req.params;
    const existing = requireAccessibleProject(req, res, id);
    if (!existing) return;
    if (respondIfProjectLocked(res, existing)) return;

    // 创建后仅管理员可改所属地域
    if (!userMgmtDao.isUserAdmin(req.user?.userid)) {
      return res.status(403).json({ error: '创建后仅管理员可修改所属地域' });
    }

    const { region } = req.body;
    if (region === undefined || region === null) {
      return res.status(400).json({ error: '缺少 region 参数' });
    }
    const regionStr = String(region).trim();
    if (regionStr && !ALLOWED_REGIONS.has(regionStr)) {
      return res.status(400).json({ error: '所属地域无效' });
    }
    dao.updateProjectRegion(id, regionStr);
    touchUpdaterFromReq(id, req.user);
    res.json({ success: true });
  } catch (error) {
    console.error('[更新所属地域] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 管理员调整项目所属部门与临时归属人（归档前提交）
 * PUT /api/projects/:id/ownership
 * Body: { departmentId: string, ownerUserId: string }
 */
function reassignOwnership(req, res) {
  try {
    const userId = req.user?.userid;
    if (!userId || !userMgmtDao.isUserAdmin(userId)) {
      return res.status(403).json({ error: '仅管理员可调整项目归属' });
    }

    const project = dao.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }
    if (project.status === 'archived' || project.status === 'pending_review') {
      return res.status(409).json({ error: '当前项目状态不可调整归属' });
    }

    const { departmentId, ownerUserId } = req.body || {};
    if (!departmentId) {
      return res.status(400).json({ error: '请选择新部门' });
    }
    if (!ownerUserId) {
      return res.status(400).json({ error: '请选择归属人' });
    }

    const dept = userMgmtDao.getDepartmentById(departmentId);
    if (!dept) {
      return res.status(400).json({ error: '所选部门不存在' });
    }

    const owner = userMgmtDao.getUserWithRelations(ownerUserId);
    if (!owner || owner.status !== 'active') {
      return res.status(400).json({ error: '所选归属人无效或已停用' });
    }
    if (owner.departmentId !== departmentId) {
      return res.status(400).json({ error: '归属人必须属于所选部门' });
    }

    const updated = dao.reassignProjectOwnership(project.id, {
      departmentId,
      ownerUserId: owner.id,
      ownerUserName: owner.name || '',
      updatedBy: userId,
      updatedByName: req.user?.name || ''
    });

    res.json(updated);
  } catch (error) {
    console.error('[调整项目归属] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 删除项目（未归档项目；清理本地暂存及历史 NAS 暂存）
 * DELETE /api/projects/:id
 */
async function deleteProject(req, res) {
  try {
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;

    if (project.status === STATUS.ARCHIVED) {
      return res.status(409).json({ error: '已归档项目请通过撤回归档删除' });
    }
    if (project.status === STATUS.PENDING_PAPER) {
      return res.status(409).json({ error: '待纸质核对项目请先完成纸质核对，或在归档记录中撤回归档' });
    }
    if (project.status === STATUS.PENDING_REVIEW) {
      return res.status(409).json({ error: '待审核项目无法删除，请先驳回审核' });
    }

    await nasArchive.cleanupProjectStoredFiles(project.id);
    dao.deleteProject(project.id);

    res.json({ success: true, message: '项目已删除' });
  } catch (error) {
    console.error('[删除项目] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 修改归档项目的工程归属
 * PATCH /api/projects/:id/master-project
 * Body: { masterProjectId: string|null, ownerNameSnapshot?: string }
 */
function changeMasterProject(req, res) {
  try {
    const userId = req.user?.userid;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const project = requireAccessibleProject(req, res, req.params.id);
    if (!project) return;

    const isAdmin = userMgmtDao.isUserAdmin(userId);
    if (!isAdmin && project.created_by !== userId) {
      return res.status(403).json({ error: '仅创建人或管理员可修改工程归属' });
    }

    const raw = req.body?.masterProjectId ?? req.body?.master_project_id;
    const masterProjectId = raw === null || raw === undefined ? '' : String(raw).trim();
    const snapshot = req.body?.ownerNameSnapshot ?? req.body?.owner_name_snapshot ?? '';

    const updated = dao.updateProjectMaster(project.id, masterProjectId || null, String(snapshot || ''));
    touchUpdaterFromReq(project.id, req.user);
    res.json(updated);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[修改工程归属] 失败:', error.message);
    res.status(status).json({ error: error.message });
  }
}

/**
 * 管理员：清空并全量重建查询辅助表
 * POST /api/projects/search-index/rebuild
 */
function rebuildSearchIndex(req, res) {
  try {
    const psi = require('../database/projectSearchIndex');
    const result = psi.rebuildAllProjectSearchIndexes();
    res.json({
      success: true,
      projectCount: result.projectCount,
      segmentCount: result.segmentCount,
      message: `已重建 ${result.projectCount} 个项目、${result.segmentCount} 条标段索引`
    });
  } catch (error) {
    console.error('[重建查询索引] 失败:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listProjects,
  listArchiveTemplates,
  updateArchiveTemplate,
  listProjectCategories,
  createProject,
  getProject,
  updateProject,
  listProjectFiles,
  getMergedData,
  saveMergedData,
  updateSegments,
  getSegments,
  updateProcurementType,
  updateRegion,
  reassignOwnership,
  changeMasterProject,
  deleteProject,
  rebuildSearchIndex,
};
