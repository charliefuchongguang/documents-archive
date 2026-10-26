/**
 * 数据访问对象 - 封装所有数据库 CRUD 操作
 * 使用 better-sqlite3 同步 API，通过单例模式管理数据库连接
 */
const path = require('path');
const { getDatabase } = require('./init');
const { buildSearchCondition } = require('../utils/searchQuery');

/**
 * 获取数据库连接（单例，委托给 init.js 管理）
 */
function getDb() {
  const db = getDatabase();
  if (!db) {
    throw new Error('数据库未初始化，请检查 better-sqlite3 是否正确安装');
  }
  // 启用外键约束（每次获取时确保启用）
  db.pragma('foreign_keys = ON');
  return db;
}

// ==================== 项目操作 ====================

/** 招标分类固定 id（创建默认 / 旧数据回填） */
const CATEGORY_TENDER_ID = 'cat_tender';
/** NAS 缺省子目录 */
const DEFAULT_NAS_FOLDER = '招标类';

/**
 * 列出全部项目业务分类（按 sort_order）
 * @returns {Array}
 */
function listProjectCategories() {
  const db = getDb();
  return db.prepare(`
    SELECT id, code, name, nas_folder, sort_order, created_at, updated_at
    FROM project_categories
    ORDER BY sort_order ASC, name ASC
  `).all();
}

/**
 * 按 id 或 code 查找分类
 * @param {string} idOrCode
 * @returns {Object|undefined}
 */
function getProjectCategory(idOrCode) {
  if (!idOrCode) return undefined;
  const db = getDb();
  return db.prepare(`
    SELECT id, code, name, nas_folder, sort_order, created_at, updated_at
    FROM project_categories
    WHERE id = ? OR code = ?
  `).get(idOrCode, idOrCode);
}

/**
 * 解析创建时的分类：优先 categoryId，其次 categoryCode，默认招标
 * @param {string} [categoryId]
 * @param {string} [categoryCode]
 * @returns {{ ok: true, category: Object } | { ok: false, error: string }}
 */
function resolveProjectCategory(categoryId, categoryCode) {
  if (categoryId) {
    const byId = getProjectCategory(categoryId);
    if (!byId) return { ok: false, error: '无效的项目分类' };
    return { ok: true, category: byId };
  }
  if (categoryCode) {
    const byCode = getProjectCategory(categoryCode);
    if (!byCode) return { ok: false, error: '无效的项目分类' };
    return { ok: true, category: byCode };
  }
  const tender = getProjectCategory(CATEGORY_TENDER_ID);
  if (!tender) return { ok: false, error: '系统缺少默认招标分类' };
  return { ok: true, category: tender };
}

/**
 * 创建项目
 * @param {Object} params - { id, name, createdBy, createdByName, departmentId, categoryId, procurementType, region, projectNo }
 * @returns {Object} 新创建的项目记录
 */
function createProject({
  id,
  name,
  createdBy,
  createdByName,
  departmentId = null,
  categoryId = CATEGORY_TENDER_ID,
  procurementType = 'G',
  region = '',
  projectNo = ''
}) {
  const db = getDb();
  const resolvedCategoryId = categoryId || CATEGORY_TENDER_ID;
  const type = ['F', 'G', 'H'].includes(procurementType) ? procurementType : 'G';
  const stmt = db.prepare(`
    INSERT INTO projects (
      id, name, status, created_by, created_by_name, updated_by, updated_by_name,
      department_id, category_id, procurement_type, region, project_no
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    name,
    createdBy,
    createdByName,
    createdBy,
    createdByName,
    departmentId || null,
    resolvedCategoryId,
    type,
    region || '',
    projectNo || ''
  );
  return getProjectWithDepartment(id);
}

/**
 * 同分类下按名称查重（可选排除自身）
 * @param {string} name
 * @param {string} categoryId
 * @param {string} [excludeId]
 * @returns {Object|undefined}
 */
function findProjectByNameInCategory(name, categoryId, excludeId) {
  const db = getDb();
  if (!name || !categoryId) return undefined;
  if (excludeId) {
    return db.prepare(`
      SELECT id, name, category_id FROM projects
      WHERE category_id = ? AND name = ? AND id != ?
    `).get(categoryId, name, excludeId);
  }
  return db.prepare(`
    SELECT id, name, category_id FROM projects
    WHERE category_id = ? AND name = ?
  `).get(categoryId, name);
}

/**
 * 获取项目详情
 * @param {string} id - 项目 ID
 * @returns {Object|undefined} 项目记录
 */
function getProject(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

/**
 * 获取项目详情（含部门、分类名称与 NAS 目录）
 * @param {string} id
 * @returns {Object|undefined}
 */
function getProjectWithDepartment(id) {
  const db = getDb();
  return db.prepare(`
    SELECT p.*,
      d.name AS department_name,
      d.sort_order AS department_sort_order,
      c.code AS category_code,
      c.name AS category_name,
      c.sort_order AS category_sort_order,
      c.nas_folder AS category_nas_folder
    FROM projects p
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN project_categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(id);
}

/**
 * 取项目 NAS 子目录（缺省招标类）
 * @param {string} projectId
 * @returns {string}
 */
function getProjectNasFolder(projectId) {
  const project = getProjectWithDepartment(projectId);
  return (project && project.category_nas_folder) || DEFAULT_NAS_FOLDER;
}

/**
 * 判断项目是否属于指定用户（当前归属人）
 * @param {Object|undefined} project
 * @param {string} userId
 * @returns {boolean}
 */
function isProjectOwner(project, userId) {
  if (!project || !userId) return false;
  return project.created_by === userId;
}

/**
 * 判断用户是否可访问项目：管理员 / 与项目所属部门相同
 * @param {Object|undefined} project
 * @param {string} userId
 * @returns {boolean}
 */
function canAccessProject(project, userId) {
  if (!project || !userId) return false;

  const userMgmtDao = require('./userMgmtDao');
  if (userMgmtDao.isPrivilegedUser(userId)) return true;

  if (!project.department_id) return false;

  const db = getDb();
  const me = db.prepare('SELECT department_id FROM users WHERE id = ?').get(userId);
  return !!(me && me.department_id && me.department_id === project.department_id);
}

/**
 * 刷新项目最后更新者
 * @param {string} projectId
 * @param {string} userId
 * @param {string} [userName]
 */
function touchProjectUpdater(projectId, userId, userName = '') {
  if (!projectId || !userId) return;
  const db = getDb();
  db.prepare(`
    UPDATE projects
    SET updated_by = ?, updated_by_name = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(userId, userName || '', projectId);
}

/**
 * 管理员调整项目所属部门与临时归属人（归档前）
 * @param {string} projectId
 * @param {Object} params
 * @returns {Object|undefined} 更新后的项目（含部门名）
 */
function reassignProjectOwnership(projectId, {
  departmentId,
  ownerUserId,
  ownerUserName,
  updatedBy,
  updatedByName
}) {
  const db = getDb();
  db.prepare(`
    UPDATE projects
    SET department_id = ?,
        created_by = ?,
        created_by_name = ?,
        updated_by = ?,
        updated_by_name = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    departmentId,
    ownerUserId,
    ownerUserName || '',
    updatedBy,
    updatedByName || '',
    projectId
  );
  return getProjectWithDepartment(projectId);
}

/** 首页状态筛选允许的值（不含 review_approved） */
const ALLOWED_FILTER_STATUSES = new Set([
  'draft', 'pending_review', 'review_rejected', 'pending_paper', 'archived'
]);

/** 首页项目类型筛选允许的 code */
const ALLOWED_CATEGORY_CODES = new Set(['tender', 'consult', 'cost']);

const { ALLOWED_REGIONS } = require('../utils/provinces');
const {
  ALLOWED_TENDER_TYPES,
  ALLOWED_PROJECT_TYPES,
  ALLOWED_ROAD_LEVELS,
  ALLOWED_INDUSTRIES,
  normalizeEnumList
} = require('../utils/projectEnums');

const PROJECT_LIST_FROM_JOIN = `
  FROM projects p
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN project_categories c ON c.id = p.category_id
  LEFT JOIN project_search_index psi ON psi.project_id = p.id
`;

/**
 * 构建项目列表/统计的基础可见范围条件
 * @param {Object} options
 * @returns {{ conditions: string[], params: unknown[] }}
 */
function buildProjectVisibilityConditions({
  isPrivileged = false,
  userId = '',
  departmentId = ''
} = {}) {
  const conditions = [];
  const params = [];

  if (!isPrivileged) {
    if (departmentId) {
      conditions.push('p.department_id = ?');
      params.push(departmentId);
    } else if (userId) {
      conditions.push('p.created_by = ?');
      params.push(userId);
    }
  }

  return { conditions, params };
}

/**
 * @param {string[]} statuses
 * @returns {string[]}
 */
function normalizeFilterStatuses(statuses) {
  if (!Array.isArray(statuses)) return [];
  return [...new Set(statuses.filter((s) => ALLOWED_FILTER_STATUSES.has(s)))];
}

/**
 * @param {string[]} categoryCodes
 * @returns {string[]}
 */
function normalizeCategoryCodes(categoryCodes) {
  if (!Array.isArray(categoryCodes)) return [];
  return [...new Set(categoryCodes.filter((c) => ALLOWED_CATEGORY_CODES.has(c)))];
}

/**
 * @param {string[]} regions
 * @returns {string[]}
 */
function normalizeRegions(regions) {
  if (!Array.isArray(regions)) return [];
  return [...new Set(regions.filter((r) => ALLOWED_REGIONS.has(r)))];
}

/** 关键词 searchField → 辅助表列（name_overview 特殊处理） */
const SEARCH_FIELD_COLUMNS = {
  projectManager: 'psi.project_manager',
  techManager: 'psi.tech_manager'
};

/**
 * @param {string|number|undefined|null} v
 * @returns {number|null}
 */
function parseOptionalNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 获取项目列表（支持分页、搜索、可见范围、分类与状态过滤、高级筛选）
 * @param {Object} options
 * @returns {Object} { items, total, page, pageSize }
 */
function getProjects({
  page = 1,
  pageSize = 20,
  search = '',
  searchField = 'name_overview',
  isPrivileged = false,
  userId = '',
  departmentId = '',
  categoryId = '',
  categoryCodes = [],
  statuses = [],
  regions = [],
  tenderTypes = [],
  projectTypes = [],
  roadLevels = [],
  industries = [],
  dateField = '',
  dateFrom = '',
  dateTo = '',
  amountField = '',
  amountMin = '',
  amountMax = '',
  mileageMin = '',
  mileageMax = ''
} = {}) {
  const db = getDb();
  try {
    require('./projectSearchIndex').ensureSearchIndexTables(db);
  } catch (e) { /* 忽略 */ }

  const offset = (page - 1) * pageSize;
  const { conditions, params } = buildProjectVisibilityConditions({
    isPrivileged,
    userId,
    departmentId
  });

  const fieldKey = searchField || 'name_overview';
  if (search) {
    let fields;
    if (fieldKey === 'name_overview') {
      fields = ['p.name', 'psi.project_overview'];
    } else if (SEARCH_FIELD_COLUMNS[fieldKey]) {
      fields = [SEARCH_FIELD_COLUMNS[fieldKey]];
    } else {
      fields = ['p.name', 'psi.project_overview'];
    }
    const searchCondition = buildSearchCondition(search, fields);
    if (searchCondition) {
      conditions.push(searchCondition.condition);
      params.push(...searchCondition.params);
    }
  }

  if (categoryId) {
    conditions.push('p.category_id = ?');
    params.push(categoryId);
  } else {
    const normalizedCategoryCodes = normalizeCategoryCodes(categoryCodes);
    if (normalizedCategoryCodes.length > 0) {
      conditions.push(`c.code IN (${normalizedCategoryCodes.map(() => '?').join(', ')})`);
      params.push(...normalizedCategoryCodes);
    }
  }

  const normalizedStatuses = normalizeFilterStatuses(statuses);
  if (normalizedStatuses.length > 0) {
    conditions.push(`p.status IN (${normalizedStatuses.map(() => '?').join(', ')})`);
    params.push(...normalizedStatuses);
  }

  const normalizedRegions = normalizeRegions(regions);
  if (normalizedRegions.length > 0) {
    conditions.push(`p.region IN (${normalizedRegions.map(() => '?').join(', ')})`);
    params.push(...normalizedRegions);
  }

  const normalizedTenderTypes = normalizeEnumList(tenderTypes, ALLOWED_TENDER_TYPES);
  if (normalizedTenderTypes.length > 0) {
    conditions.push(`psi.tender_type IN (${normalizedTenderTypes.map(() => '?').join(', ')})`);
    params.push(...normalizedTenderTypes);
  }

  const normalizedProjectTypes = normalizeEnumList(projectTypes, ALLOWED_PROJECT_TYPES);
  if (normalizedProjectTypes.length > 0) {
    conditions.push(`psi.project_type IN (${normalizedProjectTypes.map(() => '?').join(', ')})`);
    params.push(...normalizedProjectTypes);
  }

  const normalizedRoadLevels = normalizeEnumList(roadLevels, ALLOWED_ROAD_LEVELS);
  if (normalizedRoadLevels.length > 0) {
    conditions.push(`psi.road_level IN (${normalizedRoadLevels.map(() => '?').join(', ')})`);
    params.push(...normalizedRoadLevels);
  }

  const normalizedIndustries = normalizeEnumList(industries, ALLOWED_INDUSTRIES);
  if (normalizedIndustries.length > 0) {
    conditions.push(`psi.industry IN (${normalizedIndustries.map(() => '?').join(', ')})`);
    params.push(...normalizedIndustries);
  }

  // 时间范围
  const dFrom = String(dateFrom || '').trim();
  const dTo = String(dateTo || '').trim();
  if (dFrom || dTo) {
    if (dateField === 'entrustDate') {
      // 委托时间支持年/年月/年月日三级精度：按索引区间重叠判断
      if (dFrom) {
        conditions.push('psi.entrust_date_end IS NOT NULL AND psi.entrust_date_end >= ?');
        params.push(dFrom);
      }
      if (dTo) {
        conditions.push('psi.entrust_date IS NOT NULL AND psi.entrust_date <= ?');
        params.push(dTo);
      }
    } else if (dateField === 'winNoticeDate') {
      const segConds = ['s.project_id = p.id', 's.win_notice_date IS NOT NULL'];
      if (dFrom) {
        segConds.push('s.win_notice_date >= ?');
        params.push(dFrom);
      }
      if (dTo) {
        segConds.push('s.win_notice_date <= ?');
        params.push(dTo);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM project_search_segment s WHERE ${segConds.join(' AND ')})`
      );
    }
  }

  // 金额范围
  const aMin = parseOptionalNumber(amountMin);
  const aMax = parseOptionalNumber(amountMax);
  if (aMin !== null || aMax !== null) {
    if (amountField === 'winAmount') {
      const segConds = ['s.project_id = p.id', 's.win_amount IS NOT NULL'];
      if (aMin !== null) {
        segConds.push('s.win_amount >= ?');
        params.push(aMin);
      }
      if (aMax !== null) {
        segConds.push('s.win_amount <= ?');
        params.push(aMax);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM project_search_segment s WHERE ${segConds.join(' AND ')})`
      );
    } else {
      // 默认 totalInvestment
      conditions.push('psi.total_investment IS NOT NULL');
      if (aMin !== null) {
        conditions.push('psi.total_investment >= ?');
        params.push(aMin);
      }
      if (aMax !== null) {
        conditions.push('psi.total_investment <= ?');
        params.push(aMax);
      }
    }
  }

  // 里程范围
  const mMin = parseOptionalNumber(mileageMin);
  const mMax = parseOptionalNumber(mileageMax);
  if (mMin !== null || mMax !== null) {
    conditions.push('psi.mileage_km IS NOT NULL');
    if (mMin !== null) {
      conditions.push('psi.mileage_km >= ?');
      params.push(mMin);
    }
    if (mMax !== null) {
      conditions.push('psi.mileage_km <= ?');
      params.push(mMax);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as count ${PROJECT_LIST_FROM_JOIN} ${whereClause}`).get(...params).count;
  const items = db.prepare(`
    SELECT p.*,
      d.name AS department_name,
      d.sort_order AS department_sort_order,
      c.code AS category_code,
      c.name AS category_name,
      c.sort_order AS category_sort_order,
      c.nas_folder AS category_nas_folder,
      (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id AND f.has_paper = 1) AS paper_total,
      (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id AND f.has_paper = 1 AND f.paper_reviewed = 1) AS paper_confirmed
    ${PROJECT_LIST_FROM_JOIN}
    ${whereClause}
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, total, page, pageSize };
}

/**
 * 项目状态全局统计（不受搜索/分类/状态筛选影响，仅受可见范围约束）
 * @param {Object} options
 * @param {boolean} [options.isPrivileged]
 * @param {string} [options.userId]
 * @param {string} [options.departmentId]
 * @returns {{ inProgress: number, pendingReview: number, reviewRejected: number, pendingPaper: number, archived: number }}
 */
function getProjectStats({
  isPrivileged = false,
  userId = '',
  departmentId = ''
} = {}) {
  const db = getDb();
  const { conditions, params } = buildProjectVisibilityConditions({
    isPrivileged,
    userId,
    departmentId
  });
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN p.status = 'pending_review' THEN 1 ELSE 0 END) AS pending_review,
      SUM(CASE WHEN p.status = 'review_rejected' THEN 1 ELSE 0 END) AS review_rejected,
      SUM(CASE WHEN p.status = 'pending_paper' THEN 1 ELSE 0 END) AS pending_paper,
      SUM(CASE WHEN p.status = 'archived' THEN 1 ELSE 0 END) AS archived
    ${PROJECT_LIST_FROM_JOIN}
    ${whereClause}
  `).get(...params);

  return {
    inProgress: Number(row?.in_progress) || 0,
    pendingReview: Number(row?.pending_review) || 0,
    reviewRejected: Number(row?.review_rejected) || 0,
    pendingPaper: Number(row?.pending_paper) || 0,
    archived: Number(row?.archived) || 0
  };
}

/**
 * 更新项目
 * @param {string} id - 项目 ID
 * @param {Object} data - 待更新的字段（camelCase 自动转 snake_case）
 * @returns {Object} 更新后的项目记录
 */
function updateProject(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];

  const allowedFields = [
    'name', 'status', 'synced_at', 'updated_by', 'updated_by_name',
    'department_id', 'created_by', 'created_by_name',
    'review_comment', 'reviewed_by', 'reviewed_by_name', 'reviewed_at',
    'paper_reviewed_by', 'paper_reviewed_by_name', 'paper_reviewed_at', 'paper_review_comment',
    'archive_template', 'project_no', 'procurement_type', 'region'
  ];
  for (const [key, val] of Object.entries(data)) {
    // 转换 camelCase 为 snake_case
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      fields.push(`${snakeKey} = ?`);
      values.push(val);
    }
  }

  if (fields.length === 0) return getProject(id);

  const nameChanging = fields.some((f) => f.startsWith('name ='));

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  if (nameChanging) {
    try {
      require('./projectSearchIndex').rebuildProjectSearchIndex(id);
    } catch (e) {
      console.warn('[查询索引] 改名后重建失败:', e.message);
    }
    try {
      const updated = getProject(id);
      if (updated && updated.name) {
        require('./contractDao').syncProjectName(id, updated.name);
      }
    } catch (e) {
      console.warn('[合同关联] 改名后同步 project_name 失败:', e.message);
    }
  }

  return getProjectWithDepartment(id);
}

/**
 * 删除项目（级联删除关联数据）
 * @param {string} id - 项目 ID
 */
function deleteProject(id) {
  const db = getDb();
  const transaction = db.transaction(() => {
    try {
      require('./projectSearchIndex').deleteProjectSearchIndex(id);
    } catch (e) { /* 忽略 */ }
    try {
      require('./contractDao').deleteLinksByProjectId(id);
    } catch (e) { /* 忽略 */ }
    db.prepare('DELETE FROM merged_data WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM files WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
  transaction();
}

// ==================== 文件操作 ====================

/**
 * 添加文件记录
 * @param {Object} params - { id, projectId, docType, fileName, mdContent, nasPath, localPath, segmentNo, contentHash }
 * @returns {Object} 新创建的文件记录
 */
function createFile({ id, projectId, docType, fileName, mdContent, nasPath, localPath = null, segmentNo = 0, contentHash = null, folderKey = '' }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO files (id, project_id, doc_type, segment_no, file_name, md_content, status, nas_path, local_path, content_hash, folder_key)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(id, projectId, docType, segmentNo, fileName, mdContent, nasPath, localPath, contentHash, folderKey || '');
  return getFile(id);
}

/**
 * 在同一项目+分类+标段内按文件名或内容 hash 查找已存在文件
 * 优先返回同名记录，其次同 hash
 * @param {Object} params
 * @returns {Object|undefined}
 */
function findDuplicateFile({ projectId, docType, segmentNo = 0, fileName, contentHash }) {
  const db = getDb();
  const segNo = parseInt(segmentNo, 10) || 0;
  if (fileName) {
    const byName = db.prepare(`
      SELECT * FROM files
      WHERE project_id = ? AND doc_type = ? AND segment_no = ? AND file_name = ?
      ORDER BY created_at ASC LIMIT 1
    `).get(projectId, docType, segNo, fileName);
    if (byName) return byName;
  }
  if (contentHash) {
    return db.prepare(`
      SELECT * FROM files
      WHERE project_id = ? AND doc_type = ? AND segment_no = ?
        AND content_hash IS NOT NULL AND content_hash = ?
      ORDER BY created_at ASC LIMIT 1
    `).get(projectId, docType, segNo, contentHash);
  }
  return undefined;
}

/**
 * 获取文件详情
 * @param {string} id - 文件 ID
 * @returns {Object|undefined} 文件记录
 */
function getFile(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
}

/**
 * 获取项目的所有文件
 * @param {string} projectId - 项目 ID
 * @returns {Array} 文件记录列表
 */
function getFilesByProject(projectId) {
  const db = getDb();
  return db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY created_at').all(projectId);
}

/**
 * 统计指定标段及之后标段的文件数（用于阻止删除标段）
 * @param {string} projectId
 * @param {number} fromSegmentNo - 1-based
 * @returns {number}
 */
function countFilesFromSegment(projectId, fromSegmentNo) {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM files
    WHERE project_id = ? AND COALESCE(segment_no, 0) >= ?
  `).get(projectId, fromSegmentNo);
  return Number(row?.cnt) || 0;
}

/**
 * 获取项目指定标段的文件（不含 md_content）
 * @param {string} projectId
 * @param {number} segmentNo
 * @returns {Array}
 */
function getFilesByProjectAndSegment(projectId, segmentNo) {
  const db = getDb();
  return db.prepare(`
    SELECT id, project_id, doc_type, file_name, segment_no, status, nas_path, local_path, folder_key, created_at
    FROM files
    WHERE project_id = ? AND segment_no = ?
    ORDER BY created_at
  `).all(projectId, segmentNo);
}

/**
 * 批量获取多个项目的文件（不含 md_content），用于归档列表预加载附件
 * @param {string[]} projectIds
 * @returns {Array}
 */
function getFilesForProjects(projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return [];
  const db = getDb();
  const placeholders = projectIds.map(() => '?').join(', ');
  return db.prepare(`
    SELECT id, project_id, doc_type, file_name, segment_no, status, nas_path, local_path, folder_key, created_at
    FROM files
    WHERE project_id IN (${placeholders})
    ORDER BY created_at
  `).all(...projectIds);
}

/**
 * 按 ID 列表批量获取文件
 * @param {string[]} ids
 * @returns {Array}
 */
function getFilesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).all(...ids);
}

/**
 * 更新文件（提取结果、状态等）
 * @param {string} id - 文件 ID
 * @param {Object} data - 待更新的字段（camelCase 自动转 snake_case）
 * @returns {Object} 更新后的文件记录
 */
function updateFile(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];

  const allowedFields = [
    'md_content', 'extracted_data', 'status', 'nas_path', 'local_path', 'file_name',
    'error_msg', 'mineru_output_dir', 'content_hash', 'has_paper', 'paper_reviewed', 'folder_key'
  ];
  for (const [key, val] of Object.entries(data)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      fields.push(`${snakeKey} = ?`);
      // extracted_data 等对象需序列化；注意 typeof null === 'object'，不能对 null 做 stringify
      values.push(val !== null && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }

  if (fields.length === 0) return getFile(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getFile(id);
}

/**
 * 删除文件
 * @param {string} id - 文件 ID
 */
function deleteFile(id) {
  const db = getDb();
  db.prepare('DELETE FROM files WHERE id = ?').run(id);
}

/**
 * 更新文件标段号
 * @param {string} fileId - 文件 ID
 * @param {number} segmentNo - 标段编号（1-based，0 表示未分配）
 */
function updateFileSegmentNo(fileId, segmentNo) {
  const db = getDb();
  const stmt = db.prepare('UPDATE files SET segment_no = ? WHERE id = ?');
  return stmt.run(segmentNo, fileId);
}

/**
 * 提交审核时清零项目内所有含纸质文件的确认状态（has_paper 保留，待管理员重新确认）
 * @param {string} projectId
 * @returns {number} 受影响行数
 */
function resetPaperReviewedByProject(projectId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE files SET paper_reviewed = 0, updated_at = datetime('now')
    WHERE project_id = ? AND has_paper = 1
  `).run(projectId);
  return result.changes;
}

// ==================== 合并数据操作 ====================

/**
 * 保存/更新合并数据
 * @param {Object} params - { id, projectId, formData, conflicts }
 * @returns {Object} 合并数据记录
 */
function saveMergedData({ id, projectId, formData, conflicts, segmentFormData }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM merged_data WHERE project_id = ?').get(projectId);

  const formDataStr = typeof formData === 'object' ? JSON.stringify(formData) : formData;
  const conflictsStr = typeof conflicts === 'object' ? JSON.stringify(conflicts) : conflicts;
  const segmentFormDataStr = segmentFormData != null
    ? (typeof segmentFormData === 'object' ? JSON.stringify(segmentFormData) : segmentFormData)
    : null;

  if (existing) {
    if (segmentFormDataStr != null) {
      db.prepare(`
        UPDATE merged_data SET form_data = ?, conflicts = ?, segment_form_data = ?, updated_at = datetime('now')
        WHERE project_id = ?
      `).run(formDataStr, conflictsStr, segmentFormDataStr, projectId);
    } else {
      db.prepare(`
        UPDATE merged_data SET form_data = ?, conflicts = ?, updated_at = datetime('now')
        WHERE project_id = ?
      `).run(formDataStr, conflictsStr, projectId);
    }
  } else {
    db.prepare(`
      INSERT INTO merged_data (id, project_id, form_data, conflicts, segment_form_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(id || projectId, projectId, formDataStr, conflictsStr, segmentFormDataStr);
  }

  // 同步查询辅助表
  try {
    require('./projectSearchIndex').rebuildProjectSearchIndex(projectId);
  } catch (e) {
    console.warn('[查询索引] 重建失败:', e.message);
  }

  return getMergedData(projectId);
}

/**
 * 获取合并数据
 * @param {string} projectId - 项目 ID
 * @returns {Object|undefined} 合并数据记录（form_data 和 conflicts 已解析为对象）
 */
function getMergedData(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM merged_data WHERE project_id = ?').get(projectId);
  if (row) {
    try { row.form_data = JSON.parse(row.form_data); } catch {}
    try { row.conflicts = JSON.parse(row.conflicts); } catch {}
    try { row.segment_form_data = JSON.parse(row.segment_form_data); } catch {}
  }
  return row;
}

// ==================== 用户操作 ====================

/**
 * 创建用户
 * @param {Object} params - { id, username, passwordHash, name, role }
 * @returns {Object} 新创建的用户记录
 */
function createUser({ id, username, passwordHash, name, role = 'user' }) {
  const db = getDb();
  db.prepare('INSERT INTO users (id, username, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(id, username, passwordHash, name, role);
  return getUserByUsername(username);
}

/**
 * 根据用户名获取用户（含密码哈希，仅用于认证）
 * @param {string} username
 * @returns {Object|undefined}
 */
function getUserByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * 根据 ID 获取用户信息（不含密码哈希）
 * @param {string} id
 * @returns {Object|undefined}
 */
function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(id);
}

/**
 * 获取所有用户列表
 * @returns {Array}
 */
function getUsers() {
  const db = getDb();
  return db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at').all();
}

/**
 * 删除用户
 * @param {string} id
 */
function deleteUser(id) {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/**
 * 更新用户密码
 * @param {string} id
 * @param {string} passwordHash
 */
function updateUserPassword(id, passwordHash) {
  const db = getDb();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

// ==================== 项目标段与采购类型操作 ====================

/**
 * 更新项目标段信息
 * @param {string} projectId - 项目 ID
 * @param {Array|string} segments - 标段数组（会自动序列化）
 */
function updateProjectSegments(projectId, segments) {
  const db = getDb();
  const segStr = typeof segments === 'string' ? segments : JSON.stringify(segments);
  db.prepare(`UPDATE projects SET segments = ?, updated_at = datetime('now') WHERE id = ?`).run(segStr, projectId);
}

/**
 * 获取项目标段信息
 * @param {string} projectId - 项目 ID
 * @returns {Array} 标段列表
 */
function getProjectSegments(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT segments FROM projects WHERE id = ?').get(projectId);
  if (!row || !row.segments) return [];
  try { return JSON.parse(row.segments); } catch { return []; }
}

/**
 * 更新项目采购方式
 * @param {string} projectId - 项目 ID
 * @param {string} type - 采购方式代码
 */
function updateProjectProcurementType(projectId, type) {
  const db = getDb();
  db.prepare(`UPDATE projects SET procurement_type = ?, updated_at = datetime('now') WHERE id = ?`).run(type, projectId);
}

/**
 * 获取项目采购方式
 * @param {string} projectId - 项目 ID
 * @returns {string} 采购方式代码
 */
function getProjectProcurementType(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT procurement_type FROM projects WHERE id = ?').get(projectId);
  return row ? (row.procurement_type || 'G') : 'G';
}

/**
 * 更新项目所属地域（省份）
 * @param {string} projectId - 项目 ID
 * @param {string} region - 省份名称，可为空
 */
function updateProjectRegion(projectId, region) {
  const db = getDb();
  db.prepare(`UPDATE projects SET region = ?, updated_at = datetime('now') WHERE id = ?`).run(region || '', projectId);
}

/**
 * 获取项目所属地域
 * @param {string} projectId - 项目 ID
 * @returns {string} 省份名称
 */
function getProjectRegion(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT region FROM projects WHERE id = ?').get(projectId);
  return row ? (row.region || '') : '';
}

module.exports = {
  getDb,
  CATEGORY_TENDER_ID,
  DEFAULT_NAS_FOLDER,
  listProjectCategories,
  getProjectCategory,
  resolveProjectCategory,
  createProject, getProject, getProjectWithDepartment, getProjectNasFolder, getProjects, getProjectStats, updateProject, deleteProject,
  findProjectByNameInCategory,
  isProjectOwner, canAccessProject, touchProjectUpdater, reassignProjectOwnership,
  createFile, getFile, getFilesByProject, getFilesByProjectAndSegment, getFilesForProjects, countFilesFromSegment, getFilesByIds,
  findDuplicateFile, updateFile, deleteFile, updateFileSegmentNo, resetPaperReviewedByProject,
  saveMergedData, getMergedData,
  createUser, getUserByUsername, getUserById, getUsers, deleteUser, updateUserPassword,
  updateProjectSegments, getProjectSegments, updateProjectProcurementType, getProjectProcurementType,
  updateProjectRegion, getProjectRegion
};
