/**
 * utils.js - 工具函数和枚举常量
 * 挂载到全局 window.Utils
 */

window.Utils = {

  // ==================== 枚举常量 ====================

  /**
   * 业务枚举值（来自需求文档）
   */
  ENUMS: {
    projectType: ['招投标', '政府采购', '招投标+政府采购'],
    tenderType: ['规划编制', '项目业主', '项目管理', '可研', '勘察', '设计', '勘察设计', '设计施工总承包', '设备材料', '施工', '施工监理', '试验检测', '保险', '其他'],
    tenderMethod: ['邀请招标', '公开招标', '竞争性谈判', '竞争性磋商', '询价', '单一来源采购', '比选'],
    buildType: ['新建', '改扩建', '养护/大中修'],
    roadLevel: ['高速公路', '一级路', '二级路'],
    sealUnit: ['招标人', '招标代理', '招标人+招标代理', '招标人+招标代理+交易中心', '招标人+交易中心', '招标代理+交易中心', '其他'],
    industry: ['公路', '水运', '航空', '铁路', '市政', '建筑房地产', '电力', '化工医药', '机械电子', '能源工业', '冶金矿产', '农林水利', '轻纺食品', '环保', '旅游', '其它']
  },

  /**
   * 文档类型定义
   */
  DOC_TYPES: {
    tender_notice: { label: '招标公告截图', required: false },
    tender_doc: { label: '招标文件', required: true },
    win_notice: { label: '中标通知书', required: true },
    win_public: { label: '中标公示', required: false },
    evaluation: { label: '履约评价', required: false },
    contract: { label: '代理服务合同', required: true }
  },

  /**
   * 字段元数据定义（用于复核表单渲染）
   * 共 30 个字段，分 6 个分组
   */
  FIELDS: [
    { key: 'projectNo', label: '项目编号', group: 'basic', type: 'text', required: true },
    { key: 'projectType', label: '项目类型', group: 'basic', type: 'enum', enumKey: 'projectType', required: true },
    { key: 'province', label: '项目所在省份', group: 'basic', type: 'text', required: true },
    { key: 'industry', label: '行业', group: 'basic', type: 'enum', enumKey: 'industry', required: true },
    { key: 'projectName', label: '招标项目名称', group: 'basic', type: 'text', required: true },
    { key: 'tenderType', label: '招标类型/招标内容', group: 'tender', type: 'enum', enumKey: 'tenderType', required: false },
    { key: 'tenderMethod', label: '招标/采购方式', group: 'tender', type: 'enum', enumKey: 'tenderMethod', required: false },
    { key: 'announceDate', label: '公告时间', group: 'tender', type: 'date', required: false },
    { key: 'announceMedia', label: '公告媒体', group: 'tender', type: 'text', required: false },
    { key: 'orgMode', label: '项目管理组织模式', group: 'tender', type: 'text', required: false },
    { key: 'buildType', label: '招标项目建设类型', group: 'tender', type: 'enum', enumKey: 'buildType', required: false },
    { key: 'mileage', label: '里程', group: 'tender', type: 'text', required: false },
    { key: 'roadLevel', label: '道路等级', group: 'tender', type: 'enum', enumKey: 'roadLevel', required: false },
    { key: 'totalInvestment', label: '项目总投资（万元）', group: 'overview', type: 'number', required: false },
    { key: 'projectOverview', label: '项目概况', group: 'overview', type: 'textarea', required: false },
    { key: 'contractName', label: '合同名称', group: 'contract', type: 'text', required: false },
    { key: 'entrustDate', label: '委托时间', group: 'contract', type: 'date', required: false },
    { key: 'entrustAmount', label: '委托金额(万元)', group: 'contract', type: 'number', required: false },
    { key: 'projectManager', label: '项目负责人', group: 'contract', type: 'text', required: false },
    { key: 'techManager', label: '技术负责人', group: 'contract', type: 'text', required: false },
    { key: 'otherMembers', label: '其他参与人员', group: 'contract', type: 'text', required: false },
    { key: 'publicDate', label: '公示时间', group: 'result', type: 'text', required: false },
    { key: 'winUnit', label: '中标单位', group: 'result', type: 'text', required: false },
    { key: 'winAmount', label: '中标金额（万元）', group: 'result', type: 'number', required: false },
    { key: 'winNoticeDate', label: '中标通知书时间', group: 'result', type: 'date', required: false },
    { key: 'sealUnit', label: '中标通知书盖章单位', group: 'result', type: 'enum', enumKey: 'sealUnit', required: false },
    { key: 'evalDate', label: '评价书出具时间', group: 'result', type: 'date', required: false },
    { key: 'tenderUnit', label: '招标人', group: 'owner', type: 'text', required: false },
    { key: 'contactInfo', label: '联系人及电话', group: 'owner', type: 'text', required: false }
  ],

  /**
   * 字段分组定义
   */
  FIELD_GROUPS: [
    { key: 'basic', label: '基本信息' },
    { key: 'tender', label: '招标信息' },
    { key: 'overview', label: '项目概况' },
    { key: 'contract', label: '合同与人员' },
    { key: 'result', label: '中标信息' },
    { key: 'owner', label: '招标人与联系' }
  ],

  // ==================== 工具函数 ====================

  /**
   * 格式化日期为 YYYY-MM-DD
   * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
   * @returns {string} 格式化后的日期字符串
   */
  formatDate(date) {
    if (!date) return '';
    const d = dayjs ? dayjs(date) : new Date(date);
    if (dayjs) {
      return d.format('YYYY-MM-DD');
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 解析金额字符串为数字（万元）
   * 支持中文数字、千分位逗号、单位后缀等
   * @param {string|number} str - 金额字符串
   * @returns {number|null} 解析后的数字（万元），解析失败返回 null
   */
  parseAmount(str) {
    if (str === null || str === undefined || str === '') return null;
    if (typeof str === 'number') return str;

    // 转换为字符串并清理
    let s = String(str).trim();

    // 去除千分位逗号
    s = s.replace(/,/g, '');

    // 提取数字部分（支持小数）
    const match = s.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;

    let amount = parseFloat(match[1]);

    // 处理单位转换
    if (/亿/.test(s)) {
      amount = amount * 10000; // 亿元转万元
    } else if (/万/.test(s)) {
      // 已经是万元单位，不做转换
    } else if (/元/.test(s)) {
      amount = amount / 10000; // 元转万元
    }

    return parseFloat(amount.toFixed(4));
  },

  /**
   * 生成项目ID（格式：proj_YYYYMMDD_xxx）
   * @returns {string} 项目ID
   */
  generateProjectId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `proj_${year}${month}${day}_${random}`;
  }

};
