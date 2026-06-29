/**
 * JWT 认证中间件
 * - 白名单路径不需要认证：POST /api/auth/login、GET /api/health
 * - 支持从 Authorization 头提取 JWT
 * - 验证并解码 JWT，将 { userid, name, role } 附加到 req.user
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

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

  // 从 Authorization 头提取 token
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
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

module.exports = { requireAuth };
