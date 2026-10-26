/**
 * MinerU 全局任务 DAO（对齐 hegui web_api/db.py mineru_tasks）
 * 替换原同步 file_parse：本地排队 + 远程异步 /tasks
 */
const crypto = require('crypto');
const { getDatabase } = require('./init');

const TASK_COLS = `
  id, user_id, username, file_abs_path, content_hash, file_id,
  mineru_task_id, queue_status, mineru_status, has_error, remark,
  result_zip_path, result_dir_path, md_path, content_list_path, document_text,
  created_at, updated_at, started_at, finished_at
`.replace(/\s+/g, ' ').trim();

/**
 * UTC ISO 时间（与 hegui 一致，带 Z）
 * @returns {string}
 */
function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 上海日历日 YYYY-MM-DD
 * @param {Date} [date]
 * @returns {string}
 */
function shanghaiDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 将 created_at 转为上海日历日
 * @param {string} createdAt
 * @returns {string}
 */
function createdAtToShanghaiDay(createdAt) {
  const raw = String(createdAt || '');
  try {
    const normalized = raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)
      ? raw
      : `${raw}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return shanghaiDay(d);
  } catch (e) {
    return raw.slice(0, 10);
  }
}

/**
 * @returns {import('better-sqlite3').Database}
 */
function db() {
  const instance = getDatabase();
  if (!instance) {
    throw new Error('数据库不可用');
  }
  return instance;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
function getById(id) {
  return db().prepare(`SELECT ${TASK_COLS} FROM mineru_tasks WHERE id = ?`).get(id) || null;
}

/**
 * 同用户同 hash、当天 completed 最新一条（可复用 md）
 * @param {string} userId
 * @param {string} contentHash
 * @returns {object|null}
 */
function findReusable(userId, contentHash) {
  const day = shanghaiDay();
  const rows = db().prepare(`
    SELECT ${TASK_COLS} FROM mineru_tasks
    WHERE user_id = ? AND content_hash = ? AND queue_status = 'completed'
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId, contentHash);

  for (const row of rows) {
    if (createdAtToShanghaiDay(row.created_at) !== day) continue;
    if (row.document_text && String(row.document_text).trim()) return row;
    if (row.md_path) return row;
  }
  return null;
}

/**
 * 事务内：已有 in-flight 则复用，否则新建 queued
 * @param {object} opts
 * @returns {{ row: object, merged: boolean }}
 */
function findOrEnqueue({
  userId,
  username = null,
  fileAbsPath,
  contentHash,
  fileId = null,
  forceNew = false,
}) {
  const now = utcNow();
  const database = db();

  const run = database.transaction(() => {
    if (!forceNew) {
      const existing = database.prepare(`
        SELECT ${TASK_COLS} FROM mineru_tasks
        WHERE user_id = ? AND content_hash = ?
          AND queue_status IN ('queued', 'uploading', 'running')
        ORDER BY created_at ASC
        LIMIT 1
      `).get(userId, contentHash);

      if (existing) {
        return { row: existing, merged: true };
      }
    }

    const id = crypto.randomUUID();
    database.prepare(`
      INSERT INTO mineru_tasks (
        id, user_id, username, file_abs_path, content_hash, file_id,
        queue_status, has_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)
    `).run(
      id,
      userId,
      username,
      fileAbsPath,
      contentHash,
      fileId,
      now,
      now
    );

    const row = database.prepare(`SELECT ${TASK_COLS} FROM mineru_tasks WHERE id = ?`).get(id);
    return { row, merged: false };
  });

  return run();
}

/**
 * 事务内按 created_at 抢占 queued→uploading，使 uploading+running 不超过 maxConcurrent
 * @param {number} maxConcurrent
 * @returns {object[]}
 */
function claimNext(maxConcurrent = 2) {
  const now = utcNow();
  const database = db();
  const limit = Math.max(1, Number(maxConcurrent) || 2);

  const run = database.transaction(() => {
    const activeRow = database.prepare(`
      SELECT COUNT(*) AS cnt FROM mineru_tasks
      WHERE queue_status IN ('uploading', 'running')
    `).get();
    const active = Number(activeRow?.cnt || 0);
    const slots = Math.max(0, limit - active);
    if (slots <= 0) return [];

    const candidates = database.prepare(`
      SELECT ${TASK_COLS} FROM mineru_tasks
      WHERE queue_status = 'queued'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(slots);

    const claimed = [];
    const updateStmt = database.prepare(`
      UPDATE mineru_tasks
      SET queue_status = 'uploading', started_at = ?, updated_at = ?
      WHERE id = ? AND queue_status = 'queued'
    `);

    for (const row of candidates) {
      const info = updateStmt.run(now, now, row.id);
      if (info.changes > 0) {
        claimed.push({
          ...row,
          queue_status: 'uploading',
          started_at: now,
          updated_at: now,
        });
      }
    }
    return claimed;
  });

  return run();
}

/**
 * 按白名单字段更新任务
 * @param {string} id
 * @param {object} fields
 */
function update(id, fields) {
  const allowed = [
    'user_id', 'username', 'file_abs_path', 'content_hash', 'file_id',
    'mineru_task_id', 'queue_status', 'mineru_status', 'has_error', 'remark',
    'result_zip_path', 'result_dir_path', 'md_path', 'content_list_path', 'document_text',
    'started_at', 'finished_at',
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(utcNow());
  values.push(id);
  db().prepare(`UPDATE mineru_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * @param {string} queueStatus
 * @returns {object[]}
 */
function listByQueueStatus(queueStatus) {
  return db().prepare(`
    SELECT ${TASK_COLS} FROM mineru_tasks
    WHERE queue_status = ?
    ORDER BY created_at ASC
  `).all(queueStatus);
}

/**
 * 启动恢复：无 mineru_task_id 的 uploading → queued；有 id 的 uploading → running
 * @returns {{ resetQueued: number, toRunning: number }}
 */
function recoverOnStartup() {
  const now = utcNow();
  const database = db();
  const resetQueued = database.prepare(`
    UPDATE mineru_tasks
    SET queue_status = 'queued', started_at = NULL, updated_at = ?
    WHERE queue_status = 'uploading'
      AND (mineru_task_id IS NULL OR mineru_task_id = '')
  `).run(now).changes;

  const toRunning = database.prepare(`
    UPDATE mineru_tasks
    SET queue_status = 'running', updated_at = ?
    WHERE queue_status = 'uploading'
      AND mineru_task_id IS NOT NULL AND mineru_task_id != ''
  `).run(now).changes;

  return { resetQueued, toRunning };
}

module.exports = {
  utcNow,
  shanghaiDay,
  getById,
  findReusable,
  findOrEnqueue,
  claimNext,
  update,
  listByQueueStatus,
  recoverOnStartup,
};
