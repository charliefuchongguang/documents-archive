/**
 * 配置模块 - 读取 .env 环境变量，导出结构化配置对象
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SERVER_ROOT = path.resolve(__dirname, '..');

/**
 * 将相对 server/ 的路径解析为绝对路径（去掉前导 /，避免落到系统根）
 * @param {string} rel
 * @param {string} fallback
 * @returns {string}
 */
function resolveServerPath(rel, fallback) {
  const raw = String(rel || fallback).trim() || fallback;
  return path.resolve(SERVER_ROOT, raw.replace(/^[/\\]+/, ''));
}

/**
 * NAS 开关：未设置视为开启；false/0/no/off 为关。
 * 开启时还需 env 非空：NAS_WEBDAV_URL、NAS_USERNAME、NAS_PASSWORD。
 * @returns {{ enabled: boolean, reason: string }}
 */
function resolveNasEnabled() {
  const flagRaw = process.env.NAS_ENABLED;
  const flagOn = flagRaw == null || flagRaw === ''
    ? true
    : !['false', '0', 'no', 'off'].includes(String(flagRaw).trim().toLowerCase());
  if (!flagOn) {
    return { enabled: false, reason: 'NAS_ENABLED 已关闭' };
  }

  const missing = ['NAS_WEBDAV_URL', 'NAS_USERNAME', 'NAS_PASSWORD'].filter(
    (key) => !String(process.env[key] || '').trim()
  );
  if (missing.length > 0) {
    return { enabled: false, reason: `缺少必填参数: ${missing.join('、')}` };
  }
  return { enabled: true, reason: '' };
}

const nasEnabled = resolveNasEnabled();

/**
 * 解析 MinerU 异步 API 根地址。
 * 兼容旧 env：MINERU_PARSE_URL 若以 /tasks 结尾则去掉后缀作为 baseUrl。
 * @returns {string}
 */
function resolveMineruBaseUrl() {
  const fromBase = (process.env.MINERU_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromBase) return fromBase;

  const parseUrl = (process.env.MINERU_PARSE_URL || '').trim().replace(/\/+$/, '');
  if (parseUrl) {
    if (/\/tasks$/i.test(parseUrl)) {
      return parseUrl.replace(/\/tasks$/i, '');
    }
    // 旧 file_parse 地址不再使用，回退默认异步基址
    if (/\/file_parse$/i.test(parseUrl)) {
      return 'http://192.168.3.6:8002';
    }
    return parseUrl;
  }
  return 'http://192.168.3.6:8002';
}

const mineruBaseUrl = resolveMineruBaseUrl();

module.exports = {
  // 服务配置
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret',

  // DeepSeek API
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  // MineRU 异步任务 API（对齐 hegui mineru：POST/GET /tasks，替换原 file_parse）
  mineru: {
    baseUrl: mineruBaseUrl,
    /** @deprecated 兼容旧引用：指向 {baseUrl}/tasks */
    parseUrl: process.env.MINERU_PARSE_URL || `${mineruBaseUrl}/tasks`,
    healthUrl: process.env.MINERU_HEALTH_URL || `${mineruBaseUrl}/health`,
    parseTimeoutMs: Number(process.env.MINERU_PARSE_TIMEOUT_MS) || 300000,
    maxConcurrent: Number(process.env.MINERU_MAX_CONCURRENT) || 2,
    pollIntervalMs: Number(process.env.MINERU_POLL_INTERVAL_MS) || 5000,
    taskTimeoutMs: Number(process.env.MINERU_TASK_TIMEOUT_MS) || 1800000,
    forceReparse: String(process.env.MINERU_FORCE_REPARSE || 'false').toLowerCase() === 'true',
    /** 文件处理队列并发（可同时等待多个 MinerU 任务；真正打 API 由 maxConcurrent 限制） */
    fileQueueConcurrency: Number(process.env.MINERU_FILE_QUEUE_CONCURRENCY) || 10,
    parseParams: {
      return_middle_json: 'false',
      return_model_output: 'false',
      return_md: 'true',
      return_images: 'false',
      end_page_id: '99999',
      parse_method: 'auto',
      start_page_id: '0',
      lang_list: 'ch',
      output_dir: process.env.MINERU_OUTPUT_DIR || '/tmp/mineru_docarchive_outputs',
      return_content_list: 'false',
      backend: 'vlm-http-client',
      table_enable: 'true',
      response_format_zip: 'true',
      formula_enable: 'true',
    },
    parseHeaders: {
      Accept: '*/*',
      Connection: 'keep-alive',
    },
  },

  // 本地存储（绝对路径，相对 server/）
  localStorage: {
    basePath: resolveServerPath(process.env.LOCAL_STORAGE_BASE_PATH, 'uploads/archives'),
    tempPath: resolveServerPath(process.env.LOCAL_STORAGE_TEMP_PATH, 'uploads/temp'),
  },

  // NAS 存储
  nas: {
    enabled: nasEnabled.enabled,
    disabledReason: nasEnabled.reason,
    webdavUrl: (process.env.NAS_WEBDAV_URL || '').trim(),
    username: (process.env.NAS_USERNAME || '').trim(),
    password: process.env.NAS_PASSWORD || '',
    basePath: process.env.NAS_BASE_PATH || '/归档文件',
    /** 上传失败最大重试次数（含首次） */
    uploadMaxRetries: Number(process.env.NAS_UPLOAD_MAX_RETRIES) || 3,
    /** 重试间隔（毫秒） */
    uploadRetryDelayMs: Number(process.env.NAS_UPLOAD_RETRY_DELAY_MS) || 5000,
  },
};
