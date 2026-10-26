/**
 * 多关键词搜索解析与 SQL 条件构建（通用）
 * - 含 |：OR 模式，按 \s*\|\s* 拆分，每段为整体关键词（不再按空格拆分）
 * - 不含 |：AND 模式，按 \s+ 拆分，无序 AND（每个词都需命中）
 */

/**
 * 转义 LIKE 通配符
 * @param {string} keyword
 * @returns {string}
 */
function escapeLikeKeyword(keyword) {
  return String(keyword).replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * 解析搜索文本
 * @param {string} search
 * @returns {{ mode: 'or'|'and'|null, terms: string[] }}
 */
function parseSearchQuery(search) {
  const text = String(search || '').trim();
  if (!text) {
    return { mode: null, terms: [] };
  }

  if (text.includes('|')) {
    const terms = text.split(/\s*\|\s*/).map((t) => t.trim()).filter(Boolean);
    return { mode: 'or', terms };
  }

  const terms = text.split(/\s+/).filter(Boolean);
  return { mode: 'and', terms };
}

/**
 * 单个关键词在指定字段上的匹配条件
 * @param {string} keyword
 * @param {string[]} fields - SQL 字段名，如 ['p.name'] 或 ['a.project_name', 'a.project_no']
 * @returns {{ condition: string, params: string[] }}
 */
function buildSingleKeywordCondition(keyword, fields) {
  const pattern = `%${escapeLikeKeyword(keyword)}%`;
  const fieldExprs = fields.map((field) => `${field} LIKE ? ESCAPE '\\'`).join(' OR ');
  const params = fields.map(() => pattern);
  return {
    condition: `(${fieldExprs})`,
    params
  };
}

/**
 * 根据解析结果构建 SQL 条件
 * @param {string} search
 * @param {string[]} fields - SQL 字段名列表
 * @returns {{ condition: string, params: string[] }|null}
 */
function buildSearchCondition(search, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return null;
  }

  const { mode, terms } = parseSearchQuery(search);
  if (!mode || terms.length === 0) {
    return null;
  }

  const parts = [];
  const params = [];
  for (const term of terms) {
    const single = buildSingleKeywordCondition(term, fields);
    parts.push(single.condition);
    params.push(...single.params);
  }

  const joiner = mode === 'or' ? ' OR ' : ' AND ';
  return {
    condition: `(${parts.join(joiner)})`,
    params
  };
}

module.exports = {
  parseSearchQuery,
  buildSearchCondition,
  buildSingleKeywordCondition,
  escapeLikeKeyword
};
