/**
 * 数据访问对象 - 封装所有数据库 CRUD 操作
 * 使用 better-sqlite3 同步 API，通过单例模式管理数据库连接
 */
const path = require('path');
const { getDatabase } = require('./init');

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

/**
 * 创建项目
 * @param {Object} params - { id, name, createdBy, createdByName }
 * @returns {Object} 新创建的项目记录
 */
function createProject({ id, name, createdBy, createdByName }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO projects (id, name, status, created_by, created_by_name)
    VALUES (?, ?, 'draft', ?, ?)
  `);
  stmt.run(id, name, createdBy, createdByName);
  return getProject(id);
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
 * 获取项目列表（支持分页和搜索）
 * @param {Object} options - { page, pageSize, search }
 * @returns {Object} { items, total, page, pageSize }
 */
function getProjects({ page = 1, pageSize = 20, search = '' } = {}) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE name LIKE ?';
    params.push(`%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM projects ${whereClause}`).get(...params).count;
  const items = db.prepare(`SELECT * FROM projects ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);

  return { items, total, page, pageSize };
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

  const allowedFields = ['name', 'status', 'synced_at'];
  for (const [key, val] of Object.entries(data)) {
    // 转换 camelCase 为 snake_case
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      fields.push(`${snakeKey} = ?`);
      values.push(val);
    }
  }

  if (fields.length === 0) return getProject(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProject(id);
}

/**
 * 删除项目（级联删除关联数据）
 * @param {string} id - 项目 ID
 */
function deleteProject(id) {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM merged_data WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM files WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
  transaction();
}

// ==================== 文件操作 ====================

/**
 * 添加文件记录
 * @param {Object} params - { id, projectId, docType, fileName, mdContent, nasPath }
 * @returns {Object} 新创建的文件记录
 */
function createFile({ id, projectId, docType, fileName, mdContent, nasPath }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO files (id, project_id, doc_type, file_name, md_content, status, nas_path)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, projectId, docType, fileName, mdContent, nasPath);
  return getFile(id);
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
 * 更新文件（提取结果、状态等）
 * @param {string} id - 文件 ID
 * @param {Object} data - 待更新的字段（camelCase 自动转 snake_case）
 * @returns {Object} 更新后的文件记录
 */
function updateFile(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];

  const allowedFields = ['md_content', 'extracted_data', 'status', 'nas_path', 'file_name', 'error_msg'];
  for (const [key, val] of Object.entries(data)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      fields.push(`${snakeKey} = ?`);
      // extracted_data 是 JSON 对象，需要序列化
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
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

// ==================== 合并数据操作 ====================

/**
 * 保存/更新合并数据
 * @param {Object} params - { id, projectId, formData, conflicts }
 * @returns {Object} 合并数据记录
 */
function saveMergedData({ id, projectId, formData, conflicts }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM merged_data WHERE project_id = ?').get(projectId);

  const formDataStr = typeof formData === 'object' ? JSON.stringify(formData) : formData;
  const conflictsStr = typeof conflicts === 'object' ? JSON.stringify(conflicts) : conflicts;

  if (existing) {
    db.prepare(`
      UPDATE merged_data SET form_data = ?, conflicts = ?, updated_at = datetime('now')
      WHERE project_id = ?
    `).run(formDataStr, conflictsStr, projectId);
  } else {
    db.prepare(`
      INSERT INTO merged_data (id, project_id, form_data, conflicts)
      VALUES (?, ?, ?, ?)
    `).run(id || projectId, projectId, formDataStr, conflictsStr);
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

module.exports = {
  getDb,
  createProject, getProject, getProjects, updateProject, deleteProject,
  createFile, getFile, getFilesByProject, updateFile, deleteFile,
  saveMergedData, getMergedData,
  createUser, getUserByUsername, getUserById, getUsers, deleteUser, updateUserPassword
};
