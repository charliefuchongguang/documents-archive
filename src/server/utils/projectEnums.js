/**
 * 项目表单枚举（与 archive-helper/js/utils.js ENUMS 保持同步）
 */
const TENDER_TYPES = [
  '规划编制', '项目业主', '项目管理', '可研', '勘察', '设计', '勘察设计',
  '设计施工总承包', '设备材料', '施工', '施工监理', '试验检测', '保险', '其他'
];

const PROJECT_TYPES = ['招投标', '政府采购', '招投标+政府采购'];

const ROAD_LEVELS = ['高速公路', '一级路', '二级路'];

const INDUSTRIES = [
  '公路', '水运', '航空', '铁路', '市政', '建筑房地产', '电力', '化工医药',
  '机械电子', '能源工业', '冶金矿产', '农林水利', '轻纺食品', '环保', '旅游', '其它'
];

const ALLOWED_TENDER_TYPES = new Set(TENDER_TYPES);
const ALLOWED_PROJECT_TYPES = new Set(PROJECT_TYPES);
const ALLOWED_ROAD_LEVELS = new Set(ROAD_LEVELS);
const ALLOWED_INDUSTRIES = new Set(INDUSTRIES);

/**
 * @param {string[]} values
 * @param {Set<string>} allowed
 * @returns {string[]}
 */
function normalizeEnumList(values, allowed) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v) => typeof v === 'string' && allowed.has(v)))];
}

module.exports = {
  TENDER_TYPES,
  PROJECT_TYPES,
  ROAD_LEVELS,
  INDUSTRIES,
  ALLOWED_TENDER_TYPES,
  ALLOWED_PROJECT_TYPES,
  ALLOWED_ROAD_LEVELS,
  ALLOWED_INDUSTRIES,
  normalizeEnumList
};
