/**
 * 数据库初始化模块 - 使用 better-sqlite3 创建/打开数据库并建表
 */
const path = require('path');
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.warn('[数据库] better-sqlite3 原生模块加载失败，请确保已安装 Visual Studio 构建工具后运行 npm rebuild better-sqlite3');
  Database = null;
}

const DB_PATH = path.join(__dirname, 'archive.db');

/** @type {import('better-sqlite3').Database} */
let db = null;

/**
 * 初始化数据库，创建所有表
 * @returns {import('better-sqlite3').Database} 数据库实例
 */
function initDatabase() {
  if (!Database) {
    console.warn('[数据库] 数据库模块不可用，跳过初始化');
    return null;
  }

  try {
    db = new Database(DB_PATH);

    // 启用 WAL 模式，提升并发读写性能
    db.pragma('journal_mode = WAL');

    // 建表 SQL
    const createTables = `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        created_by TEXT,
        created_by_name TEXT,
        synced_at TEXT,
        segments TEXT DEFAULT '[]',
        procurement_type TEXT DEFAULT 'F',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        file_name TEXT,
        md_content TEXT,
        extracted_data TEXT,
        status TEXT DEFAULT 'pending',
        error_msg TEXT,
        nas_path TEXT,
        segment_no INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS merged_data (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        form_data TEXT,
        conflicts TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS project_no_seq (
        year TEXT NOT NULL,
        current_seq INTEGER DEFAULT 0,
        PRIMARY KEY (year)
      );
    `;

    db.exec(createTables);

    // 为已有表添加新列（列已存在时会报错，捕获忽略）
    const alterStatements = [
      'ALTER TABLE projects ADD COLUMN segments TEXT DEFAULT \'[]\'',
      'ALTER TABLE projects ADD COLUMN procurement_type TEXT DEFAULT \'F\'',
      'ALTER TABLE files ADD COLUMN segment_no INTEGER DEFAULT 0'
    ];
    for (const sql of alterStatements) {
      try { db.exec(sql); } catch (e) { /* 列已存在，忽略 */ }
    }

    console.log('[数据库] 初始化完成，数据库路径:', DB_PATH);

    // 检查是否存在管理员，没有则创建默认管理员
    const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const hash = bcrypt.hashSync('admin123', 10);
      db.prepare("INSERT INTO users (id, username, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
        crypto.randomUUID(), 'admin', hash, '管理员', 'admin'
      );
      console.log('[数据库] 已创建默认管理员账号: admin / admin123');
    }

    return db;
  } catch (err) {
    console.warn('[数据库] 数据库初始化失败:', err.message);
    console.warn('[数据库] 请确保已安装 Visual Studio 构建工具后运行: npm rebuild better-sqlite3');
    db = null;
    return null;
  }
}

/**
 * 获取数据库实例
 * @returns {import('better-sqlite3').Database} 数据库实例
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 检查数据库是否可用
 * @returns {boolean}
 */
function isAvailable() {
  return db !== null;
}

module.exports = { initDatabase, getDatabase, isAvailable };
