/**
 * 部分日期解析：支持「年 / 年月 / 年月日」三级精度。
 * 例如：2022、2022-03、2022-03-10、2022年3月、2022/3/10。
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 解析部分日期为可比较的起止区间。
 * @param {*} raw
 * @returns {{
 *   ok: boolean,
 *   empty?: boolean,
 *   start?: string|null,
 *   end?: string|null,
 *   precision?: 'year'|'month'|'day'|null,
 *   normalized?: string,
 *   error?: string
 * }}
 */
function parsePartialDateRange(raw) {
  if (raw === null || raw === undefined) {
    return { ok: true, empty: true, start: null, end: null, precision: null, normalized: '' };
  }

  let s = String(raw).trim();
  if (!s) {
    return { ok: true, empty: true, start: null, end: null, precision: null, normalized: '' };
  }

  // 去掉时间部分（如 2022-03-10T00:00:00 / 2022-03-10 00:00）
  s = s.split(/[T\s]/)[0];

  const cleaned = s
    .replace(/[年]/g, '-')
    .replace(/[月]/g, '-')
    .replace(/[日]/g, '')
    .replace(/[./]/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/-$/, '');

  const match = cleaned.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!match) {
    return { ok: false, error: '日期格式应为 2022、2022-03 或 2022-03-10' };
  }

  const year = Number(match[1]);
  const hasMonth = match[2] !== undefined;
  const hasDay = match[3] !== undefined;
  const month = hasMonth ? Number(match[2]) : null;
  const day = hasDay ? Number(match[3]) : null;

  if (year < 1000 || year > 9999) {
    return { ok: false, error: '年份应为 4 位数字' };
  }
  if (hasMonth && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return { ok: false, error: '月份应在 1-12 之间' };
  }
  if (hasDay) {
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
      return { ok: false, error: '日期不存在，请检查年月日' };
    }
  }

  if (!hasMonth) {
    return {
      ok: true,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      precision: 'year',
      normalized: String(year)
    };
  }

  if (!hasDay) {
    return {
      ok: true,
      start: `${year}-${pad2(month)}-01`,
      end: `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`,
      precision: 'month',
      normalized: `${year}-${pad2(month)}`
    };
  }

  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  return {
    ok: true,
    start: date,
    end: date,
    precision: 'day',
    normalized: date
  };
}

module.exports = {
  parsePartialDateRange,
  daysInMonth
};