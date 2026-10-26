/**
 * 轻量日志工具
 * - 按天切分：server/logs/app-YYYY-MM-DD.log
 * - 同步追加写文件，同时镜像到 console
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatExtra(extra) {
  if (extra == null) return '';
  if (extra instanceof Error) {
    return extra.stack ? `\n${extra.stack}` : ` ${extra.message}`;
  }
  if (typeof extra === 'string') return ` ${extra}`;
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch (_) {
    return ` ${String(extra)}`;
  }
}

function write(level, tag, msg, extra) {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] [${level}] [${tag}] ${msg}${formatExtra(extra)}\n`;
  const filePath = path.join(LOG_DIR, `app-${todayStamp()}.log`);
  try {
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    console.error(`[logger] 写日志失败: ${err.message}`);
  }

  const consoleMsg = `[${tag}] ${msg}`;
  if (level === 'ERROR') {
    if (extra !== undefined) console.error(consoleMsg, extra instanceof Error ? extra : extra);
    else console.error(consoleMsg);
  } else if (level === 'WARN') {
    if (extra !== undefined) console.warn(consoleMsg, extra instanceof Error ? extra : extra);
    else console.warn(consoleMsg);
  } else {
    if (extra !== undefined) console.log(consoleMsg, extra instanceof Error ? extra.message : extra);
    else console.log(consoleMsg);
  }
}

const logger = {
  info(tag, msg, extra) {
    write('INFO', tag, msg, extra);
  },
  warn(tag, msg, extra) {
    write('WARN', tag, msg, extra);
  },
  error(tag, msg, extra) {
    write('ERROR', tag, msg, extra);
  },
  logDir: LOG_DIR,
};

module.exports = logger;
