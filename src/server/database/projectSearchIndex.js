/**
 * 首页查询辅助表：项目级 (A) + 标段级 (B)
 * 源数据：projects + merged_data；写路径自动重建，可全量清空重建
 * 注意：通过懒加载 getDb，避免与 dao 循环依赖
 */

const { parsePartialDateRange } = require('../utils/partialDate');

function getDb() {
  return require('./dao').getDb();
}

/**
 * 里程文本 → 公里数字（去单位后缀；解析失败返回 null）
 * @param {*} raw
 * @returns {number|null}
 */
function parseMileageKm(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  s = s.replace(/(公里|千米|km|KM|Km)$/i, '');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {*} raw
 * @returns {number|null}
 */
function parseNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/,/g, '');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {*} raw
 * @returns {string|null} YYYY-MM-DD
 */
function normalizeDate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * @param {*} v
 * @returns {string}
 */
function strVal(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * 确保辅助表存在
 * @param {import('better-sqlite3').Database} [db]
 */
function ensureSearchIndexTables(db) {
  const database = db || getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_search_index (
      project_id TEXT PRIMARY KEY,
      project_overview TEXT DEFAULT '',
      tender_type TEXT DEFAULT '',
      project_type TEXT DEFAULT '',
      industry TEXT DEFAULT '',
      road_level TEXT DEFAULT '',
      project_manager TEXT DEFAULT '',
      tech_manager TEXT DEFAULT '',
      entrust_date TEXT,
      entrust_date_end TEXT,
      total_investment REAL,
      mileage_km REAL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS project_search_segment (
      project_id TEXT NOT NULL,
      segment_no INTEGER NOT NULL DEFAULT 0,
      win_notice_date TEXT,
      win_amount REAL,
      PRIMARY KEY (project_id, segment_no),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);
  try {
    const columns = database.prepare('PRAGMA table_info(project_search_index)').all();
    if (!columns.some((col) => col.name === 'entrust_date_end')) {
      database.exec('ALTER TABLE project_search_index ADD COLUMN entrust_date_end TEXT');
      database.exec('UPDATE project_search_index SET entrust_date_end = entrust_date WHERE entrust_date_end IS NULL');
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_psi_seg_win_date ON project_search_segment(win_notice_date)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_psi_seg_win_amount ON project_search_segment(win_amount)');
  } catch (e) { /* 忽略 */ }
}

/**
 * 从 form / segment 数据构建并写入单项目索引（调用方保证已 ensure 表）
 * @param {import('better-sqlite3').Database} database
 * @param {string} projectId
 * @param {Object|null} formData
 * @param {Array|null} segmentFormData
 */
function writeProjectSearchIndex(database, projectId, formData, segmentFormData) {
  const fd = formData && typeof formData === 'object' ? formData : {};
  const entrustRange = parsePartialDateRange(fd.entrustDate);
  const entrustStart = entrustRange.ok && !entrustRange.empty ? entrustRange.start : null;
  const entrustEnd = entrustRange.ok && !entrustRange.empty ? entrustRange.end : null;

  database.prepare('DELETE FROM project_search_segment WHERE project_id = ?').run(projectId);

  database.prepare(`
    INSERT INTO project_search_index (
      project_id, project_overview, tender_type, project_type, industry, road_level,
      project_manager, tech_manager, entrust_date, entrust_date_end, total_investment, mileage_km, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id) DO UPDATE SET
      project_overview = excluded.project_overview,
      tender_type = excluded.tender_type,
      project_type = excluded.project_type,
      industry = excluded.industry,
      road_level = excluded.road_level,
      project_manager = excluded.project_manager,
      tech_manager = excluded.tech_manager,
      entrust_date = excluded.entrust_date,
      entrust_date_end = excluded.entrust_date_end,
      total_investment = excluded.total_investment,
      mileage_km = excluded.mileage_km,
      updated_at = datetime('now')
  `).run(
    projectId,
    strVal(fd.projectOverview),
    strVal(fd.tenderType),
    strVal(fd.projectType),
    strVal(fd.industry),
    strVal(fd.roadLevel),
    strVal(fd.projectManager),
    strVal(fd.techManager),
    entrustStart,
    entrustEnd,
    parseNumber(fd.totalInvestment),
    parseMileageKm(fd.mileage)
  );

  const insertSeg = database.prepare(`
    INSERT INTO project_search_segment (project_id, segment_no, win_notice_date, win_amount)
    VALUES (?, ?, ?, ?)
  `);

  const segments = Array.isArray(segmentFormData) ? segmentFormData : [];
  if (segments.length > 1) {
    segments.forEach((item, idx) => {
      const segFd = (item && (item.formData || item)) || {};
      insertSeg.run(
        projectId,
        idx + 1,
        normalizeDate(segFd.winNoticeDate),
        parseNumber(segFd.winAmount)
      );
    });
  } else if (segments.length === 1) {
    const segFd = (segments[0] && (segments[0].formData || segments[0])) || {};
    insertSeg.run(
      projectId,
      0,
      normalizeDate(segFd.winNoticeDate || fd.winNoticeDate),
      parseNumber(segFd.winAmount !== undefined && segFd.winAmount !== '' ? segFd.winAmount : fd.winAmount)
    );
  } else {
    insertSeg.run(
      projectId,
      0,
      normalizeDate(fd.winNoticeDate),
      parseNumber(fd.winAmount)
    );
  }
}

/**
 * 重建单个项目查询索引
 * @param {string} projectId
 */
function rebuildProjectSearchIndex(projectId) {
  if (!projectId) return;
  const db = getDb();
  ensureSearchIndexTables(db);

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    db.prepare('DELETE FROM project_search_segment WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_search_index WHERE project_id = ?').run(projectId);
    return;
  }

  const row = db.prepare('SELECT form_data, segment_form_data FROM merged_data WHERE project_id = ?').get(projectId);
  if (!row) {
    // 无合并数据：不建 A 行（表单字段搜不到）；清掉旧索引
    db.prepare('DELETE FROM project_search_segment WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_search_index WHERE project_id = ?').run(projectId);
    return;
  }

  let formData = {};
  let segmentFormData = null;
  try {
    formData = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : (row.form_data || {});
  } catch {
    formData = {};
  }
  try {
    segmentFormData = typeof row.segment_form_data === 'string'
      ? JSON.parse(row.segment_form_data || 'null')
      : row.segment_form_data;
  } catch {
    segmentFormData = null;
  }

  const run = db.transaction(() => {
    writeProjectSearchIndex(db, projectId, formData, segmentFormData);
  });
  run();
}

/**
 * 删除项目索引行
 * @param {string} projectId
 */
function deleteProjectSearchIndex(projectId) {
  if (!projectId) return;
  const db = getDb();
  ensureSearchIndexTables(db);
  db.prepare('DELETE FROM project_search_segment WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM project_search_index WHERE project_id = ?').run(projectId);
}

/**
 * 清空并全量重建
 * @returns {{ projectCount: number, segmentCount: number }}
 */
function rebuildAllProjectSearchIndexes() {
  const db = getDb();
  ensureSearchIndexTables(db);

  const run = db.transaction(() => {
    db.prepare('DELETE FROM project_search_segment').run();
    db.prepare('DELETE FROM project_search_index').run();

    const rows = db.prepare(`
      SELECT m.project_id, m.form_data, m.segment_form_data
      FROM merged_data m
      INNER JOIN projects p ON p.id = m.project_id
    `).all();

    for (const row of rows) {
      let formData = {};
      let segmentFormData = null;
      try {
        formData = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : (row.form_data || {});
      } catch {
        formData = {};
      }
      try {
        segmentFormData = typeof row.segment_form_data === 'string'
          ? JSON.parse(row.segment_form_data || 'null')
          : row.segment_form_data;
      } catch {
        segmentFormData = null;
      }
      writeProjectSearchIndex(db, row.project_id, formData, segmentFormData);
    }
  });
  run();

  const projectCount = db.prepare('SELECT COUNT(*) AS c FROM project_search_index').get().c;
  const segmentCount = db.prepare('SELECT COUNT(*) AS c FROM project_search_segment').get().c;
  return { projectCount, segmentCount };
}

module.exports = {
  parseMileageKm,
  parseNumber,
  normalizeDate,
  ensureSearchIndexTables,
  rebuildProjectSearchIndex,
  rebuildAllProjectSearchIndexes,
  deleteProjectSearchIndex,
  /** @internal init 迁移用 */
  _writeForDb: writeProjectSearchIndex
};
