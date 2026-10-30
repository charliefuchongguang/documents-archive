/**
 * 迁移脚本：归档项目（主）＋ 工程项目（辅），合同台账独立
 * 日期：2026-10-30
 *
 * 用法：
 *   node scripts/migrate-20261030-projects.js
 *   node scripts/migrate-20261030-projects.js --dry-run
 *   node scripts/migrate-20261030-projects.js --db path/to/archive.db
 *   node scripts/migrate-20261030-projects.js --force   # 关联表非空时仍删除（谨慎）
 *
 * 幂等：可重复执行。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DB = path.join(ROOT, 'src', 'server', 'database', 'archive.db');

function loadDatabase() {
  const candidates = [
    path.join(ROOT, 'src', 'server', 'node_modules', 'better-sqlite3'),
    'better-sqlite3'
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) { /* 继续尝试 */ }
  }
  throw new Error('无法加载 better-sqlite3，请先在 src/server 下执行 npm install');
}

function parseArgs(argv) {
  const args = { dryRun: false, force: false, dbPath: DEFAULT_DB };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--db') args.dbPath = path.resolve(argv[++i]);
  }
  return args;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function indexExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = ?").get(name);
}

function columnNames(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  } catch (e) {
    return new Set();
  }
}

function backupDatabase(dbPath) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let target = `${dbPath}.bak-${stamp}-projects`;
  let suffix = 1;
  while (fs.existsSync(target)) {
    suffix += 1;
    target = `${dbPath}.bak-${stamp}-projects-${suffix}`;
  }
  fs.copyFileSync(dbPath, target);
  return target;
}

function count(db, sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return Number(row?.cnt ?? row?.count ?? 0) || 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dbPath)) {
    console.error(`[迁移] 数据库不存在: ${args.dbPath}`);
    process.exit(1);
  }

  const Database = loadDatabase();
  let db = new Database(args.dbPath);
  db.pragma('journal_mode = WAL');

  console.log(`[迁移] 目标数据库: ${args.dbPath}`);
  console.log(`[迁移] 模式: ${args.dryRun ? 'DRY-RUN（不写入）' : '执行'}`);

  // 关键前置检查：关联表必须为空
  let linkCount = 0;
  if (tableExists(db, 'contract_project_links')) {
    linkCount = count(db, 'SELECT COUNT(*) AS cnt FROM contract_project_links');
    console.log(`[迁移] contract_project_links 现有 ${linkCount} 条`);
    if (linkCount > 0 && !args.force) {
      console.error('[迁移] 关联表非空，已中止。确认要删除请加 --force');
      db.close();
      process.exit(2);
    }
  } else {
    console.log('[迁移] contract_project_links 不存在，无需删除');
  }

  if (args.dryRun) {
    console.log('[迁移] DRY-RUN 完成，未做任何修改');
    db.close();
    return;
  }

  // WAL checkpoint 后备份，再继续写入
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  const backupPath = backupDatabase(args.dbPath);
  console.log(`[迁移] 已备份: ${backupPath}`);

  db = new Database(args.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  const run = db.transaction(() => {
    // 1. 工程项目表与编号序列
    db.exec(`
      CREATE TABLE IF NOT EXISTS master_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_no TEXT DEFAULT '',
        owner_name TEXT DEFAULT '',
        owner_credit_code TEXT DEFAULT '',
        region TEXT DEFAULT '',
        industry TEXT DEFAULT '公路',
        total_investment REAL,
        construction_scale TEXT DEFAULT '',
        manager TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        remark TEXT DEFAULT '',
        created_by TEXT,
        created_by_name TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS master_project_no_seq (
        year TEXT NOT NULL,
        current_seq INTEGER DEFAULT 0,
        PRIMARY KEY (year)
      );
    `);

    // 2. projects 增列（先查 PRAGMA）
    const projectColumns = columnNames(db, 'projects');
    const additions = [
      ['master_project_id', 'TEXT'],
      ['seq_in_project', 'INTEGER'],
      ['owner_name_snapshot', "TEXT DEFAULT ''"]
    ];
    for (const [name, type] of additions) {
      if (projectColumns.has(name)) {
        console.log(`[迁移] projects.${name} 已存在，跳过`);
        continue;
      }
      db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
      console.log(`[迁移] 已添加 projects.${name}`);
    }

    // 3. 索引
    db.exec('CREATE INDEX IF NOT EXISTS idx_projects_master ON projects(master_project_id)');
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_master_projects_no ON master_projects(project_no) WHERE project_no <> ''");
    db.exec('CREATE INDEX IF NOT EXISTS idx_master_projects_name ON master_projects(name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_master_projects_owner ON master_projects(owner_name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_master_projects_status ON master_projects(status)');

    // 4. 归档项目不再做同分类同名查重
    if (indexExists(db, 'idx_projects_category_name')) {
      db.exec('DROP INDEX idx_projects_category_name');
      console.log('[迁移] 已删除 idx_projects_category_name');
    }

    // 5. DROP 合同—项目关联表
    if (tableExists(db, 'contract_project_links')) {
      db.exec('DROP TABLE contract_project_links');
      console.log('[迁移] 已删除 contract_project_links');
    }

    // 6. 服务类型展示名对齐（code / nas_folder 不变）
    const categoryUpdates = [
      { id: 'cat_tender', name: '招标代理', sortOrder: 1 },
      { id: 'cat_cost', name: '造价咨询', sortOrder: 2 },
      { id: 'cat_consult', name: '咨询', sortOrder: 3 }
    ];
    const updateCategory = db.prepare(`
      UPDATE project_categories
      SET name = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    for (const item of categoryUpdates) {
      updateCategory.run(item.name, item.sortOrder, item.id);
    }
    console.log('[迁移] 服务类型名称已更新为 招标代理 / 造价咨询 / 咨询');

    // 7. 查询索引补齐 master_project_id（若表已存在）
    if (tableExists(db, 'project_search_index')) {
      const psiColumns = columnNames(db, 'project_search_index');
      if (!psiColumns.has('master_project_id')) {
        db.exec('ALTER TABLE project_search_index ADD COLUMN master_project_id TEXT');
        console.log('[迁移] 已添加 project_search_index.master_project_id');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_psi_master ON project_search_index(master_project_id)');
    }
  });

  try {
    run();
  } catch (error) {
    console.error('[迁移] 执行失败:', error.message);
    db.close();
    process.exit(3);
  } finally {
    try { db.pragma('foreign_keys = ON'); } catch (e) { /* 忽略 */ }
  }

  // 校验
  const contractCount = count(db, 'SELECT COUNT(*) AS cnt FROM contracts');
  const projectCount = count(db, 'SELECT COUNT(*) AS cnt FROM projects');
  const masterCount = count(db, 'SELECT COUNT(*) AS cnt FROM master_projects');
  const unassigned = count(db, 'SELECT COUNT(*) AS cnt FROM projects WHERE master_project_id IS NULL OR master_project_id = \'\'');
  const linkTableExists = tableExists(db, 'contract_project_links');

  console.log('----------------------------------------');
  console.log(`[迁移] 合同: ${contractCount}`);
  console.log(`[迁移] 归档项目: ${projectCount}（未归属 ${unassigned}）`);
  console.log(`[迁移] 工程项目: ${masterCount}`);
  console.log(`[迁移] contract_project_links 是否存在: ${linkTableExists ? '是（异常）' : '否'}`);
  console.log('[迁移] 完成');

  db.close();
}

main();