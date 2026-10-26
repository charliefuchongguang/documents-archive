/**
 * JWT 认证中间件
 * - 白名单路径不需要认证：POST /api/auth/login、GET /api/health
 * - 支持从 Authorization 头或 query.token 提取 JWT（后者供文件查看链接新标签页打开）
 * - 验证并解码 JWT，将 { userid, name, role } 附加到 req.user
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const userMgmtDao = require('../database/userMgmtDao');

// 不需要认证的路径（支持方法+路径精确匹配）
const PUBLIC_PATHS = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
];

/**
 * JWT 认证中间件 - 验证请求头中的 Bearer Token 或 query 参数中的 token
 */
function requireAuth(req, res, next) {
  // 跳过公开路径
  if (PUBLIC_PATHS.some((p) => req.method === p.method && req.path === p.path)) {
    return next();
  }

  // 从 Authorization 头或 query.token 提取（后者供 <a target=_blank> 查看文件）
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '令牌已过期' });
    }
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

/**
 * 管理员权限中间件（二次校验 DB 中的角色，防止 JWT 滞后）
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.userid) {
    return res.status(403).json({ error: '仅管理员可访问此功能' });
  }
  try {
    if (!userMgmtDao.isUserAdmin(req.user.userid)) {
      return res.status(403).json({ error: '仅管理员可访问此功能' });
    }
    next();
  } catch (err) {
    console.error('[认证] 管理员权限校验失败:', err);
    return res.status(500).json({ error: '权限校验失败' });
  }
}

module.exports = { requireAuth, requireAdmin };
