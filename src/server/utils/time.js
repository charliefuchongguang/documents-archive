/**
 * 时间工具：统一使用东八区（Asia/Shanghai）记录业务时间。
 * 输出格式：YYYY-MM-DD HH:mm:ss
 */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

function nowCN() {
  const d = new Date(Date.now() + CN_OFFSET_MS);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 将任意时间值转换为东八区字符串；无法解析返回空串。
 * - 已是 `YYYY-MM-DD HH:mm:ss` 的字符串原样返回
 * - ISO 字符串/Date 按东八区格式化
 * @param {Date|string|number} value
 * @returns {string}
 */
function toCNString(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const cn = new Date(d.getTime() + CN_OFFSET_MS);
  return cn.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
  nowCN,
  toCNString
};