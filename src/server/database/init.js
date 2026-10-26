/**
 * 数据库初始化模块 - 使用 better-sqlite3 创建/打开数据库并建表
 */
const path = require('path');
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.warn('[数据库] better-sqlite3 原生模块加载失败，请确保已安装 Visual Studio 构建工具后运行 npm rebuild better-sqlite3');
  Database = null;
}

const DB_PATH = path.join(__dirname, 'archive.db');

/** @type {import('better-sqlite3').Database} */
let db = null;

/**
 * 初始化数据库，创建所有表
 * @returns {import('better-sqlite3').Database} 数据库实例
 */
function initDatabase() {
  if (!Database) {
    console.warn('[数据库] 数据库模块不可用，跳过初始化');
    return null;
  }

  try {
    db = new Database(DB_PATH);

    // 启用 WAL 模式，提升并发读写性能
    db.pragma('journal_mode = WAL');

    // 建表 SQL
    const createTables = `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        created_by TEXT,
        created_by_name TEXT,
        updated_by TEXT,
        updated_by_name TEXT,
        department_id TEXT,
        category_id TEXT,
        synced_at TEXT,
        segments TEXT DEFAULT '[]',
        procurement_type TEXT DEFAULT 'G',
        region TEXT DEFAULT '',
        project_no TEXT DEFAULT '',
        review_comment TEXT DEFAULT '',
        reviewed_by TEXT,
        reviewed_by_name TEXT,
        reviewed_at TEXT,
        paper_reviewed_by TEXT,
        paper_reviewed_by_name TEXT,
        paper_reviewed_at TEXT,
        paper_review_comment TEXT DEFAULT '',
        archive_template TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        file_name TEXT,
        md_content TEXT,
        extracted_data TEXT,
        status TEXT DEFAULT 'pending',
        error_msg TEXT,
        nas_path TEXT,
        local_path TEXT,
        mineru_output_dir TEXT,
        segment_no INTEGER DEFAULT 0,
        content_hash TEXT,
        folder_key TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS merged_data (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        form_data TEXT,
        conflicts TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS project_categories (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        nas_folder TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        is_system INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'user',
        department_id TEXT,
        role_id TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (role_id) REFERENCES roles(id)
      );

      CREATE TABLE IF NOT EXISTS project_no_seq (
        year TEXT NOT NULL,
        current_seq INTEGER DEFAULT 0,
        PRIMARY KEY (year)
      );

      CREATE TABLE IF NOT EXISTS mineru_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT,
        file_abs_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_id TEXT,
        mineru_task_id TEXT,
        queue_status TEXT NOT NULL,
        mineru_status TEXT,
        has_error INTEGER NOT NULL DEFAULT 0,
        remark TEXT,
        result_zip_path TEXT,
        result_dir_path TEXT,
        md_path TEXT,
        content_list_path TEXT,
        document_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS project_search_index (
        project_id TEXT PRIMARY KEY,
        project_overview TEXT DEFAULT '',
        tender_type TEXT DEFAULT '',
        project_type TEXT DEFAULT '',
        industry TEXT DEFAULT '',
        road_level TEXT DEFAULT '',
        project_manager TEXT DEFAULT '',
        tech_manager TEXT DEFAULT '',
        entrust_date TEXT,
        entrust_date_end TEXT,
        total_investment REAL,
        mileage_km REAL,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS project_search_segment (
        project_id TEXT NOT NULL,
        segment_no INTEGER NOT NULL DEFAULT 0,
        win_notice_date TEXT,
        win_amount REAL,
        PRIMARY KEY (project_id, segment_no),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
    `;

    db.exec(createTables);

    // MinerU 全局任务表索引（对齐 hegui mineru_tasks）
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_mineru_tasks_queue ON mineru_tasks(queue_status, created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mineru_tasks_user_hash ON mineru_tasks(user_id, content_hash)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mineru_tasks_mineru_id ON mineru_tasks(mineru_task_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mineru_tasks_file_id ON mineru_tasks(file_id)');
    } catch (e) { /* 忽略 */ }

    // 为已有表添加新列（列已存在时会报错，捕获忽略）
    const alterStatements = [
      'ALTER TABLE projects ADD COLUMN segments TEXT DEFAULT \'[]\'',
      'ALTER TABLE projects ADD COLUMN procurement_type TEXT DEFAULT \'F\'',
      'ALTER TABLE projects ADD COLUMN region TEXT DEFAULT \'\'',
      'ALTER TABLE files ADD COLUMN segment_no INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN department_id TEXT',
      'ALTER TABLE users ADD COLUMN role_id TEXT',
      'ALTER TABLE users ADD COLUMN status TEXT DEFAULT \'active\'',
      'ALTER TABLE users ADD COLUMN updated_at TEXT',
      'ALTER TABLE users ADD COLUMN phone TEXT',
      'ALTER TABLE projects ADD COLUMN updated_by TEXT',
      'ALTER TABLE projects ADD COLUMN updated_by_name TEXT',
      'ALTER TABLE projects ADD COLUMN department_id TEXT',
      'ALTER TABLE projects ADD COLUMN category_id TEXT',
      'ALTER TABLE files ADD COLUMN mineru_output_dir TEXT',
      'ALTER TABLE files ADD COLUMN content_hash TEXT',
      'ALTER TABLE files ADD COLUMN local_path TEXT',
      'ALTER TABLE projects ADD COLUMN review_comment TEXT DEFAULT \'\'',
      'ALTER TABLE projects ADD COLUMN reviewed_by TEXT',
      'ALTER TABLE projects ADD COLUMN reviewed_by_name TEXT',
      'ALTER TABLE projects ADD COLUMN reviewed_at TEXT',
      'ALTER TABLE projects ADD COLUMN paper_reviewed_by TEXT',
      'ALTER TABLE projects ADD COLUMN paper_reviewed_by_name TEXT',
      'ALTER TABLE projects ADD COLUMN paper_reviewed_at TEXT',
      'ALTER TABLE projects ADD COLUMN paper_review_comment TEXT DEFAULT \'\'',
      'ALTER TABLE projects ADD COLUMN archive_template TEXT DEFAULT \'\'',
      'ALTER TABLE projects ADD COLUMN project_no TEXT DEFAULT \'\'',
      'ALTER TABLE merged_data ADD COLUMN segment_form_data TEXT',
      'ALTER TABLE files ADD COLUMN has_paper INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE files ADD COLUMN paper_reviewed INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE files ADD COLUMN folder_key TEXT DEFAULT \'\''
    ];
    for (const sql of alterStatements) {
      try { db.exec(sql); } catch (e) { /* 列已存在，忽略 */ }
    }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_files_dedup ON files(project_id, doc_type, segment_no, file_name)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(project_id, doc_type, segment_no, content_hash)');
      // 手机号唯一（允许多个 NULL）
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
    } catch (e) { /* 忽略 */ }
    // 同分类下项目名称唯一（若历史已有同名冲突则建索引失败，仍靠接口查重）
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_category_name ON projects(category_id, name)');
    } catch (e) { /* 忽略 */ }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_psi_seg_win_date ON project_search_segment(win_notice_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_psi_seg_win_amount ON project_search_segment(win_amount)');
    } catch (e) { /* 忽略 */ }
    try {
      db.exec("UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL");
    } catch (e) { /* 忽略 */ }

    // 种子数据：默认部门与角色
    migrateUserManagementData(db);

    // 项目创建者归属迁移
    migrateProjectCreatorData(db);

    // 项目所属部门迁移
    migrateProjectDepartmentData(db);

    // 项目业务分类（招标/咨询/造价）种子与旧数据回填
    migrateProjectCategoryData(db);

    // 查询辅助表：确保存在并全量回填（可重复执行）
    migrateProjectSearchIndex(db);

    console.log('[数据库] 初始化完成，数据库路径:', DB_PATH);

    return db;
  } catch (err) {
    console.warn('[数据库] 数据库初始化失败:', err.message);
    console.warn('[数据库] 请确保已安装 Visual Studio 构建工具后运行: npm rebuild better-sqlite3');
    db = null;
    return null;
  }
}

/**
 * 用户管理模块数据迁移与种子数据
 * @param {import('better-sqlite3').Database} db
 */
function migrateUserManagementData(db) {
  const crypto = require('crypto');
  const bcrypt = require('bcryptjs');

  // 默认部门
  let defaultDept = db.prepare("SELECT id FROM departments WHERE name = '默认部门'").get();
  if (!defaultDept) {
    const deptId = crypto.randomUUID();
    db.prepare('INSERT INTO departments (id, name, description, sort_order) VALUES (?, ?, ?, ?)').run(
      deptId, '默认部门', '系统默认部门', 0
    );
    defaultDept = { id: deptId };
    console.log('[数据库] 已创建默认部门');
  }

  // 预置角色
  const roleSeeds = [
    { code: 'admin', name: '管理员', description: '系统管理员', isSystem: 1 },
    { code: 'user', name: '普通用户', description: '普通业务用户', isSystem: 1 }
  ];
  const roleIds = {};
  for (const seed of roleSeeds) {
    let row = db.prepare('SELECT id FROM roles WHERE code = ?').get(seed.code);
    if (!row) {
      const roleId = crypto.randomUUID();
      db.prepare('INSERT INTO roles (id, name, code, description, is_system) VALUES (?, ?, ?, ?, ?)').run(
        roleId, seed.name, seed.code, seed.description, seed.isSystem
      );
      roleIds[seed.code] = roleId;
    } else {
      roleIds[seed.code] = row.id;
    }
  }

  // 回填已有用户的 department_id / role_id / status
  const users = db.prepare('SELECT id, role, department_id, role_id FROM users').all();
  for (const user of users) {
    const updates = [];
    const params = [];
    if (!user.department_id) {
      updates.push('department_id = ?');
      params.push(defaultDept.id);
    }
    if (!user.role_id) {
      const code = user.role === 'admin' ? 'admin' : 'user';
      updates.push('role_id = ?');
      params.push(roleIds[code]);
    }
    if (updates.length > 0) {
      params.push(user.id);
      db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    }
  }

  // 同步 users.role 字段与 roles.code 保持一致
  db.prepare(`
    UPDATE users SET role = (
      SELECT code FROM roles WHERE roles.id = users.role_id
    ), updated_at = datetime('now')
    WHERE role_id IS NOT NULL
  `).run();

  // 检查是否存在管理员，没有则创建默认管理员
  const adminRoleId = roleIds.admin;
  const adminExists = db.prepare("SELECT id FROM users WHERE role_id = ?").get(adminRoleId);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, name, role, department_id, role_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), 'admin', hash, '管理员', 'admin', defaultDept.id, adminRoleId, 'active'
    );
    console.log('[数据库] 已创建默认管理员账号: admin / admin123');
  }
}

/**
 * 项目归属迁移：
 * - 将 creator_user_id 合并到 created_by 后删除该列
 * - 无归属项目归 admin
 * - 回填 updated_by / updated_by_name（默认等于创建者）
 * @param {import('better-sqlite3').Database} db
 */
function migrateProjectCreatorData(db) {
  const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
  const hasCreatorUserId = cols.includes('creator_user_id');
  const hasUpdatedBy = cols.includes('updated_by');

  // 若仍有 creator_user_id：优先用其回填 created_by
  if (hasCreatorUserId) {
    db.prepare(`
      UPDATE projects SET created_by = creator_user_id
      WHERE creator_user_id IS NOT NULL
        AND creator_user_id IN (SELECT id FROM users)
        AND (created_by IS NULL OR created_by = '' OR created_by = 'unknown' OR created_by != creator_user_id)
    `).run();
  }

  // 无归属项目（NULL / unknown / 无效用户）归 admin
  const admin = db.prepare(`
    SELECT u.id, u.name FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.code = 'admin'
    LIMIT 1
  `).get();

  if (admin) {
    db.prepare(`
      UPDATE projects SET created_by = ?, created_by_name = COALESCE(NULLIF(created_by_name, ''), ?)
      WHERE created_by IS NULL
        OR created_by = ''
        OR created_by = 'unknown'
        OR created_by NOT IN (SELECT id FROM users)
    `).run(admin.id, admin.name || '管理员');
  }

  // 初始化最后更新者：缺省等于创建者
  if (hasUpdatedBy) {
    db.prepare(`
      UPDATE projects
      SET updated_by = created_by,
          updated_by_name = COALESCE(NULLIF(updated_by_name, ''), created_by_name, '')
      WHERE updated_by IS NULL OR updated_by = ''
    `).run();
  }

  // 删除冗余列 creator_user_id（SQLite 3.35+）
  if (hasCreatorUserId) {
    try {
      db.exec('DROP INDEX IF EXISTS idx_projects_creator_user_id');
    } catch (e) { /* 忽略 */ }
    try {
      db.exec('ALTER TABLE projects DROP COLUMN creator_user_id');
      console.log('[数据库] 已删除 projects.creator_user_id 列');
    } catch (e) {
      console.warn('[数据库] 删除 creator_user_id 失败:', e.message);
    }
  }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by)');
  } catch (e) { /* 忽略 */ }
}

/**
 * 项目所属部门迁移：从创建者部门回填 projects.department_id
 * @param {import('better-sqlite3').Database} db
 */
function migrateProjectDepartmentData(db) {
  const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
  if (!cols.includes('department_id')) return;

  // 按创建者当前部门回填
  db.prepare(`
    UPDATE projects
    SET department_id = (
      SELECT u.department_id FROM users u WHERE u.id = projects.created_by
    )
    WHERE (department_id IS NULL OR department_id = '')
      AND created_by IN (SELECT id FROM users WHERE department_id IS NOT NULL AND department_id != '')
  `).run();

  // 仍无部门：挂到默认部门或排序最前的部门
  let fallbackDept = db.prepare("SELECT id FROM departments WHERE name = '默认部门'").get();
  if (!fallbackDept) {
    fallbackDept = db.prepare('SELECT id FROM departments ORDER BY sort_order, created_at LIMIT 1').get();
  }

  if (fallbackDept) {
    db.prepare(`
      UPDATE projects
      SET department_id = ?
      WHERE department_id IS NULL OR department_id = ''
        OR department_id NOT IN (SELECT id FROM departments)
    `).run(fallbackDept.id);
  }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_projects_department_id ON projects(department_id)');
  } catch (e) { /* 忽略 */ }
}

/** 招标分类固定 id（旧项目默认回填） */
const CATEGORY_TENDER_ID = 'cat_tender';

/**
 * 项目业务分类种子与旧数据回填
 * @param {import('better-sqlite3').Database} db
 */
function migrateProjectCategoryData(db) {
  const categorySeeds = [
    { id: 'cat_tender', code: 'tender', name: '招标', nasFolder: '招标类', sortOrder: 1 },
    { id: 'cat_consult', code: 'consult', name: '咨询', nasFolder: '咨询类', sortOrder: 2 },
    { id: 'cat_cost', code: 'cost', name: '造价', nasFolder: '造价类', sortOrder: 3 }
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO project_categories (id, code, name, nas_folder, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const seed of categorySeeds) {
    insertStmt.run(seed.id, seed.code, seed.name, seed.nasFolder, seed.sortOrder);
  }

  const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
  if (!cols.includes('category_id')) return;

  db.prepare(`
    UPDATE projects
    SET category_id = ?
    WHERE category_id IS NULL OR category_id = ''
      OR category_id NOT IN (SELECT id FROM project_categories)
  `).run(CATEGORY_TENDER_ID);

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id)');
  } catch (e) { /* 忽略 */ }
}

/**
 * 查询辅助表建表（兼容旧库）并全量回填
 * @param {import('better-sqlite3').Database} database
 */
function migrateProjectSearchIndex(database) {
  try {
    const psi = require('./projectSearchIndex');
    psi.ensureSearchIndexTables(database);
    // 临时注入：rebuild 使用 init 传入的 db（此时 dao.getDb 可能尚未就绪）
    // ensure + 全量重建通过 set 当前 db：直接在此处执行清空与写入更稳妥
    const countRow = database.prepare('SELECT COUNT(*) AS c FROM project_search_index').get();
    const mergedCount = database.prepare('SELECT COUNT(*) AS c FROM merged_data').get();
    // 索引为空或与 merged 数量明显脱节时全量重建
    if (!countRow || Number(countRow.c) === 0 || (mergedCount && Number(mergedCount.c) > Number(countRow.c))) {
      // 使用模块全量重建（依赖 getDb）；init 阶段先手动跑一遍
      database.exec('DELETE FROM project_search_segment');
      database.exec('DELETE FROM project_search_index');
      const rows = database.prepare(`
        SELECT m.project_id, m.form_data, m.segment_form_data
        FROM merged_data m
        INNER JOIN projects p ON p.id = m.project_id
      `).all();
      for (const row of rows) {
        let formData = {};
        let segmentFormData = null;
        try {
          formData = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : (row.form_data || {});
        } catch {
          formData = {};
        }
        try {
          segmentFormData = typeof row.segment_form_data === 'string'
            ? JSON.parse(row.segment_form_data || 'null')
            : row.segment_form_data;
        } catch {
          segmentFormData = null;
        }
        // 复用 write 逻辑：临时暴露或内联调用 rebuild 单条
        // 通过设置模块内 getDb 不可行；改为导出 write helper
        psi._writeForDb(database, row.project_id, formData, segmentFormData);
      }
      const after = database.prepare('SELECT COUNT(*) AS c FROM project_search_index').get();
      console.log(`[数据库] 查询辅助表已回填 ${after?.c || 0} 个项目`);
    }
  } catch (error) {
    console.warn('[数据库] 查询辅助表迁移失败:', error.message);
  }
}

/**
 * 获取数据库实例
 * @returns {import('better-sqlite3').Database} 数据库实例
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 检查数据库是否可用
 * @returns {boolean}
 */
function isAvailable() {
  return db !== null;
}

module.exports = { initDatabase, getDatabase, isAvailable };
