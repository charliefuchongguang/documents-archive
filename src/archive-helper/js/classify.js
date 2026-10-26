/**
 * classify.js - 「从文件夹导入」的归类工具
 * 提供基于文件夹/文件名关键词的规则归类、标段号解析、脏文件过滤，以及 AI 内容识别兜底调用
 * 挂载到全局 window.Classify
 */
window.Classify = {

  /** 归档目录模板（由 /api/archive-templates 加载） */
  templates: {},
  templateCode: '',

  /**
   * 设置归档模板列表
   * @param {Array} templates
   */
  setTemplates(templates) {
    const map = {};
    for (const t of (templates || [])) {
      if (t && t.code) map[t.code] = t;
    }
    this.templates = map;
  },

  /**
   * 设置当前项目的归档模板编码
   * @param {string} code
   */
  setTemplateCode(code) {
    this.templateCode = code || '';
  },

  /**
   * 获取当前模板
   * @returns {Object|null}
   */
  getCurrentTemplate() {
    return this.templates[this.templateCode] || null;
  },

  /**
   * 归一化目录名：去序号、空白、标点、空目录后缀
   * @param {string} name
   * @returns {string}
   */
  normalizeFolderName(name) {
    return String(name || '')
      .replace(/^\s*\d+\s*[、.．,，:：)）\-_]*\s*/, '')
      .replace(/（空）/g, '')
      .replace(/\(空\)/g, '')
      .replace(/[\s、，,。.．:：()（）\-_]/g, '')
      .trim();
  },

  /**
   * 按路径中的文件夹名匹配归档模板目录
   * @param {string} relativePath
   * @returns {{folderKey: string, folderLabel: string, reason: string}|null}
   */
  matchFolderKey(relativePath) {
    const template = this.getCurrentTemplate();
    if (!template || !Array.isArray(template.items) || template.items.length === 0) return null;

    const segments = String(relativePath || '').split(/[\\/]/).filter(Boolean);
    const folders = segments.slice(0, -1);
    if (folders.length === 0) return null;

    for (let i = folders.length - 1; i >= 0; i--) {
      const folderNorm = this.normalizeFolderName(folders[i]);
      if (!folderNorm) continue;
      let best = null;

      for (const item of template.items) {
        const nameNorm = this.normalizeFolderName(item.folderName || item.name);
        const keywords = (item.keywords || []).map((k) => this.normalizeFolderName(k)).filter(Boolean);
        let score = 0;
        if (folderNorm === nameNorm) score = 100;
        else if (nameNorm && folderNorm.includes(nameNorm)) score = 90;
        else if (nameNorm && nameNorm.includes(folderNorm)) score = 80;
        else if (keywords.some((k) => folderNorm.includes(k))) score = 60;

        if (score > 0 && (!best || score > best.score)) {
          best = { item, score };
        }
      }

      if (best) {
        return {
          folderKey: `${template.code}:${best.item.key}`,
          folderLabel: best.item.name,
          docTypes: best.item.docTypes || [],
          reason: `归档目录「${best.item.name}」`
        };
      }
    }
    return null;
  },

  /**
   * 招标项目固定文件夹结构 → 文档类型规则
   * 匹配时按关键词长度倒序，避免「中标公示」误命中「中标候选人公示」等更具体的名称
   */
  FOLDER_RULES: [
    { docType: 'contract', keywords: ['代理服务合同', '委托代理合同', '招标代理合同', '代理合同', '委托合同', '服务合同'] },
    { docType: 'approval', keywords: ['批复'] },
    { docType: 'prequal_notice', keywords: ['资格预审公告'] },
    { docType: 'prequal_review', keywords: ['资格预审评审报告', '资格预审报告', '评审报告'] },
    { docType: 'prequal_doc', keywords: ['资格预审申请文件', '资格预审文件', '资格预审'] },
    { docType: 'tender_doc', keywords: ['招标文件', '招标正文', '招标文书', '采购文件', '询比文件', '谈判文件'] },
    { docType: 'bid_eval_report', keywords: ['评标报告', '评标记录', '评标结果报告'] },
    { docType: 'win_public', keywords: ['中标候选人公示', '中标结果公告', '评标结果公示', '候选人公示', '中标公示', '结果公示'] },
    { docType: 'win_notice', keywords: ['中标通知书', '成交通知书', '中标通知', '成交通知'] },
    { docType: 'evaluation', keywords: ['履约评价', '评价书', '履约情况'] },
    { docType: 'handover_list', keywords: ['资料交接单', '交接清单', '移交清单', '交接单', '移交单'] },
    { docType: 'tender_notice', keywords: ['招标公告截图', '公告截图', '招标公告', '采购公告'] }
  ],

  /** 需要跳过的系统/临时文件 */
  JUNK_NAMES: ['.ds_store', 'thumbs.db', 'desktop.ini'],

  /** 单次导入文件数上限 */
  MAX_FILE_COUNT: 300,

  /**
   * 归一化名称：剥离前导序号与标点、去空格
   * 如「0、代理合同」→「代理合同」
   * @param {string} s
   * @returns {string}
   */
  normalizeName(s) {
    return String(s || '')
      .replace(/^\s*\d+\s*[、.．,，:：)）\-_]*\s*/, '')
      .replace(/\s+/g, '')
      .trim();
  },

  /**
   * 是否为应跳过的系统/临时文件
   * @param {string} name
   * @returns {boolean}
   */
  isJunkFile(name) {
    const base = String(name || '').split(/[\\/]/).pop().toLowerCase();
    if (!base) return true;
    if (base.startsWith('~$')) return true;
    if (base.startsWith('.')) return true;
    return this.JUNK_NAMES.includes(base);
  },

  /**
   * 是否允许上传（与逐类上传一致）
   * @param {string} name
   * @returns {boolean}
   */
  isSupportedFile(name) {
    return window.Utils.isAllowedFile(name);
  },

  /**
   * 在给定文本中按关键词长度倒序匹配规则
   * @param {string} text
   * @returns {{docType: string, keyword: string}|null}
   */
  matchKeyword(text) {
    const normalized = this.normalizeName(text);
    if (!normalized) return null;

    let best = null;
    for (const rule of this.FOLDER_RULES) {
      for (const kw of rule.keywords) {
        if (normalized.includes(kw)) {
          if (!best || kw.length > best.keyword.length) {
            best = { docType: rule.docType, keyword: kw };
          }
        }
      }
    }
    return best;
  },

  /**
   * 按相对路径归类：先看文件夹名，再看文件名
   * @param {string} relativePath - 如「5、招标文件/正文.pdf」
   * @returns {{docType: string, confidence: string, reason: string, segmentNo: number}|null}
   */
  matchByPath(relativePath) {
    const segments = String(relativePath || '').split(/[\\/]/).filter(Boolean);
    if (segments.length === 0) return null;
    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    for (const folder of folderSegments) {
      const hit = this.matchKeyword(folder);
      if (hit) {
        return {
          docType: hit.docType,
          confidence: 'high',
          reason: `文件夹「${folder}」命中关键词「${hit.keyword}」`,
          segmentNo: this.parseSegmentNo(relativePath)
        };
      }
    }

    const fileHit = this.matchKeyword(fileName);
    if (fileHit) {
      return {
        docType: fileHit.docType,
        confidence: 'medium',
        reason: `文件名命中关键词「${fileHit.keyword}」`,
        segmentNo: this.parseSegmentNo(relativePath)
      };
    }

    return null;
  },

  /**
   * 从路径/文件名解析标段号（第一标段 / 一标段 / 1标段 → 1）
   * @param {string} text
   * @returns {number} 0 表示未识别
   */
  parseSegmentNo(text) {
    const s = String(text || '');
    const match = s.match(/第?\s*([一二三四五六七八九十百零〇\d]+)\s*标段/);
    if (!match) return 0;
    const n = this._cnToNumber(match[1]);
    return n > 0 ? n : 0;
  },

  /**
   * 中文数字（含十位）转阿拉伯数字
   * @param {string} token
   * @returns {number}
   * @private
   */
  _cnToNumber(token) {
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (token === '十') return 10;
    if (token === '百') return 100;
    const tenMatch = token.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
    if (tenMatch) {
      const tens = tenMatch[1] ? digits[tenMatch[1]] : 1;
      const ones = tenMatch[2] ? digits[tenMatch[2]] : 0;
      return tens * 10 + ones;
    }
    let value = 0;
    for (const ch of token) {
      if (ch in digits) value = value * 10 + digits[ch];
    }
    return value;
  },

  /**
   * 扫描文件夹选择结果，生成带规则归类的候选列表
   * @param {FileList|Array<File>} fileList
   * @returns {{ items: Array, junkCount: number, unsupportedCount: number, truncated: boolean }}
   */
  scan(fileList) {
    const all = Array.from(fileList || []);
    const items = [];
    let junkCount = 0;
    let unsupportedCount = 0;
    let truncated = false;

    for (const file of all) {
      const relativePath = file.webkitRelativePath || file.name;
      const baseName = String(relativePath).split(/[\\/]/).pop();

      if (this.isJunkFile(baseName)) {
        junkCount += 1;
        continue;
      }
      if (!this.isSupportedFile(baseName)) {
        unsupportedCount += 1;
        continue;
      }
      if (items.length >= this.MAX_FILE_COUNT) {
        truncated = true;
        continue;
      }

      const hit = this.matchByPath(relativePath);
      const folderHit = this.matchFolderKey(relativePath);
      const folderDocType = folderHit && folderHit.docTypes && folderHit.docTypes.length
        ? folderHit.docTypes[0]
        : (folderHit ? 'other_attach' : '');
      const docType = hit ? hit.docType : folderDocType;
      const reasons = [hit ? hit.reason : '', folderHit ? folderHit.reason : ''].filter(Boolean);
      items.push({
        file,
        relativePath,
        fileName: baseName,
        docType,
        folderKey: folderHit ? folderHit.folderKey : '',
        folderLabel: folderHit ? folderHit.folderLabel : '',
        folderDocTypes: folderHit ? (folderHit.docTypes || []) : [],
        segmentNo: hit ? hit.segmentNo : this.parseSegmentNo(relativePath),
        source: hit ? 'rule' : (folderHit ? 'folder' : ''),
        confidence: hit ? hit.confidence : (folderHit ? 'high' : ''),
        reason: reasons.length > 0 ? reasons.join('；') : '文件名/文件夹未命中规则，需指定或 AI 识别',
        aiLoading: false
      });
    }

    return { items, junkCount, unsupportedCount, truncated };
  },

  /**
   * 调用后端 AI 内容识别（兜底）
   * @param {File} file
   * @returns {Promise<{docType: string, confidence: string, reason: string}>}
   */
  async aiClassify(file) {
    const formData = new FormData();
    formData.append('file', file);
    const result = await window.Http.upload('/files/classify', formData);
    return {
      docType: result.docType || 'other_attach',
      confidence: result.confidence || 'low',
      reason: result.reason || 'AI 识别'
    };
  },

  /**
   * 文档类型标签
   * @param {string} docType
   * @returns {string}
   */
  docTypeLabel(docType) {
    const info = window.Utils.DOC_TYPES[docType];
    return (info && info.label) || docType || '—';
  }
};