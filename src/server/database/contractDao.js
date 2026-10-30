/**
 * 合同数据访问对象
 * - contracts：印花税合同台账（管理员维护），与归档项目/工程项目完全解耦
 * - 不再有合同—项目关联表，不参与任何业务统计
 */
const crypto = require('crypto');
const { getDatabase } = require('./init');
const { buildSearchCondition } = require('../utils/searchQuery');
const { parsePartialDateRange } = require('../utils/partialDate');

let tableEnsured = false;

const CONTRACT_COLUMNS = `
  id, seq_no, name, counterparty, total_investment,
  nature_raw, contract_content, project_manager, tech_manager,
  contract_date_raw, contract_date, contract_date_end,
  agency_fee, stamp_tax_due, stamp_tax_paid, copies, archive_date,
  is_consolidated_tax, credit_code_raw, credit_codes, contract_amount,
  parent_contract_id, is_payment, source,
  legacy_sheet, legacy_row, legacy_extra,
  created_by, created_by_name, created_at, updated_at
`;

const CONTRACT_TABLE_SQL = `
  CREATE TABLE contracts (
    id TEXT PRIMARY KEY,
    seq_no INTEGER,
    name TEXT NOT NULL,
    counterparty TEXT DEFAULT '',
    total_investment REAL,
    nature_raw TEXT DEFAULT '',
    contract_content TEXT DEFAULT '',
    project_manager TEXT DEFAULT '',
    tech_manager TEXT DEFAULT '',
    contract_date_raw TEXT DEFAULT '',
    contract_date TEXT,
    contract_date_end TEXT,
    agency_fee REAL,
    stamp_tax_due REAL,
    stamp_tax_paid REAL,
    copies INTEGER,
    archive_date TEXT,
    is_consolidated_tax INTEGER NOT NULL DEFAULT 0,
    credit_code_raw TEXT DEFAULT '',
    credit_codes TEXT DEFAULT '[]',
    contract_amount REAL,
    is_anchor INTEGER NOT NULL DEFAULT 0,
    parent_contract_id TEXT,
    is_payment INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'manual',
    legacy_sheet TEXT,
    legacy_row INTEGER,
    legacy_extra TEXT DEFAULT '',
    created_by TEXT,
    created_by_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_contract_id) REFERENCES contracts(id)
  )
`;

const CONTRACT_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_contracts_seq_no ON contracts(seq_no)',
  'CREATE INDEX IF NOT EXISTS idx_contracts_name ON contracts(name)',
  'CREATE INDEX IF NOT EXISTS idx_contracts_counterparty ON contracts(counterparty)',
  'CREATE INDEX IF NOT EXISTS idx_contracts_parent ON contracts(parent_contract_id)',
  'CREATE INDEX IF NOT EXISTS idx_contracts_date ON contracts(contract_date)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_legacy ON contracts(legacy_sheet, legacy_row)'
];

const FIELD_TO_COLUMN = {
  name: 'name',
  counterparty: 'counterparty',
  totalInvestment: 'total_investment',
  natureRaw: 'nature_raw',
  contractContent: 'contract_content',
  projectManager: 'project_manager',
  techManager: 'tech_manager',
  contractDateRaw: 'contract_date_raw',
  contractDate: 'contract_date',
  contractDateEnd: 'contract_date_end',
  agencyFee: 'agency_fee',
  stampTaxDue: 'stamp_tax_due',
  stampTaxPaid: 'stamp_tax_paid',
  copies: 'copies',
  archiveDate: 'archive_date',
  isConsolidatedTax: 'is_consolidated_tax',
  creditCodeRaw: 'credit_code_raw',
  creditCodes: 'credit_codes',
contractAmount: 'contract_amount',
  parentContractId: 'parent_contract_id',
  isPayment: 'is_payment',
  source: 'source'
};

function getDb() {
  const db = getDatabase();
  if (!db) {
    throw new Error('数据库未初始化，请检查 better-sqlite3 是否正确安装');
  }
  if (!tableEnsured) {
    ensureSchema(db);
    tableEnsured = true;
  }
  return db;
}

function ensureSchema(db) {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='contracts'"
  ).get();

  if (tableInfo && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableInfo.sql || '')) {
    // 旧表 name 有唯一约束，重建；当前合同数据量很小，可安全迁移
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      db.exec(CONTRACT_TABLE_SQL.replace('CREATE TABLE contracts', 'CREATE TABLE contracts_new'));
      db.exec(`
        INSERT INTO contracts_new (id, name, created_at, updated_at)
        SELECT id, name, created_at, updated_at FROM contracts
      `);
      db.exec('DROP TABLE contracts');
      db.exec('ALTER TABLE contracts_new RENAME TO contracts');
    });
    migrate();
    db.pragma('foreign_keys = ON');
  } else if (!tableInfo) {
    db.exec(CONTRACT_TABLE_SQL);
  } else {
    // 兼容旧版新表：补齐后续新增列
    const columns = new Set(db.prepare('PRAGMA table_info(contracts)').all().map((c) => c.name));
    const additions = [
      ['seq_no', 'INTEGER'],
      ['counterparty', "TEXT DEFAULT ''"],
      ['total_investment', 'REAL'],
      ['nature_raw', "TEXT DEFAULT ''"],
      ['contract_content', "TEXT DEFAULT ''"],
      ['project_manager', "TEXT DEFAULT ''"],
      ['tech_manager', "TEXT DEFAULT ''"],
      ['contract_date_raw', "TEXT DEFAULT ''"],
      ['contract_date', 'TEXT'],
      ['contract_date_end', 'TEXT'],
      ['agency_fee', 'REAL'],
      ['stamp_tax_due', 'REAL'],
      ['stamp_tax_paid', 'REAL'],
      ['copies', 'INTEGER'],
      ['archive_date', 'TEXT'],
      ['is_consolidated_tax', 'INTEGER NOT NULL DEFAULT 0'],
      ['credit_code_raw', "TEXT DEFAULT ''"],
      ['credit_codes', "TEXT DEFAULT '[]'"],
      ['contract_amount', 'REAL'],
      ['is_anchor', 'INTEGER NOT NULL DEFAULT 0'],
      ['parent_contract_id', 'TEXT'],
      ['is_payment', 'INTEGER NOT NULL DEFAULT 0'],
      ['source', "TEXT DEFAULT 'manual'"],
      ['legacy_sheet', 'TEXT'],
      ['legacy_row', 'INTEGER'],
      ['legacy_extra', "TEXT DEFAULT ''"],
      ['created_by', 'TEXT'],
      ['created_by_name', "TEXT DEFAULT ''"]
    ];
    for (const [name, type] of additions) {
      if (columns.has(name)) continue;
      try {
        db.exec(`ALTER TABLE contracts ADD COLUMN ${name} ${type}`);
      } catch (e) { /* 忽略并发/重复 */ }
    }
  }

for (const sql of CONTRACT_INDEXES) {
    try { db.exec(sql); } catch (e) { /* 忽略 */ }
  }
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapContractRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    seqNo: Number(row.seq_no) || 0,
    name: row.name,
    counterparty: row.counterparty || '',
    totalInvestment: row.total_investment,
    natureRaw: row.nature_raw || '',
    contractContent: row.contract_content || '',
    projectManager: row.project_manager || '',
    techManager: row.tech_manager || '',
    contractDateRaw: row.contract_date_raw || '',
    contractDate: row.contract_date || '',
    contractDateEnd: row.contract_date_end || '',
    agencyFee: row.agency_fee,
    stampTaxDue: row.stamp_tax_due,
    stampTaxPaid: row.stamp_tax_paid,
    copies: row.copies,
    archiveDate: row.archive_date || '',
    isConsolidatedTax: !!row.is_consolidated_tax,
    creditCodeRaw: row.credit_code_raw || '',
    creditCodes: parseJson(row.credit_codes, []),
contractAmount: row.contract_amount,
    parentContractId: row.parent_contract_id || null,
    isPayment: !!row.is_payment,
    source: row.source || 'manual',
    legacySheet: row.legacy_sheet || '',
    legacyRow: row.legacy_row,
    legacyExtra: parseJson(row.legacy_extra, null),
    createdBy: row.created_by || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function generateSeqNo(db) {
  const row = db.prepare('SELECT COALESCE(MAX(seq_no), 0) AS maxNo FROM contracts').get();
  return (Number(row?.maxNo) || 0) + 1;
}

function getContractById(id) {
  const db = getDb();
  return mapContractRow(db.prepare('SELECT * FROM contracts WHERE id = ?').get(id));
}

function getRawContract(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
}

function getContractByName(name, excludeId = '') {
  const db = getDb();
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const row = excludeId
    ? db.prepare('SELECT * FROM contracts WHERE name = ? AND id != ? ORDER BY seq_no LIMIT 1').get(trimmed, excludeId)
    : db.prepare('SELECT * FROM contracts WHERE name = ? ORDER BY seq_no LIMIT 1').get(trimmed);
  return mapContractRow(row);
}

function countChildren(db, contractId) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM contracts WHERE parent_contract_id = ?').get(contractId);
  return Number(row?.cnt) || 0;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeInteger(value) {
  const n = normalizeNumber(value);
  return n === null ? null : Math.trunc(n);
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function buildDateFields(data) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(data, 'contractDateRaw')) {
    const raw = String(data.contractDateRaw || '').trim();
    patch.contract_date_raw = raw;
    const parsed = parsePartialDateRange(raw);
    patch.contract_date = parsed.ok && !parsed.empty ? parsed.start : null;
    patch.contract_date_end = parsed.ok && !parsed.empty ? parsed.end : null;
  } else if (Object.prototype.hasOwnProperty.call(data, 'contractDate')) {
    const raw = String(data.contractDate || '').trim();
    patch.contract_date_raw = raw;
    const parsed = parsePartialDateRange(raw);
    patch.contract_date = parsed.ok && !parsed.empty ? parsed.start : null;
    patch.contract_date_end = parsed.ok && !parsed.empty ? parsed.end : null;
  }
  return patch;
}

function buildPatch(data) {
  const patch = {};
  for (const [key, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = data[key];
    if (['totalInvestment', 'agencyFee', 'stampTaxDue', 'stampTaxPaid', 'contractAmount'].includes(key)) {
      patch[column] = normalizeNumber(value);
    } else if (key === 'copies') {
      patch[column] = normalizeInteger(value);
    } else if (['isConsolidatedTax', 'isPayment'].includes(key)) {
      patch[column] = normalizeBoolean(value);
    } else if (key === 'creditCodes') {
      patch[column] = JSON.stringify(Array.isArray(value) ? value : []);
    } else if (key === 'parentContractId') {
      const parent = String(value || '').trim();
      patch[column] = parent || null;
    } else if (key === 'name') {
      patch[column] = String(value || '').trim();
    } else {
      patch[column] = value === null || value === undefined ? null : String(value);
    }
  }
  Object.assign(patch, buildDateFields(data));
  return patch;
}

function validateContractState(db, id, next) {
  if (!next.name || !String(next.name).trim()) {
    throw Object.assign(new Error('合同名称不能为空'), { status: 400 });
  }
}

function insertContract(data, source = 'manual') {
  const db = getDb();
  const name = String(data.name || '').trim();
  const patch = buildPatch({ ...data, name });
  validateContractState(db, null, { name });

  const id = data.id || crypto.randomUUID();
  const seqNo = Number.isInteger(Number(data.seqNo)) && Number(data.seqNo) > 0
    ? Number(data.seqNo)
    : generateSeqNo(db);
  const now = new Date().toISOString();

  const values = {
    id,
    seq_no: seqNo,
    name,
    counterparty: patch.counterparty || '',
    total_investment: patch.total_investment ?? null,
    nature_raw: patch.nature_raw || '',
    contract_content: patch.contract_content || '',
    project_manager: patch.project_manager || '',
    tech_manager: patch.tech_manager || '',
    contract_date_raw: patch.contract_date_raw || '',
    contract_date: patch.contract_date ?? null,
    contract_date_end: patch.contract_date_end ?? null,
    agency_fee: patch.agency_fee ?? null,
    stamp_tax_due: patch.stamp_tax_due ?? null,
    stamp_tax_paid: patch.stamp_tax_paid ?? null,
    copies: patch.copies ?? null,
    archive_date: patch.archive_date ?? null,
    is_consolidated_tax: patch.is_consolidated_tax ?? 0,
    credit_code_raw: patch.credit_code_raw || '',
    credit_codes: patch.credit_codes || '[]',
contract_amount: patch.contract_amount ?? null,
    parent_contract_id: patch.parent_contract_id || null,
    is_payment: patch.is_payment ?? 0,
    source: data.source || source,
    legacy_sheet: data.legacySheet || null,
    legacy_row: data.legacyRow ?? null,
    legacy_extra: data.legacyExtra
      ? (typeof data.legacyExtra === 'string' ? data.legacyExtra : JSON.stringify(data.legacyExtra))
      : '',
    created_by: data.createdBy || '',
    created_by_name: data.createdByName || '',
    created_at: now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO contracts (
      id, seq_no, name, counterparty, total_investment,
      nature_raw, contract_content, project_manager, tech_manager,
      contract_date_raw, contract_date, contract_date_end,
      agency_fee, stamp_tax_due, stamp_tax_paid, copies, archive_date,
is_consolidated_tax, credit_code_raw, credit_codes, contract_amount,
      parent_contract_id, is_payment, source,
      legacy_sheet, legacy_row, legacy_extra, created_by, created_by_name, created_at, updated_at
    ) VALUES (
      @id, @seq_no, @name, @counterparty, @total_investment,
      @nature_raw, @contract_content, @project_manager, @tech_manager,
      @contract_date_raw, @contract_date, @contract_date_end,
      @agency_fee, @stamp_tax_due, @stamp_tax_paid, @copies, @archive_date,
      @is_consolidated_tax, @credit_code_raw, @credit_codes, @contract_amount,
      @parent_contract_id, @is_payment, @source,
      @legacy_sheet, @legacy_row, @legacy_extra, @created_by, @created_by_name, @created_at, @updated_at
    )
  `).run(values);

  return getContractDetail(id);
}

function createContract(data) {
  const payload = typeof data === 'string' ? { name: data } : (data || {});
  return insertContract(payload, 'manual');
}

function updateContract(id, data) {
  const db = getDb();
  const existing = getRawContract(id);
  if (!existing) {
    throw Object.assign(new Error('合同不存在'), { status: 404 });
  }
  const current = mapContractRow(existing);
  const patch = buildPatch(data || {});
  if (patch.name !== undefined && !patch.name) {
    throw Object.assign(new Error('合同名称不能为空'), { status: 400 });
  }

const next = {
    name: patch.name !== undefined ? patch.name : current.name,
    isPayment: data && Object.prototype.hasOwnProperty.call(data, 'isPayment')
      ? normalizeBoolean(data.isPayment)
      : (current.isPayment ? 1 : 0),
    parentContractId: data && Object.prototype.hasOwnProperty.call(data, 'parentContractId')
      ? (patch.parent_contract_id || null)
      : current.parentContractId
  };
  validateContractState(db, id, next);

  const fields = Object.keys(patch);
  if (fields.length === 0) return getContractDetail(id);
  const values = fields.map((f) => patch[f]);
  fields.push('updated_at');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE contracts SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...values);
  return getContractDetail(id);
}

function deleteContract(id) {
  const db = getDb();
  const existing = getRawContract(id);
  if (!existing) {
    throw Object.assign(new Error('合同不存在'), { status: 404 });
  }
  const children = countChildren(db, id);
  if (children > 0) {
    throw Object.assign(new Error(`该合同下还有 ${children} 个子合同，不能删除`), { status: 409 });
  }
  db.prepare('DELETE FROM contracts WHERE id = ?').run(id);
  return { success: true };
}

function getChildContracts(contractId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, seq_no, name, contract_date, agency_fee, nature_raw, is_payment
    FROM contracts
    WHERE parent_contract_id = ?
    ORDER BY seq_no ASC, created_at ASC
  `).all(contractId).map((row) => ({
    id: row.id,
    seqNo: Number(row.seq_no) || 0,
    name: row.name,
    contractDate: row.contract_date || '',
    agencyFee: row.agency_fee,
    natureRaw: row.nature_raw || '',
    isPayment: !!row.is_payment
  }));
}

function getContractDetail(id, currentUserId) {
  const contract = getContractById(id);
  if (!contract) return null;
  const parent = contract.parentContractId ? getContractById(contract.parentContractId) : null;
  return {
    ...contract,
    children: getChildContracts(id),
    parent: parent ? {
      id: parent.id,
      seqNo: parent.seqNo,
      name: parent.name
    } : null
  };
}

function parseBoolQuery(value) {
  return value === true || value === '1' || value === 'true';
}

function listContracts({
  page = 1,
  pageSize = 50,
  search = '',
  searchType = 'contract',
  paymentOnly = false,
  childOnly = false,
  missingCredit = false
} = {}) {
  const db = getDb();
  const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
  const limit = Math.min(Math.max(1, pageSize), 10000);
  const conditions = [];
  const params = [];

if (search) {
    const sc = buildSearchCondition(search, ['c.name', 'c.counterparty', 'c.nature_raw']);
    if (sc) {
      conditions.push(sc.condition);
      params.push(...sc.params);
    }
  }

  if (parseBoolQuery(paymentOnly)) conditions.push('c.is_payment = 1');
  if (parseBoolQuery(childOnly)) conditions.push('c.parent_contract_id IS NOT NULL');
  if (parseBoolQuery(missingCredit)) {
    conditions.push("(c.credit_code_raw IS NULL OR TRIM(c.credit_code_raw) = '')");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM contracts c ${whereClause}`).get(...params).cnt;
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM contracts ch WHERE ch.parent_contract_id = c.id) AS child_count
    FROM contracts c
    ${whereClause}
    ORDER BY CASE WHEN c.seq_no IS NULL THEN 1 ELSE 0 END, c.seq_no ASC, c.created_at ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const items = rows.map((row) => ({
    ...mapContractRow(row),
    childCount: Number(row.child_count) || 0
  }));

  return { items, total, page, pageSize: limit };
}



function searchContracts({ q = '', limit = 20 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (q) {
    const sc = buildSearchCondition(q, ['c.name', 'c.counterparty', 'c.nature_raw']);
    if (sc) {
      conditions.push(sc.condition);
      params.push(...sc.params);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const lim = Math.min(Math.max(1, limit), 50);
  const rows = db.prepare(`
    SELECT c.id, c.name, c.seq_no, c.is_payment
    FROM contracts c
    ${whereClause}
    ORDER BY c.seq_no ASC, c.name ASC
    LIMIT ?
  `).all(...params, lim);

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      seqNo: Number(r.seq_no) || 0,
      isPayment: !!r.is_payment
    }))
  };
}


module.exports = {
  getDb,
  getContractById,
  getContractByName,
  createContract,
  updateContract,
  deleteContract,
  getContractDetail,
  getChildContracts,
  listContracts,
  searchContracts
};
