/**
 * 认证控制器 - 处理账号密码登录相关逻辑
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const dao = require('../database/dao');

module.exports = {
  /**
   * POST /api/auth/login
   * 账号密码登录
   * Body: { username, password }
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名和密码' });
      }

      const user = dao.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      // 签发 JWT（7天有效）
      const token = jwt.sign(
        { userid: user.id, name: user.name, role: user.role },
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username, name: user.name, role: user.role }
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
    const user = dao.getUserById(req.user.userid);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json(user);
  },

  /**
   * POST /api/auth/users
   * 创建用户（仅管理员）
   * Body: { username, password, name, role? }
   */
  async createUser(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可创建用户' });
      }

      const { username, password, name, role = 'user' } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ error: '用户名、密码和姓名不能为空' });
      }

      // 检查用户名是否已存在
      const existing = dao.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: '用户名已存在' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const user = dao.createUser({
        id: crypto.randomUUID(),
        username,
        passwordHash: hash,
        name,
        role
      });

      res.status(201).json({ id: user.id, username: user.username, name: user.name, role: user.role });
    } catch (error) {
      console.error('创建用户失败:', error);
      res.status(500).json({ error: '创建用户失败' });
    }
  },

  /**
   * GET /api/auth/users
   * 获取用户列表（仅管理员）
   */
  async listUsers(req, res) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '仅管理员可查看用户列表' });
    }
    const users = dao.getUsers();
    res.json(users);
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

      // 通过 id 查找完整用户信息（包含 password_hash）
      const userInfo = dao.getUserById(req.user.userid);
      if (!userInfo) {
        return res.status(404).json({ error: '用户不存在' });
      }

      const fullUser = dao.getUserByUsername(userInfo.username);
      if (!fullUser || !bcrypt.compareSync(oldPassword, fullUser.password_hash)) {
        return res.status(401).json({ error: '旧密码不正确' });
      }

      const hash = bcrypt.hashSync(newPassword, 10);
      dao.updateUserPassword(req.user.userid, hash);
      res.json({ message: '密码修改成功' });
    } catch (error) {
      console.error('修改密码失败:', error);
      res.status(500).json({ error: '修改密码失败' });
    }
  }
};
