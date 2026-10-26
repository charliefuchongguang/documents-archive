/**
 * 用户管理控制器 - 部门、角色、用户 CRUD
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const userMgmtDao = require('../database/userMgmtDao');

/** 大陆手机号：1 开头共 11 位数字 */
const PHONE_RE = /^1\d{10}$/;

/**
 * 规范化并校验手机号；空串视为未填写（返回 null）
 * @returns {{ ok: true, phone: string|null } | { ok: false, error: string }}
 */
function normalizePhone(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, phone: undefined };
  }
  const phone = String(raw).trim();
  if (!phone) {
    return { ok: true, phone: null };
  }
  if (!PHONE_RE.test(phone)) {
    return { ok: false, error: '手机号格式不正确（需为 11 位大陆手机号）' };
  }
  return { ok: true, phone };
}

/**
 * 校验手机号唯一，且不与他人用户名冲突
 * @returns {string|null} 错误信息
 */
function checkPhoneConflict(phone, excludeUserId = null) {
  if (!phone) return null;
  if (userMgmtDao.getUserByPhone(phone, excludeUserId)) {
    return '手机号已被使用';
  }
  const byUsername = userMgmtDao.getUserAuthByUsername(phone);
  if (byUsername && (!excludeUserId || byUsername.id !== excludeUserId)) {
    return '手机号与已有用户名冲突';
  }
  return null;
}

function formatDepartment(row) {
  return row;
}

function formatRole(row) {
  return row;
}

function formatUser(row) {
  return row;
}

// ==================== 部门 ====================

function listDepartments(req, res) {
  try {
    const list = userMgmtDao.getDepartments();
    res.json(list.map(formatDepartment));
  } catch (error) {
    console.error('[用户管理] 获取部门列表失败:', error);
    res.status(500).json({ error: '获取部门列表失败' });
  }
}

function createDepartment(req, res) {
  try {
    const { name, description = '', sortOrder = 0 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '部门名称不能为空' });
    }
    if (userMgmtDao.getDepartmentByName(name.trim())) {
      return res.status(409).json({ error: '部门名称已存在' });
    }
    const dept = userMgmtDao.createDepartment({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      sortOrder: Number(sortOrder) || 0
    });
    res.status(201).json(formatDepartment(dept));
  } catch (error) {
    console.error('[用户管理] 创建部门失败:', error);
    res.status(500).json({ error: '创建部门失败' });
  }
}

function updateDepartment(req, res) {
  try {
    const { id } = req.params;
    const { name, description, sortOrder } = req.body;
    const existing = userMgmtDao.getDepartmentById(id);
    if (!existing) {
      return res.status(404).json({ error: '部门不存在' });
    }
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: '部门名称不能为空' });
      }
      if (userMgmtDao.getDepartmentByName(name.trim(), id)) {
        return res.status(409).json({ error: '部门名称已存在' });
      }
    }
    const dept = userMgmtDao.updateDepartment(id, {
      name: name !== undefined ? name.trim() : undefined,
      description: description !== undefined ? description.trim() : undefined,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) || 0 : undefined
    });
    res.json(formatDepartment(dept));
  } catch (error) {
    console.error('[用户管理] 更新部门失败:', error);
    res.status(500).json({ error: '更新部门失败' });
  }
}

function removeDepartment(req, res) {
  try {
    const { id } = req.params;
    const existing = userMgmtDao.getDepartmentById(id);
    if (!existing) {
      return res.status(404).json({ error: '部门不存在' });
    }
    const userCount = userMgmtDao.countUsersByDepartment(id);
    if (userCount > 0) {
      return res.status(409).json({ error: '该部门下仍有用户，请先迁移用户后再删除' });
    }
    userMgmtDao.deleteDepartment(id);
    res.json({ message: '部门已删除' });
  } catch (error) {
    console.error('[用户管理] 删除部门失败:', error);
    res.status(500).json({ error: '删除部门失败' });
  }
}

// ==================== 角色 ====================

function listRoles(req, res) {
  try {
    const list = userMgmtDao.getRoles();
    res.json(list.map(formatRole));
  } catch (error) {
    console.error('[用户管理] 获取角色列表失败:', error);
    res.status(500).json({ error: '获取角色列表失败' });
  }
}

function createRole(req, res) {
  try {
    const { name, code, description = '' } = req.body;
    if (!name || !name.trim() || !code || !code.trim()) {
      return res.status(400).json({ error: '角色名称和权限码不能为空' });
    }
    const codeNorm = code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(codeNorm)) {
      return res.status(400).json({ error: '权限码仅允许小写字母、数字和下划线，且以字母开头' });
    }
    if (userMgmtDao.getRoleByCode(codeNorm)) {
      return res.status(409).json({ error: '权限码已存在' });
    }
    const role = userMgmtDao.createRole({
      id: crypto.randomUUID(),
      name: name.trim(),
      code: codeNorm,
      description: description.trim()
    });
    res.status(201).json(formatRole(role));
  } catch (error) {
    console.error('[用户管理] 创建角色失败:', error);
    res.status(500).json({ error: '创建角色失败' });
  }
}

function updateRole(req, res) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const existing = userMgmtDao.getRoleById(id);
    if (!existing) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: '角色名称不能为空' });
    }
    const role = userMgmtDao.updateRole(id, {
      name: name !== undefined ? name.trim() : undefined,
      description: description !== undefined ? description.trim() : undefined
    });
    res.json(formatRole(role));
  } catch (error) {
    console.error('[用户管理] 更新角色失败:', error);
    res.status(500).json({ error: '更新角色失败' });
  }
}

function removeRole(req, res) {
  try {
    const { id } = req.params;
    const existing = userMgmtDao.getRoleById(id);
    if (!existing) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const userCount = userMgmtDao.countUsersByRole(id);
    if (userCount > 0) {
      return res.status(409).json({ error: '该角色下仍有用户，请先调整用户角色后再删除' });
    }
    if (existing.code === 'admin') {
      return res.status(409).json({ error: '不能删除管理员角色' });
    }
    userMgmtDao.deleteRole(id);
    res.json({ message: '角色已删除' });
  } catch (error) {
    console.error('[用户管理] 删除角色失败:', error);
    res.status(500).json({ error: '删除角色失败' });
  }
}

// ==================== 用户 ====================

function listUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const keyword = (req.query.keyword || '').trim();
    const departmentId = (req.query.departmentId || '').trim();
    const result = userMgmtDao.listUsers({ page, pageSize, keyword, departmentId });
    res.json({
      ...result,
      list: result.list.map(formatUser)
    });
  } catch (error) {
    console.error('[用户管理] 获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
}

function getUser(req, res) {
  try {
    const user = userMgmtDao.getUserWithRelations(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json(formatUser(user));
  } catch (error) {
    console.error('[用户管理] 获取用户详情失败:', error);
    res.status(500).json({ error: '获取用户详情失败' });
  }
}

function createUser(req, res) {
  try {
    const { username, password, name, phone, departmentId, roleId, status = 'active' } = req.body;
    if (!username || !password || !name || !departmentId || !roleId) {
      return res.status(400).json({ error: '用户名、密码、姓名、部门和角色不能为空' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    if (!userMgmtDao.getDepartmentById(departmentId)) {
      return res.status(400).json({ error: '所选部门不存在' });
    }
    if (!userMgmtDao.getRoleById(roleId)) {
      return res.status(400).json({ error: '所选角色不存在' });
    }
    const usernameTrim = username.trim();
    const existing = userMgmtDao.getUserAuthByUsername(usernameTrim);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    // 用户名不得占用他人手机号
    if (userMgmtDao.getUserByPhone(usernameTrim)) {
      return res.status(409).json({ error: '用户名与已有手机号冲突' });
    }

    const phoneResult = normalizePhone(phone);
    if (!phoneResult.ok) {
      return res.status(400).json({ error: phoneResult.error });
    }
    const phoneConflict = checkPhoneConflict(phoneResult.phone);
    if (phoneConflict) {
      return res.status(409).json({ error: phoneConflict });
    }

    const hash = bcrypt.hashSync(password, 10);
    const user = userMgmtDao.createManagedUser({
      id: crypto.randomUUID(),
      username: usernameTrim,
      passwordHash: hash,
      name: name.trim(),
      phone: phoneResult.phone,
      departmentId,
      roleId,
      status: status === 'disabled' ? 'disabled' : 'active'
    });
    res.status(201).json(formatUser(user));
  } catch (error) {
    console.error('[用户管理] 创建用户失败:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
}

function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, departmentId, roleId, status } = req.body;
    const existing = userMgmtDao.getUserWithRelations(id);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (departmentId !== undefined && !userMgmtDao.getDepartmentById(departmentId)) {
      return res.status(400).json({ error: '所选部门不存在' });
    }
    if (roleId !== undefined && !userMgmtDao.getRoleById(roleId)) {
      return res.status(400).json({ error: '所选角色不存在' });
    }

    let normalizedPhone;
    if (phone !== undefined) {
      const phoneResult = normalizePhone(phone);
      if (!phoneResult.ok) {
        return res.status(400).json({ error: phoneResult.error });
      }
      const phoneConflict = checkPhoneConflict(phoneResult.phone, id);
      if (phoneConflict) {
        return res.status(409).json({ error: phoneConflict });
      }
      normalizedPhone = phoneResult.phone;
    }

    // 禁止将最后一个管理员降级或禁用
    const targetRoleId = roleId !== undefined ? roleId : existing.roleId;
    const targetStatus = status !== undefined ? status : existing.status;
    const targetRole = userMgmtDao.getRoleById(targetRoleId);
    const wasAdmin = existing.roleCode === 'admin' && existing.status === 'active';
    const willBeAdmin = targetRole && targetRole.code === 'admin' && targetStatus === 'active';

    if (wasAdmin && !willBeAdmin) {
      const otherAdmins = userMgmtDao.countAdminUsers(id);
      if (otherAdmins === 0) {
        return res.status(409).json({ error: '不能移除最后一个管理员' });
      }
    }

    const user = userMgmtDao.updateManagedUser(id, {
      name: name !== undefined ? name.trim() : undefined,
      phone: normalizedPhone,
      departmentId,
      roleId,
      status: status !== undefined ? (status === 'disabled' ? 'disabled' : 'active') : undefined
    });
    res.json(formatUser(user));
  } catch (error) {
    console.error('[用户管理] 更新用户失败:', error);
    res.status(500).json({ error: '更新用户失败' });
  }
}

function removeUser(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.userid) {
      return res.status(409).json({ error: '不能删除当前登录用户' });
    }
    const existing = userMgmtDao.getUserWithRelations(id);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (existing.roleCode === 'admin') {
      const otherAdmins = userMgmtDao.countAdminUsers(id);
      if (otherAdmins === 0) {
        return res.status(409).json({ error: '不能删除最后一个管理员' });
      }
    }
    userMgmtDao.deleteManagedUser(id);
    res.json({ message: '用户已删除' });
  } catch (error) {
    console.error('[用户管理] 删除用户失败:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
}

function resetPassword(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    const existing = userMgmtDao.getUserWithRelations(id);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const hash = bcrypt.hashSync(password, 10);
    userMgmtDao.resetUserPassword(id, hash);
    res.json({ message: '密码已重置' });
  } catch (error) {
    console.error('[用户管理] 重置密码失败:', error);
    res.status(500).json({ error: '重置密码失败' });
  }
}

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  removeDepartment,
  listRoles,
  createRole,
  updateRole,
  removeRole,
  listUsers,
  getUser,
  createUser,
  updateUser,
  removeUser,
  resetPassword
};
