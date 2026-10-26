/**
 * 认证控制器 - 处理账号密码登录相关逻辑
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const dao = require('../database/dao');
const userMgmtDao = require('../database/userMgmtDao');

function formatAuthUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone || '',
    role: user.roleCode || user.role,
    roleId: user.roleId,
    roleName: user.roleName,
    roleCode: user.roleCode || user.role,
    departmentId: user.departmentId,
    departmentName: user.departmentName,
    status: user.status
  };
}

module.exports = {
  /**
   * POST /api/auth/login
   * 账号密码登录（用户名或手机号）
   * Body: { username, password }  — username 可为用户名或手机号
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名/手机号和密码' });
      }

      const account = String(username).trim();
      const authUser = userMgmtDao.getUserAuthByAccount(account);
      if (!authUser) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      if (authUser.status === 'disabled') {
        return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
      }

      const valid = bcrypt.compareSync(password, authUser.password_hash);
      if (!valid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const user = userMgmtDao.getUserWithRelations(authUser.id);
      const roleCode = user.roleCode || authUser.role_code || authUser.role || 'user';

      // 签发 JWT（7天有效）
      const token = jwt.sign(
        { userid: user.id, name: user.name, role: roleCode },
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: formatAuthUser(user)
      });
    } catch (error) {
      console.error('登录失败:', error);
      res.status(500).json({ error: '登录失败' });
    }
  },

  /**
   * GET /api/auth/userinfo
   * 获取当前登录用户信息
   */
  async userinfo(req, res) {
    try {
      const user = userMgmtDao.getUserWithRelations(req.user.userid);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      if (user.status === 'disabled') {
        return res.status(403).json({ error: '账号已被禁用' });
      }
      res.json(formatAuthUser(user));
    } catch (error) {
      console.error('获取用户信息失败:', error);
      res.status(500).json({ error: '获取用户信息失败' });
    }
  },

  /**
   * PUT /api/auth/change-password
   * 修改密码
   * Body: { oldPassword, newPassword }
   */
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '请输入旧密码和新密码' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码至少 6 位' });
      }

      const userInfo = userMgmtDao.getUserWithRelations(req.user.userid);
      if (!userInfo) {
        return res.status(404).json({ error: '用户不存在' });
      }

      const fullUser = userMgmtDao.getUserAuthByUsername(userInfo.username);
      if (!fullUser || !bcrypt.compareSync(oldPassword, fullUser.password_hash)) {
        return res.status(401).json({ error: '旧密码不正确' });
      }

      const hash = bcrypt.hashSync(newPassword, 10);
      userMgmtDao.resetUserPassword(req.user.userid, hash);
      res.json({ message: '密码修改成功' });
    } catch (error) {
      console.error('修改密码失败:', error);
      res.status(500).json({ error: '修改密码失败' });
    }
  }
};
