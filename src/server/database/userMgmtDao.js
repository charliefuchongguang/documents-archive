/**
 * 用户管理 DAO - 部门、角色、用户 CRUD
 */
const { getDatabase } = require('./init');

function getDb() {
  const db = getDatabase();
  if (!db) {
    throw new Error('数据库未初始化，请检查 better-sqlite3 是否正确安装');
  }
  db.pragma('foreign_keys = ON');
  return db;
}

/** 格式化用户记录（JOIN 部门与角色） */
function formatUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    phone: row.phone || '',
    role: row.role_code || row.role,
    roleId: row.role_id,
    roleName: row.role_name,
    roleCode: row.role_code,
    departmentId: row.department_id,
    departmentName: row.department_name,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const USER_SELECT = `
  SELECT u.id, u.username, u.name, u.phone, u.role, u.department_id, u.role_id, u.status,
         u.created_at, u.updated_at,
         d.name AS department_name,
         r.name AS role_name, r.code AS role_code
  FROM users u
  LEFT JOIN departments d ON u.department_id = d.id
  LEFT JOIN roles r ON u.role_id = r.id
`;

// ==================== 部门 ====================

function getDepartments() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS user_count
    FROM departments d
    ORDER BY d.sort_order, d.created_at
  `).all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    sortOrder: row.sort_order,
    userCount: row.user_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getDepartmentById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!row) return null;
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE department_id = ?').get(id);
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    sortOrder: row.sort_order,
    userCount: userCount.cnt,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getDepartmentByName(name, excludeId = null) {
  const db = getDb();
  if (excludeId) {
    return db.prepare('SELECT id FROM departments WHERE name = ? AND id != ?').get(name, excludeId);
  }
  return db.prepare('SELECT id FROM departments WHERE name = ?').get(name);
}

function createDepartment({ id, name, description = '', sortOrder = 0 }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO departments (id, name, description, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(id, name, description, sortOrder);
  return getDepartmentById(id);
}

function updateDepartment(id, { name, description, sortOrder }) {
  const db = getDb();
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(sortOrder); }
  if (fields.length === 0) return getDepartmentById(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getDepartmentById(id);
}

function deleteDepartment(id) {
  const db = getDb();
  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
}

function countUsersByDepartment(departmentId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE department_id = ?').get(departmentId).cnt;
}

// ==================== 角色 ====================

function getRoles() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
    FROM roles r
    ORDER BY r.is_system DESC, r.created_at
  `).all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || '',
    isSystem: !!row.is_system,
    userCount: row.user_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getRoleById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!row) return null;
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE role_id = ?').get(id);
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || '',
    isSystem: !!row.is_system,
    userCount: userCount.cnt,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getRoleByCode(code) {
  const db = getDb();
  return db.prepare('SELECT * FROM roles WHERE code = ?').get(code);
}

function getRoleByCodeExcludeId(code, excludeId) {
  const db = getDb();
  return db.prepare('SELECT id FROM roles WHERE code = ? AND id != ?').get(code, excludeId);
}

function createRole({ id, name, code, description = '', isSystem = 0 }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO roles (id, name, code, description, is_system)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, code, description, isSystem);
  return getRoleById(id);
}

function updateRole(id, { name, description }) {
  const db = getDb();
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (fields.length === 0) return getRoleById(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getRoleById(id);
}

function deleteRole(id) {
  const db = getDb();
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
}

function countUsersByRole(roleId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE role_id = ?').get(roleId).cnt;
}

function countAdminUsers(excludeUserId = null) {
  const db = getDb();
  if (excludeUserId) {
    return db.prepare(`
      SELECT COUNT(*) AS cnt FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.code = 'admin' AND u.id != ? AND u.status = 'active'
    `).get(excludeUserId).cnt;
  }
  return db.prepare(`
    SELECT COUNT(*) AS cnt FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.code = 'admin' AND u.status = 'active'
  `).get().cnt;
}

// ==================== 用户 ====================

function getUserWithRelations(id) {
  const db = getDb();
  const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
  return formatUserRow(row);
}

function getUserWithRelationsByUsername(username) {
  const db = getDb();
  const row = db.prepare(`${USER_SELECT} WHERE u.username = ?`).get(username);
  return formatUserRow(row);
}

function getUserAuthByUsername(username) {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, r.code AS role_code
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.username = ?
  `).get(username);
}

/** 按用户名或手机号查找认证用户 */
function getUserAuthByAccount(account) {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, r.code AS role_code
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.username = ? OR u.phone = ?
  `).get(account, account);
}

/** 按手机号查找用户（可排除指定 id，用于唯一性校验） */
function getUserByPhone(phone, excludeId = null) {
  const db = getDb();
  if (excludeId) {
    return db.prepare('SELECT * FROM users WHERE phone = ? AND id != ?').get(phone, excludeId);
  }
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

function listUsers({ page = 1, pageSize = 20, keyword = '', departmentId = '' } = {}) {
  const db = getDb();
  const conditions = ['1=1'];
  const params = [];

  if (keyword) {
    conditions.push('(u.username LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (departmentId) {
    conditions.push('u.department_id = ?');
    params.push(departmentId);
  }

  const where = conditions.join(' AND ');
  const total = db.prepare(`
    SELECT COUNT(*) AS cnt FROM users u WHERE ${where}
  `).get(...params).cnt;

  const offset = (page - 1) * pageSize;
  const rows = db.prepare(`
    ${USER_SELECT}
    WHERE ${where}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return {
    list: rows.map(formatUserRow),
    total,
    page,
    pageSize
  };
}

function createManagedUser({ id, username, passwordHash, name, phone = null, departmentId, roleId, status = 'active' }) {
  const db = getDb();
  const role = getRoleById(roleId);
  const roleCode = role ? role.code : 'user';
  db.prepare(`
    INSERT INTO users (id, username, password_hash, name, phone, role, department_id, role_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, name, phone || null, roleCode, departmentId, roleId, status);
  return getUserWithRelations(id);
}

function updateManagedUser(id, { name, phone, departmentId, roleId, status }) {
  const db = getDb();
  const fields = [];
  const params = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (phone !== undefined) { fields.push('phone = ?'); params.push(phone || null); }
  if (departmentId !== undefined) { fields.push('department_id = ?'); params.push(departmentId); }
  if (roleId !== undefined) {
    fields.push('role_id = ?');
    params.push(roleId);
    const role = getRoleById(roleId);
    if (role) {
      fields.push('role = ?');
      params.push(role.code);
    }
  }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }

  if (fields.length === 0) return getUserWithRelations(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getUserWithRelations(id);
}

function deleteManagedUser(id) {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function resetUserPassword(id, passwordHash) {
  const db = getDb();
  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
  `).run(passwordHash, id);
}

function isUserAdmin(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.code FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND u.status = 'active'
  `).get(userId);
  return row && row.code === 'admin';
}

/**
 * 非普通用户（role.code !== 'user'）：列表/统计可见全部项目
 * @param {string} userId
 * @returns {boolean}
 */
function isPrivilegedUser(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.code FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND u.status = 'active'
  `).get(userId);
  return !!(row && row.code !== 'user');
}

module.exports = {
  getDepartments,
  getDepartmentById,
  getDepartmentByName,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  countUsersByDepartment,
  getRoles,
  getRoleById,
  getRoleByCode,
  getRoleByCodeExcludeId,
  createRole,
  updateRole,
  deleteRole,
  countUsersByRole,
  countAdminUsers,
  getUserWithRelations,
  getUserWithRelationsByUsername,
  getUserAuthByUsername,
  getUserAuthByAccount,
  getUserByPhone,
  listUsers,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  resetUserPassword,
  isUserAdmin,
  isPrivilegedUser
};
