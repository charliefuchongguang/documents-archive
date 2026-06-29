/**
 * Express 应用入口 - 启动后端服务
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./database/init');
const { requireAuth } = require('./middleware/auth');

// 路由模块
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const fileRoutes = require('./routes/files');
const extractRoutes = require('./routes/extract');
const submitRoutes = require('./routes/submit');

// 创建 Express 实例
const app = express();

// ========== 中间件 ==========

// 跨域支持
app.use(cors());

// 解析 JSON 请求体（提高上限以支持大 Markdown 文本的提取请求）
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务（前端 HTML/JS/CSS）
const FRONTEND_DIR = path.join(__dirname, '..', 'archive-helper');
app.use(express.static(FRONTEND_DIR));

// JWT 认证中间件（公开路径在中间件内部跳过）
app.use(requireAuth);

// ========== 路由注册 ==========

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/extract', extractRoutes);
app.use('/api/submit', submitRoutes);

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== 全局错误处理中间件 ==========

app.use((err, req, res, _next) => {
  console.error('[错误]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
  });
});

// ========== 启动服务 ==========

// 初始化数据库
initDatabase();

// 监听端口
app.listen(config.port, () => {
  console.log(`[服务] 归档管理工具后端已启动，端口: ${config.port}`);
  console.log(`[服务] 健康检查: http://localhost:${config.port}/api/health`);
});

module.exports = app;
