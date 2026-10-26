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
   * 中国省级行政区（所属地域下拉；NAS 最终路径一级目录）
   */
  PROVINCES: [
    '北京市','上海市','天津市','重庆市',
    '黑龙江省','山西省','辽宁省','吉林省',
    '湖北省','湖南省','青海省','山东省',
    '贵州省','河北省','江苏省','浙江省',
    '安徽省','福建省','江西省','河南省',
    '广东省','海南省','四川省','云南省',
    '陕西省','甘肃省','新疆维吾尔自治区',
    '西藏自治区','内蒙古自治区','广西壮族自治区',
    '宁夏回族自治区','香港特别行政区','澳门特别行政区',
    '台湾省'
  ],

  /**
   * 文档类型定义
   * batchSelectable: false 表示一键提取分类复选框永久禁用
   */
  DOC_TYPES: {
    tender_notice: { label: '招标公告截图', required: true },
    tender_doc: { label: '招标文件', required: true },
    win_notice: { label: '中标通知书', required: true },
    win_public: { label: '中标公示', required: true },
    // 2026-10-25: 履约评价、交接清单部分项目天然缺失，改为非必传
    evaluation: { label: '履约评价', required: false },
    contract: { label: '代理服务合同', required: true },
    // 2026-08-27: 评标报告、交接清单 — 整类仅存（不转 MD、不提取），排在其它附件之前
    bid_eval_report: { label: '评标报告', required: true, batchSelectable: false, storeOnly: true },
    handover_list: { label: '交接清单', required: false, batchSelectable: false, storeOnly: true },
    // 2026-10-18: 招标项目固定文件夹结构引入的类型，整类仅存（不转 MD、不提取）
    approval: { label: '批复', required: false, batchSelectable: false, storeOnly: true },
    prequal_notice: { label: '资格预审公告', required: false, batchSelectable: false, storeOnly: true },
    prequal_doc: { label: '资格预审文件', required: false, batchSelectable: false, storeOnly: true },
    prequal_review: { label: '评审报告（资格预审）', required: false, batchSelectable: false, storeOnly: true },
    other_attach: { label: '其它附件', required: false, batchSelectable: false, storeOnly: true }
  },

  /**
   * 「从文件夹导入」核心必传类型（缺失仅高亮提示，不阻断）
   * 与 DOC_TYPES.required 解耦，避免影响逐类上传/复核流程
   */
  FOLDER_IMPORT_REQUIRED: [
    'contract',
    'tender_doc',
    'bid_eval_report',
    'win_notice'
  ],

  /**
   * 仅招标类项目使用的文档类型（非招标项目不展示对应上传卡片）
   */
  TENDER_ONLY_DOC_TYPES: ['approval', 'prequal_notice', 'prequal_doc', 'prequal_review'],

  /**
   * 上传文件类型（与 server/utils/fileTypes.js 保持同步）
   * - pdf / image / docx / pptx / xlsx：MineRU 转 MD，可提取
   * - md/markdown/txt：直读文本，可提取
   * - 其余扩展名：仅存储，不可提取
   * - bid_eval_report / handover_list / other_attach：整类仅存储，不转 MD、不提取
   */
  FILE_TYPES: {
    PDF_EXTS: ['.pdf'],
    IMAGE_EXTS: ['.jpg', '.jpeg', '.png'],
    OFFICE_MINERU_EXTS: ['.docx', '.pptx', '.xlsx'],
    /** 需 MineRU 转 MD（与 IMAGE/OFFICE 列表保持同步，避免 getter 兼容问题） */
    MINERU_EXTS: ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.pptx', '.xlsx'],
    TEXT_EXTS: ['.md', '.markdown', '.txt'],
    STORE_ONLY_EXTS: [
      '.doc',
      '.xls',
      '.ppt',
      '.zip', '.rar', '.7z',
      '.html', '.htm', '.mht'
    ],
/** 整类仅存储的文档类型（与 server STORE_ONLY_DOC_TYPES 同步） */
    STORE_ONLY_DOC_TYPES: [
      'bid_eval_report',
      'handover_list',
      'other_attach',
      'approval',
      'prequal_notice',
      'prequal_doc',
      'prequal_review'
    ],
    get ALLOWED_EXTS() {
      return [...this.MINERU_EXTS, ...this.TEXT_EXTS, ...this.STORE_ONLY_EXTS];
    },
    get ACCEPT_ATTR() {
      return this.ALLOWED_EXTS.join(',');
    }
  },

  /**
   * @param {string} fileName
   * @returns {string} 小写扩展名（含点）
   */
  getFileExt(fileName) {
    if (!fileName) return '';
    const idx = String(fileName).lastIndexOf('.');
    if (idx < 0) return '';
    return String(fileName).slice(idx).toLowerCase();
  },

  /** 是否允许上传 */
  isAllowedFile(fileName) {
    return this.FILE_TYPES.ALLOWED_EXTS.includes(this.getFileExt(fileName));
  },

  /** 允许上传格式提示文案（不含点，顿号分隔） */
  getAllowedExtHintText() {
    return this.FILE_TYPES.ALLOWED_EXTS.map(ext => ext.slice(1)).join('、');
  },

  /** 文档类型是否整类仅存储（评标报告 / 交接清单 / 其它附件等） */
  isStoreOnlyDocType(docType) {
    if (docType && this.DOC_TYPES[docType] && this.DOC_TYPES[docType].storeOnly) return true;
    return this.FILE_TYPES.STORE_ONLY_DOC_TYPES.includes(docType);
  },

  /**
   * 是否需 MineRU 转 MD（整类仅存类型否）
   * @param {string} fileName
   * @param {string} [docType]
   */
  needsMineruFile(fileName, docType) {
    if (this.isStoreOnlyDocType(docType)) return false;
    return this.FILE_TYPES.MINERU_EXTS.includes(this.getFileExt(fileName));
  },

  /**
   * 可 AI 提取（MinerU 类型 / md / txt；整类仅存类型一律不可提取）
   * @param {string} fileName
   * @param {string} [docType]
   */
  isExtractableFile(fileName, docType) {
    if (this.isStoreOnlyDocType(docType)) return false;
    const ext = this.getFileExt(fileName);
    return this.FILE_TYPES.MINERU_EXTS.includes(ext)
      || this.FILE_TYPES.TEXT_EXTS.includes(ext);
  },

  /** 仅存储扩展名 */
  isStoreOnlyFile(fileName) {
    return this.FILE_TYPES.STORE_ONLY_EXTS.includes(this.getFileExt(fileName));
  },

  /**
   * 是否按仅存储展示/统计（扩展名仅存，或整类仅存）
   * @param {string} fileName
   * @param {string} [docType]
   */
  isStoreOnlyUpload(fileName, docType) {
    return this.isStoreOnlyDocType(docType) || this.isStoreOnlyFile(fileName);
  },

  /**
   * 是否可标记「含纸质」（有效上传状态）
   * @param {{ status?: string }} file
   * @returns {boolean}
   */
  canMarkPaperFile(file) {
    if (!file || !file.status) return false;
    return ['uploaded', 'done', 'success'].includes(file.status);
  },

  /**
   * 文件所属分类展示（含多标段标段名）
   * @param {string} docType
   * @param {number} [segmentNo]
   * @param {Array<{name?: string}>} [segments]
   * @returns {string}
   */
  formatFileDocCategory(docType, segmentNo, segments) {
    const info = this.DOC_TYPES[docType];
    const label = (info && info.label) || docType || '—';
    const segNo = Number(segmentNo) || 0;
    if (segNo > 0 && Array.isArray(segments) && segments.length > 1) {
      const seg = segments[segNo - 1];
      const segName = (seg && seg.name) ? seg.name : `标段${segNo}`;
      return `${label} · ${segName}`;
    }
    return label;
  },

  /**
   * 字段元数据定义（用于复核表单渲染）
   * 含系统项目编号 + 招标文件编号等分组字段
   */
  FIELDS: [
    { key: 'projectNo', label: '项目编号', group: 'basic', type: 'text', required: true },
    // 2026-08-27: 招标文件编号与系统项目编号分开，提取结果写入本字段，不覆盖 projectNo
    { key: 'tenderDocNo', label: '招标文件编号', group: 'basic', type: 'text', required: false },
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
    // allowCreate: 复核页用 autocomplete，可选建议或手输，失焦即保留
    { key: 'roadLevel', label: '道路等级', group: 'tender', type: 'enum', enumKey: 'roadLevel', required: false, allowCreate: true },
    { key: 'totalInvestment', label: '项目总投资（万元）', group: 'overview', type: 'number', required: false },
    { key: 'projectOverview', label: '项目概况', group: 'overview', type: 'textarea', required: false },
    { key: 'contractName', label: '合同名称', group: 'contract', type: 'text', required: false },
    { key: 'entrustDate', label: '委托时间', group: 'contract', type: 'partialDate', required: false },
    { key: 'entrustAmount', label: '委托金额(万元)', group: 'contract', type: 'number', required: false },
    { key: 'projectManager', label: '项目负责人', group: 'contract', type: 'text', required: false },
    { key: 'techManager', label: '技术负责人', group: 'contract', type: 'text', required: false },
    { key: 'otherMembers', label: '其他参与人员', group: 'contract', type: 'text', required: false },
    { key: 'publicDate', label: '公示时间', group: 'result', type: 'text', required: false },
    { key: 'winUnit', label: '中标单位', group: 'result', type: 'text', required: false },
    { key: 'winAmount', label: '中标金额（万元）', group: 'result', type: 'number', required: false },
    { key: 'winNoticeDate', label: '中标通知书时间', group: 'result', type: 'date', required: true },
    { key: 'sealUnit', label: '中标通知书盖章单位', group: 'result', type: 'enum', enumKey: 'sealUnit', required: false },
    // 2026-10-25: 履约评价独立区块，字段按标段填写；招标人/联系人优先取履约评价，无则取招标文件
    { key: 'evalDate', label: '评价书出具时间', group: 'evaluation', type: 'partialDate', required: false },
    { key: 'tenderUnit', label: '招标人', group: 'evaluation', type: 'text', required: false },
    { key: 'contactInfo', label: '联系人及电话', group: 'evaluation', type: 'text', required: false }
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
    { key: 'evaluation', label: '履约评价' }
  ],

  // ==================== 工具函数 ====================

  /**
   * 解析部分日期（年 / 年月 / 年月日）
   * @param {*} raw
   * @returns {{ ok: boolean, empty?: boolean, start?: string|null, end?: string|null, precision?: 'year'|'month'|'day'|null, normalized?: string, error?: string }}
   */
  parsePartialDate(raw) {
    if (raw === null || raw === undefined) {
      return { ok: true, empty: true, start: null, end: null, precision: null, normalized: '' };
    }
    let s = String(raw).trim();
    if (!s) {
      return { ok: true, empty: true, start: null, end: null, precision: null, normalized: '' };
    }
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
    const pad2 = (n) => String(n).padStart(2, '0');
    const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
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
    if (hasDay && (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month))) {
      return { ok: false, error: '日期不存在，请检查年月日' };
    }
    if (!hasMonth) {
      return { ok: true, start: `${year}-01-01`, end: `${year}-12-31`, precision: 'year', normalized: String(year) };
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
    return { ok: true, start: date, end: date, precision: 'day', normalized: date };
  },

  /**
   * 规范化部分日期；非法/为空返回空串
   * @param {*} raw
   * @returns {string}
   */
  normalizePartialDate(raw) {
    const parsed = this.parsePartialDate(raw);
    return parsed.ok ? (parsed.normalized || '') : '';
  },

  /**
   * 是否为合法的部分日期（空值视为合法）
   * @param {*} raw
   * @returns {boolean}
   */
  isValidPartialDate(raw) {
    return this.parsePartialDate(raw).ok;
  },

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
   * 模糊匹配标段名称，返回匹配的标段号（1-based），未匹配返回 0
   * @param {string} name - 待匹配的标段名称
   * @param {Array<{name?: string}>} segments - 标段配置列表
   * @returns {number}
   */
  fuzzyMatchSegmentName(name, segments) {
    if (!name || !Array.isArray(segments) || segments.length === 0) return 0;

    const normalize = (s) => (s || '').trim().replace(/\s+/g, '');
    const inputNorm = normalize(name);

    const cnNumMap = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
      '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
      '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
      '壹': '1', '贰': '2', '叁': '3', '肆': '4', '伍': '5',
      '陆': '6', '柒': '7', '捌': '8', '玖': '9'
    };

    const extractNumber = (s) => {
      const norm = normalize(s);
      const cnMatch = norm.match(/第([一二三四五六七八九十①②③④⑤⑥⑦⑧⑨⑩壹贰叁肆伍陆柒捌玖])/);
      if (cnMatch) {
        return cnNumMap[cnMatch[1]] || cnMatch[1];
      }
      const numMatch = norm.match(/(\d+)/);
      if (numMatch) return numMatch[1];
      const letterMatch = norm.match(/([A-Za-z])/);
      if (letterMatch) return letterMatch[1].toUpperCase();
      return norm;
    };

    const inputNum = extractNumber(name);

    for (let i = 0; i < segments.length; i++) {
      const segNorm = normalize(segments[i].name);

      if (inputNorm === segNorm) return i + 1;

      if (inputNorm.includes(segNorm) || segNorm.includes(inputNorm)) return i + 1;

      const segNum = extractNumber(segments[i].name);
      if (inputNum && segNum && inputNum === segNum) return i + 1;
    }

    return 0;
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
