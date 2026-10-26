/**
 * MinerU 异步 HTTP 客户端（对齐 hegui mineru/client.py）
 * POST /tasks、GET /tasks/{id}、GET /tasks/{id}/result
 */
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const fileTypes = require('../utils/fileTypes');

/**
 * @returns {string}
 */
function baseUrl() {
  return String(config.mineru.baseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * @returns {string}
 */
function tasksUrl() {
  return `${baseUrl()}/tasks`;
}

/**
 * @param {string} mineruTaskId
 * @returns {string}
 */
function taskStatusUrl(mineruTaskId) {
  return `${baseUrl()}/tasks/${mineruTaskId}`;
}

/**
 * @param {string} mineruTaskId
 * @returns {string}
 */
function taskResultUrl(mineruTaskId) {
  return `${baseUrl()}/tasks/${mineruTaskId}/result`;
}

/**
 * @returns {number}
 */
function httpTimeoutMs() {
  return Number(config.mineru.parseTimeoutMs) || 300000;
}

/**
 * 上传文件，返回接口 JSON（含 task_id / status）
 * 支持 PDF / 图片 / DOCX / PPTX / XLSX（由扩展名推断 MIME）
 * @param {string} filePath
 * @returns {Promise<object>}
 */
async function submitTask(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`文件不存在: ${abs}`);
  }

  const fileName = path.basename(abs);
  const contentType = fileTypes.guessMimeType(fileName);
  const parseParams = config.mineru.parseParams || {};
  const formData = new FormData();
  formData.append('files', fs.createReadStream(abs), {
    filename: fileName,
    contentType,
  });
  for (const [key, value] of Object.entries(parseParams)) {
    formData.append(key, String(value));
  }

  const headers = {
    ...formData.getHeaders(),
    ...(config.mineru.parseHeaders || {}),
  };

  const response = await fetch(tasksUrl(), {
    method: 'POST',
    body: formData,
    headers,
    timeout: httpTimeoutMs(),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`MinerU 上传响应非 JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(`MinerU 上传失败 HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error(`MinerU 上传响应非对象: ${text.slice(0, 500)}`);
  }
  return data;
}

/**
 * @param {string} mineruTaskId
 * @returns {Promise<object>}
 */
async function getTaskStatus(mineruTaskId) {
  const response = await fetch(taskStatusUrl(mineruTaskId), {
    method: 'GET',
    headers: config.mineru.parseHeaders || {},
    timeout: httpTimeoutMs(),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`MinerU 状态响应非 JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`MinerU 状态查询失败 HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error(`MinerU 状态响应非对象: ${text.slice(0, 500)}`);
  }
  return data;
}

/**
 * 流式下载结果 zip
 * @param {string} mineruTaskId
 * @param {string} destPath
 * @returns {Promise<string>}
 */
async function downloadResultZip(mineruTaskId, destPath) {
  const dest = path.resolve(destPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const response = await fetch(taskResultUrl(mineruTaskId), {
    method: 'GET',
    headers: config.mineru.parseHeaders || {},
    timeout: httpTimeoutMs(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`MinerU 下载结果失败 HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    response.body.pipe(out);
    response.body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });

  return dest;
}

/**
 * @param {object} data
 * @param {number} [maxLen]
 * @returns {string}
 */
function remarkFromPayload(data, maxLen = 4000) {
  let text;
  try {
    text = JSON.stringify(data);
  } catch (e) {
    text = String(data);
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen - 3)}...`;
  }
  return text;
}

module.exports = {
  baseUrl,
  tasksUrl,
  taskStatusUrl,
  taskResultUrl,
  submitTask,
  getTaskStatus,
  downloadResultZip,
  remarkFromPayload,
};
