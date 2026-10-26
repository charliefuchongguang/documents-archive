/**
 * Express 应用入口 - 启动后端服务
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./database/init');
const { requireAuth } = require('./middleware/auth');
const logger = require('./utils/logger');
const localStorage = require('./services/localStorage');

// 路由模块
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const projectCategoryRoutes = require('./routes/projectCategories');
const archiveTemplateRoutes = require('./routes/archiveTemplates');
const fileRoutes = require('./routes/files');
const extractRoutes = require('./routes/extract');
const submitRoutes = require('./routes/submit');
const contractRoutes = require('./routes/contracts');
const { deptRouter, roleRouter, userRouter } = require('./routes/userMgmt');

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
app.use('/api/project-categories', projectCategoryRoutes);
app.use('/api/archive-templates', archiveTemplateRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/extract', extractRoutes);
app.use('/api/submit', submitRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/departments', deptRouter);
app.use('/api/roles', roleRouter);
app.use('/api/users', userRouter);

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

// 初始化数据库与本地存储目录
initDatabase();
try {
  // 确保合同台账表结构在启动时就已完成迁移，便于导入脚本使用
  require('./database/contractDao').getDb();
} catch (e) {
  console.warn('[合同] 表结构初始化失败:', e.message);
}
localStorage.initLocalStorageDirs();
if (config.nas.enabled) {
  logger.info('NAS', '已启用', { webdavUrl: config.nas.webdavUrl, basePath: config.nas.basePath });
} else {
  logger.warn('NAS', `未启用: ${config.nas.disabledReason || '未知原因'}`);
}

// 启动 MinerU 全局异步队列 worker（对齐 hegui，替换原 file_parse）
const mineruWorker = require('./services/mineruWorker');
mineruWorker.start();

// 监听端口
app.listen(config.port, () => {
  console.log(`[服务] 归档管理工具后端已启动，端口: ${config.port}`);
  console.log(`[服务] 健康检查: http://localhost:${config.port}/api/health`);
});

module.exports = app;
