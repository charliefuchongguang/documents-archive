/**
 * 配置模块 - 读取 .env 环境变量，导出结构化配置对象
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  // 服务配置
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret',

  // DeepSeek API
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  // MineRU 服务
  mineru: {
    apiUrl: process.env.MINERU_API_URL || 'http://tool.bjzcc.cn:60080',
    uploadPath: '/api/mineru/upload',
    user: process.env.MINERU_USER || 'archive_tool',
  },

  // NAS 存储
  nas: {
    webdavUrl: process.env.NAS_WEBDAV_URL || '',
    username: process.env.NAS_USERNAME || '',
    password: process.env.NAS_PASSWORD || '',
    basePath: process.env.NAS_BASE_PATH || '/归档文件',
  },
};
