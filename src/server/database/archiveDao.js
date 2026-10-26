/**
 * 归档数据访问对象 - 管理 archives 表的全部操作
 * 通过 init.js 的 getDatabase() 获取数据库连接，自行负责建表与序号维护
 */
const { getDatabase } = require('./init');
const { buildArchiveSearchCondition } = require('../utils/archiveSearchQuery');
const { nowCN } = require('../utils/time');

// 建表标志，确保只在进程生命周期内执行一次
let tableEnsured = false;

/**
 * 获取数据库连接并确保 archives 表及相关表存在
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  const db = getDatabase();
  if (!db) {
    throw new Error('数据库未初始化，请检查 better-sqlite3 是否正确安装');
  }
  if (!tableEnsured) {
    // 检测旧表是否有 project_id UNIQUE 约束，若有则重建表
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='archives'").get();
    const needsRebuild = tableInfo && /project_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableInfo.sql);

    if (needsRebuild) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS archives_new (
          seq_no INTEGER PRIMARY KEY,
          project_id TEXT NOT NULL,
          project_name TEXT NOT NULL,
          form_data TEXT,
          segment_no INTEGER DEFAULT 0,
          segment_name TEXT DEFAULT '',
          project_no TEXT DEFAULT '',
          template_code TEXT DEFAULT '',
          template_version TEXT DEFAULT '',
          archive_ref TEXT DEFAULT '',
          submitted_by TEXT,
          submitted_by_name TEXT,
          submitted_at TEXT DEFAULT (datetime('now')),
          UNIQUE(project_id, segment_no)
        )
      `);
      db.exec(`
        INSERT OR IGNORE INTO archives_new (seq_no, project_id, project_name, form_data, segment_no, segment_name, project_no, template_code, template_version, archive_ref, submitted_by, submitted_by_name, submitted_at)
        SELECT seq_no, project_id, project_name, form_data, COALESCE(segment_no,0), COALESCE(segment_name,''), COALESCE(project_no,''), '', '', '', submitted_by, submitted_by_name, submitted_at
        FROM archives
      `);
      db.exec(`DROP TABLE archives`);
      db.exec(`ALTER TABLE archives_new RENAME TO archives`);
      console.log('[archiveDao] archives 表已迁移至新结构');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS archives (
        seq_no INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        form_data TEXT,
        segment_no INTEGER DEFAULT 0,
        segment_name TEXT DEFAULT '',
        project_no TEXT DEFAULT '',
        template_code TEXT DEFAULT '',
        template_version TEXT DEFAULT '',
        archive_ref TEXT DEFAULT '',
        submitted_by TEXT,
        submitted_by_name TEXT,
        submitted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id, segment_no)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_archives_submitted_at ON archives(submitted_at DESC)`);

    // 确保 project_no_seq 表存在
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_no_seq (
        year TEXT NOT NULL,
        current_seq INTEGER DEFAULT 0,
        PRIMARY KEY (year)
      )
    `);

    // 为已有 archives 表添加新列（列已存在时会报错，捕获忽略）
    const alterStatements = [
      "ALTER TABLE archives ADD COLUMN segment_no INTEGER DEFAULT 0",
      "ALTER TABLE archives ADD COLUMN segment_name TEXT DEFAULT ''",
      "ALTER TABLE archives ADD COLUMN project_no TEXT DEFAULT ''",
      "ALTER TABLE archives ADD COLUMN template_code TEXT DEFAULT ''",
      "ALTER TABLE archives ADD COLUMN template_version TEXT DEFAULT ''",
      "ALTER TABLE archives ADD COLUMN archive_ref TEXT DEFAULT ''"
    ];
    for (const sql of alterStatements) {
      try { db.exec(sql); } catch (e) { /* 列已存在，忽略 */ }
    }

    tableEnsured = true;
  }
  return db;
}

// ==================== 序号工具 ====================

/**
 * 生成下一个归档序号（连续，不留空）
 * @returns {number} 下一个可用的 seq_no
 */
function generateSeqNo() {
  const db = getDb();
  const result = db.prepare('SELECT MAX(seq_no) as maxNo FROM archives').get();
  return (result.maxNo || 0) + 1;
}

/**
 * 生成项目编号
 * 格式：ZEC-Z{year}{procurementType}-{seq}，seq 三位补零
 * @param {string} year - 年份，如 '2026'
 * @param {string} procurementType - 采购方式代码，默认 'G'
 * @returns {string} 项目编号
 */
function generateProjectNo(year, procurementType) {
  const db = getDb();
  const type = procurementType || 'G';
  const incrementSeq = db.transaction(() => {
    const row = db.prepare('SELECT current_seq FROM project_no_seq WHERE year = ?').get(year);
    let seq;
    if (row) {
      seq = row.current_seq + 1;
      db.prepare('UPDATE project_no_seq SET current_seq = ? WHERE year = ?').run(seq, year);
    } else {
      seq = 1;
      db.prepare('INSERT INTO project_no_seq (year, current_seq) VALUES (?, ?)').run(year, seq);
    }
    return seq;
  });
  const seq = incrementSeq();
  return `ZEC-Z${year}${type}-${seq.toString().padStart(3, '0')}`;
}

// ==================== 归档操作 ====================

/**
 * 添加项目数据到归档表（单标段）
 * @param {Object} params - { projectId, projectName, formData, submittedBy, submittedByName, segmentNo, segmentName, projectNo }
 * @returns {Object} 新创建的归档记录
 */
function archiveProject({
  projectId,
  projectName,
  formData,
  submittedBy,
  submittedByName,
  segmentNo = 0,
  segmentName = '',
  projectNo = '',
  templateCode = '',
  templateVersion = '',
  archiveRef = ''
}) {
  const db = getDb();
  const existing = db.prepare('SELECT seq_no FROM archives WHERE project_id = ? AND segment_no = ?').get(projectId, segmentNo);
  if (existing) {
    throw new Error('该项目已归档，无法重复提交');
  }
  const seqNo = generateSeqNo();
  const formDataStr = typeof formData === 'object' ? JSON.stringify(formData) : formData;
  db.prepare(`
    INSERT INTO archives (seq_no, project_id, project_name, form_data, segment_no, segment_name, project_no,
      template_code, template_version, archive_ref, submitted_by, submitted_by_name, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seqNo, projectId, projectName, formDataStr, segmentNo, segmentName, projectNo,
    templateCode || '', templateVersion || '', archiveRef || '', submittedBy, submittedByName, nowCN()
  );
  return db.prepare('SELECT * FROM archives WHERE project_id = ? AND segment_no = ?').get(projectId, segmentNo);
}

/**
 * 批量归档（多标段）
 * @param {Object} params - { projectId, projectName, segments, formDataArray, projectNo, submittedBy, submittedByName }
 * @returns {Array} 归档结果列表
 */
function archiveProjectBatch({
  projectId,
  projectName,
  segments,
  formDataArray,
  projectNo,
  templateCode = '',
  templateVersion = '',
  archiveRefBuilder = null,
  submittedBy,
  submittedByName
}) {
  const db = getDb();
  const insertMany = db.transaction((segs) => {
    const results = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const existing = db.prepare('SELECT seq_no FROM archives WHERE project_id = ? AND segment_no = ?').get(projectId, i + 1);
      if (existing) continue; // 跳过已存在的标段
      const seqNo = generateSeqNo();
      const formData = formDataArray && formDataArray[i] ? formDataArray[i] : {};
      const formDataStr = typeof formData === 'object' ? JSON.stringify(formData) : formData;
      const segProjectName = `${projectName}${seg.name}`;
      const archiveRef = typeof archiveRefBuilder === 'function'
        ? (archiveRefBuilder(i + 1, seg) || '')
        : '';
      db.prepare(`
        INSERT INTO archives (seq_no, project_id, project_name, form_data, segment_no, segment_name, project_no,
          template_code, template_version, archive_ref, submitted_by, submitted_by_name, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        seqNo, projectId, segProjectName, formDataStr, i + 1, seg.name, projectNo,
        templateCode || '', templateVersion || '', archiveRef, submittedBy, submittedByName, nowCN()
      );
      results.push({ seqNo, segmentNo: i + 1, segmentName: seg.name });
    }
    return results;
  });
  return insertMany(segments);
}

/**
 * 获取单条归档记录
 * @param {string} projectId - 项目 ID
 * @returns {Object|undefined} 归档记录（form_data 已解析为对象）
 */
function getArchive(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM archives WHERE project_id = ?').get(projectId);
  if (row && row.form_data) {
    try { row.form_data = JSON.parse(row.form_data); } catch {}
  }
  return row;
}

/**
 * 获取项目的全部归档记录（多标段）
 * @param {string} projectId
 * @returns {Array}
 */
function getArchivesByProject(projectId) {
  const db = getDb();
  return db.prepare('SELECT * FROM archives WHERE project_id = ? ORDER BY segment_no ASC').all(projectId);
}

/**
 * 按项目 ID + 标段号获取归档记录
 * @param {string} projectId
 * @param {number} segmentNo
 * @returns {Object|undefined}
 */
function getArchiveByProjectAndSegment(projectId, segmentNo) {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM archives WHERE project_id = ? AND segment_no = ?'
  ).get(projectId, segmentNo);
  if (row && row.form_data) {
    try { row.form_data = JSON.parse(row.form_data); } catch {}
  }
  return row;
}

/**
 * 分页获取归档列表
 * @param {Object} options - { page, pageSize, search, regions }
 * @returns {Object} { items, total, page, pageSize }
 */
function getArchives({ page = 1, pageSize = 50, search = '', regions = [] } = {}) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const conditions = [];
  const params = [];

  if (search) {
    const searchCondition = buildArchiveSearchCondition(search);
    if (searchCondition) {
      conditions.push(searchCondition.condition);
      params.push(...searchCondition.params);
    }
  }

  if (Array.isArray(regions) && regions.length > 0) {
    conditions.push(`p.region IN (${regions.map(() => '?').join(', ')})`);
    params.push(...regions);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause = 'FROM archives a LEFT JOIN projects p ON a.project_id = p.id';

  const total = db.prepare(`SELECT COUNT(*) as count ${fromClause} ${whereClause}`).get(...params).count;
  const items = db.prepare(
    `SELECT a.*, p.status AS project_status, p.paper_reviewed_at AS paper_reviewed_at,
            p.paper_reviewed_by_name AS paper_reviewed_by_name
     ${fromClause} ${whereClause} ORDER BY a.seq_no ASC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);

  items.forEach(item => {
    if (item.form_data) {
      try { item.form_data = JSON.parse(item.form_data); } catch {}
    }
  });
  return { items, total, page, pageSize };
}

/**
 * 获取全部归档数据供 Excel 导出（按 seq_no 升序）
 * @returns {Array} 扁平化后的归档记录列表
 */
function getAllArchivesForExport() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*, p.status AS project_status
    FROM archives a
    LEFT JOIN projects p ON p.id = a.project_id
    ORDER BY a.seq_no ASC
  `).all();
  return rows.map(row => {
    const data = row.form_data
      ? (typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data)
      : {};
    return {
      seq_no: row.seq_no,
      project_name: row.project_name,
      project_no: row.project_no || '',
      project_status: row.project_status || '',
      template_code: row.template_code || '',
      template_version: row.template_version || '',
      archive_ref: row.archive_ref || '',
      segment_no: row.segment_no || 0,
      segment_name: row.segment_name || '',
      submitted_by_name: row.submitted_by_name,
      submitted_at: row.submitted_at,
      form_data: data  // 保留 form_data 对象供前端按 key 取值
    };
  });
}

/**
 * 删除归档记录并压缩序号（保证连续不留空）
 * @param {string} projectId - 项目 ID
 */
function removeArchive(projectId) {
  const db = getDb();
  const row = db.prepare('SELECT seq_no FROM archives WHERE project_id = ?').get(projectId);
  if (!row) return;
  const deletedSeqNo = row.seq_no;
  db.prepare('DELETE FROM archives WHERE project_id = ?').run(projectId);
  // 压缩序号：将被删除序号之后的记录依次前移
  db.prepare('UPDATE archives SET seq_no = seq_no - 1 WHERE seq_no > ?').run(deletedSeqNo);
}

module.exports = {
  archiveProject,
  archiveProjectBatch,
  getArchive,
  getArchivesByProject,
  getArchiveByProjectAndSegment,
  getArchives,
  getAllArchivesForExport,
  removeArchive,
  generateProjectNo
};
