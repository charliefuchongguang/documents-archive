/**
 * 归档列表搜索（基于通用 searchQuery，匹配 project_name + project_no）
 */
const { buildSearchCondition, parseSearchQuery, escapeLikeKeyword } = require('./searchQuery');

const ARCHIVE_SEARCH_FIELDS = ['a.project_name', 'a.project_no'];

/**
 * @param {string} search
 * @returns {{ condition: string, params: string[] }|null}
 */
function buildArchiveSearchCondition(search) {
  return buildSearchCondition(search, ARCHIVE_SEARCH_FIELDS);
}

module.exports = {
  parseArchiveSearchQuery: parseSearchQuery,
  buildArchiveSearchCondition,
  escapeLikeKeyword
};
