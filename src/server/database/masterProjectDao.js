/**
 * 工程项目（master_projects）数据访问对象
 *
 * 注意：master_projects 是“业主的立项工程”，只用于把归档项目（projects）分组，
 * 不代表本公司承接的业务对象。业务主对象始终是 projects。
 */
const { getDatabase } = require('./init');
const { buildSearchCondition } = require('../utils/searchQuery');

function getDb() {
  const db = getDatabase();
  if (!db) {
    throw new Error('数据库未初始化，请检查 better-sqlite3 是否正确安装');
  }
  db.pragma('foreign_keys = ON');
  return db;
}

function mapMasterProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    projectNo: row.project_no || '',
    ownerName: row.owner_name || '',
    ownerCreditCode: row.owner_credit_code || '',
    region: row.region || '',
    industry: row.industry || '',
    totalInvestment: row.total_investment === null || row.total_investment === undefined
      ? null
      : Number(row.total_investment),
    constructionScale: row.construction_scale || '',
    manager: row.manager || '',
    status: row.status || 'active',
    remark: row.remark || '',
    createdBy: row.created_by || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archiveCount: row.archive_count === undefined ? undefined : Number(row.archive_count) || 0
  };
}

/**
 * 按工程项目汇总归档项目数量（按服务类型 code 分组）
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} [masterProjectIds] - 为空时统计全部
 * @returns {Map<string, {tender:number,cost:number,consult:number,total:number}>}
 */
function loadCategoryCounts(db, masterProjectIds = []) {
  const params = [];
  let where = 'p.master_project_id IS NOT NULL';
  if (Array.isArray(masterProjectIds) && masterProjectIds.length > 0) {
    where += ` AND p.master_project_id IN (${masterProjectIds.map(() => '?').join(', ')})`;
    params.push(...masterProjectIds);
  }
  const rows = db.prepare(`
    SELECT p.master_project_id AS master_project_id, c.code AS category_code, COUNT(*) AS cnt
    FROM projects p
    LEFT JOIN project_categories c ON c.id = p.category_id
    WHERE ${where}
    GROUP BY p.master_project_id, c.code
  `).all(...params);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.master_project_id)) {
      map.set(row.master_project_id, { tender: 0, cost: 0, consult: 0, total: 0 });
    }
    const item = map.get(row.master_project_id);
    const code = row.category_code || 'tender';
    if (item[code] === undefined) item[code] = 0;
    item[code] += Number(row.cnt) || 0;
    item.total += Number(row.cnt) || 0;
  }
  return map;
}

/**
 * 工程项目列表
 * @param {Object} options
 * @returns {{ items: Array, total: number, page: number, pageSize: number }}
 */
function listMasterProjects({
  page = 1,
  pageSize = 20,
  search = '',
  ownerName = '',
  year = '',
  status = ''
} = {}) {
  const db = getDb();
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(Math.max(1, Number(pageSize) || 20), 500);
  const offset = (safePage - 1) * safeSize;

  const conditions = [];
  const params = [];

  if (search) {
    const sc = buildSearchCondition(search, ['mp.name', 'mp.project_no', 'mp.owner_name']);
    if (sc) {
      conditions.push(sc.condition);
      params.push(...sc.params);
    }
  }
  if (ownerName) {
    conditions.push('mp.owner_name = ?');
    params.push(String(ownerName));
  }
  if (year) {
    conditions.push("strftime('%Y', mp.created_at) = ?");
    params.push(String(year));
  }
  if (status) {
    conditions.push('mp.status = ?');
    params.push(String(status));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM master_projects mp ${whereClause}`).get(...params).cnt;

  const rows = db.prepare(`
    SELECT mp.*,
      (SELECT COUNT(*) FROM projects p WHERE p.master_project_id = mp.id) AS archive_count
    FROM master_projects mp
    ${whereClause}
    ORDER BY mp.updated_at DESC, mp.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeSize, offset);

  const categoryCounts = loadCategoryCounts(db, rows.map((r) => r.id));
  const items = rows.map((row) => {
    const mapped = mapMasterProject(row);
    mapped.categoryCounts = categoryCounts.get(row.id) || { tender: 0, cost: 0, consult: 0, total: 0 };
    return mapped;
  });

  return { items, total, page: safePage, pageSize: safeSize };
}

/**
 * 归档流程内联选择器搜索：最多返回 5 条
 * @param {{ q?: string, limit?: number }} options
 */
function searchMasterProjects({ q = '', limit = 5 } = {}) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 20);
  const keyword = String(q || '').trim();
  if (!keyword) return { items: [] };

  const sc = buildSearchCondition(keyword, ['mp.name', 'mp.project_no', 'mp.owner_name']);
  if (!sc) return { items: [] };

  const rows = db.prepare(`
    SELECT mp.*,
      (SELECT COUNT(*) FROM projects p WHERE p.master_project_id = mp.id) AS archive_count
    FROM master_projects mp
    WHERE ${sc.condition}
    ORDER BY archive_count DESC, mp.updated_at DESC
    LIMIT ?
  `).all(...sc.params, safeLimit);

  const categoryCounts = loadCategoryCounts(db, rows.map((r) => r.id));
  const items = rows.map((row) => {
    const mapped = mapMasterProject(row);
    mapped.categoryCounts = categoryCounts.get(row.id) || { tender: 0, cost: 0, consult: 0, total: 0 };
    return mapped;
  });
  return { items };
}

/**
 * 单个工程项目
 * @param {string} id
 */
function getMasterProject(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT mp.*,
      (SELECT COUNT(*) FROM projects p WHERE p.master_project_id = mp.id) AS archive_count
    FROM master_projects mp
    WHERE mp.id = ?
  `).get(id);
  if (!row) return null;
  const mapped = mapMasterProject(row);
  mapped.categoryCounts = loadCategoryCounts(db, [row.id]).get(row.id)
    || { tender: 0, cost: 0, consult: 0, total: 0 };
  return mapped;
}

/**
 * 工程项目详情：含归属归档列表与状态计数
 * @param {string} id
 */
function getMasterProjectDetail(id) {
  const db = getDb();
  const master = getMasterProject(id);
  if (!master) return null;

  const projects = db.prepare(`
    SELECT p.id, p.name, p.project_no, p.status, p.updated_at,
      p.created_by, p.created_by_name, p.owner_name_snapshot,
      c.code AS category_code, c.name AS category_name
    FROM projects p
    LEFT JOIN project_categories c ON c.id = p.category_id
    WHERE p.master_project_id = ?
    ORDER BY p.updated_at DESC
  `).all(id);

  const statusCounts = { draft: 0, pending_review: 0, review_rejected: 0, pending_paper: 0, archived: 0, total: projects.length };
  for (const project of projects) {
    if (statusCounts[project.status] !== undefined) {
      statusCounts[project.status] += 1;
    }
  }

  return {
    ...master,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      projectNo: p.project_no || '',
      status: p.status,
      updatedAt: p.updated_at,
      createdBy: p.created_by || '',
      createdByName: p.created_by_name || '',
      ownerNameSnapshot: p.owner_name_snapshot || '',
      categoryCode: p.category_code || 'tender',
      categoryName: p.category_name || ''
    })),
    statusCounts
  };
}

/**
 * 生成工程项目编号：P + 年份 + 3 位流水
 * @param {string} year
 * @returns {string}
 */
function generateMasterProjectNo(year) {
  const db = getDb();
  const y = String(year || new Date().getFullYear());
  const incrementSeq = db.transaction(() => {
    const row = db.prepare('SELECT current_seq FROM master_project_no_seq WHERE year = ?').get(y);
    let seq;
    if (row) {
      seq = Number(row.current_seq) + 1;
      db.prepare('UPDATE master_project_no_seq SET current_seq = ? WHERE year = ?').run(seq, y);
    } else {
      seq = 1;
      db.prepare('INSERT INTO master_project_no_seq (year, current_seq) VALUES (?, ?)').run(y, seq);
    }
    return seq;
  });
  const seq = incrementSeq();
  return `P${y}-${String(seq).padStart(3, '0')}`;
}

/**
 * 创建工程项目
 * @param {Object} data
 * @returns {Object}
 */
function createMasterProject({
  id,
  name,
  projectNo = '',
  ownerName = '',
  ownerCreditCode = '',
  region = '',
  industry = '公路',
  totalInvestment = null,
  constructionScale = '',
  manager = '',
  status = 'active',
  remark = '',
  createdBy = '',
  createdByName = ''
}) {
  const db = getDb();
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw Object.assign(new Error('工程项目名称不能为空'), { status: 400 });
  }

  let finalProjectNo = String(projectNo || '').trim();
  if (!finalProjectNo) {
    finalProjectNo = generateMasterProjectNo(new Date().getFullYear());
  }

  const investment = totalInvestment === null || totalInvestment === undefined || totalInvestment === ''
    ? null
    : Number(totalInvestment);

  try {
    db.prepare(`
      INSERT INTO master_projects (
        id, name, project_no, owner_name, owner_credit_code, region, industry,
        total_investment, construction_scale, manager, status, remark,
        created_by, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      trimmedName,
      finalProjectNo,
      String(ownerName || ''),
      String(ownerCreditCode || ''),
      String(region || ''),
      String(industry || '公路'),
      Number.isFinite(investment) ? investment : null,
      String(constructionScale || ''),
      String(manager || ''),
      String(status || 'active'),
      String(remark || ''),
      createdBy || '',
      createdByName || ''
    );
  } catch (error) {
    if (/UNIQUE|unique/i.test(String(error.message))) {
      throw Object.assign(new Error('工程项目编号已存在，请更换编号'), { status: 409 });
    }
    throw error;
  }

  return getMasterProject(id);
}

const UPDATE_FIELDS = [
  'name', 'project_no', 'owner_name', 'owner_credit_code', 'region', 'industry',
  'total_investment', 'construction_scale', 'manager', 'status', 'remark'
];

/**
 * 更新工程项目
 * @param {string} id
 * @param {Object} data - camelCase 或 snake_case
 * @returns {Object|null}
 */
function updateMasterProject(id, data = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM master_projects WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('工程项目不存在'), { status: 404 });
  }

  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
    if (!UPDATE_FIELDS.includes(snakeKey)) continue;
    let val = value;
    if (snakeKey === 'name') {
      val = String(value || '').trim();
      if (!val) throw Object.assign(new Error('工程项目名称不能为空'), { status: 400 });
    } else if (snakeKey === 'total_investment') {
      val = value === null || value === undefined || value === '' ? null : Number(value);
      if (!Number.isFinite(val)) val = null;
    } else if (snakeKey === 'project_no') {
      val = String(value || '').trim();
    } else if (typeof value === 'string') {
      val = value;
    }
    fields.push(`${snakeKey} = ?`);
    values.push(val);
  }

  if (fields.length === 0) return getMasterProject(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  try {
    db.prepare(`UPDATE master_projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  } catch (error) {
    if (/UNIQUE|unique/i.test(String(error.message))) {
      throw Object.assign(new Error('工程项目编号已存在，请更换编号'), { status: 409 });
    }
    throw error;
  }

  return getMasterProject(id);
}

/**
 * 删除工程项目：存在归属归档时拒绝
 * @param {string} id
 */
function deleteMasterProject(id) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM master_projects WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('工程项目不存在'), { status: 404 });
  }
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM projects WHERE master_project_id = ?').get(id).cnt;
  if (Number(count) > 0) {
    throw Object.assign(new Error('该工程项目下仍有归档项目，无法删除'), { status: 409 });
  }
  db.prepare('DELETE FROM master_projects WHERE id = ?').run(id);
  return { success: true };
}

/**
 * 取工程项目简要信息（用于归档项目快照）
 * @param {string} id
 */
function getMasterProjectBrief(id) {
  const db = getDb();
  const row = db.prepare('SELECT id, name, owner_name FROM master_projects WHERE id = ?').get(id);
  return row ? { id: row.id, name: row.name, ownerName: row.owner_name || '' } : null;
}

module.exports = {
  listMasterProjects,
  searchMasterProjects,
  getMasterProject,
  getMasterProjectDetail,
  getMasterProjectBrief,
  createMasterProject,
  updateMasterProject,
  deleteMasterProject,
  generateMasterProjectNo
};