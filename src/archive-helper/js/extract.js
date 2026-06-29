/**
 * extract.js - 文档信息提取逻辑
 * 提供6类文档的 Prompt 模板、AI 提取调用、字段合并与冲突检测
 */

window.Extract = {

  // ==================== Prompt 模板 ====================

  PROMPTS: {

    /**
     * 招标公告截图 — 提取公告时间与公告媒体
     */
    tender_notice: `你是专业的招标信息提取助手。请从以下招标公告截图的 Markdown 文本中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- announceDate: 公告时间，返回 YYYY-MM-DD 格式
- announceMedia: 公告发布的媒体/平台名称

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"announceDate":"...","announceMedia":"..."}

文档内容：
{{content}}`,

    /**
     * 招标文件 — 提取14个核心字段
     */
    tender_doc: `你是专业的招标信息提取助手。请从以下招标文件的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectNo: 项目编号（招标文件编号）
- projectType: 项目类型，必须从以下选项中严格选择：["招投标","政府采购","招投标+政府采购"]
- province: 项目所在省份（不要带"省"字）
- industry: 行业，必须从以下选项中严格选择：["公路","水运","航空","铁路","市政","建筑房地产","电力","化工医药","机械电子","能源工业","冶金矿产","农林水利","轻纺食品","环保","旅游","其它"]
- projectName: 招标项目名称
- tenderType: 招标类型/招标内容，必须从以下选项中严格选择：["规划编制","项目业主","项目管理","可研","勘察","设计","勘察设计","设计施工总承包","设备材料","施工","施工监理","试验检测","保险","其他"]
- tenderMethod: 招标/采购方式，必须从以下选项中严格选择：["邀请招标","公开招标","竞争性谈判","竞争性磋商","询价","单一来源采购","比选"]
- orgMode: 项目管理组织模式
- buildType: 招标项目建设类型，必须从以下选项中严格选择：["新建","改扩建","养护/大中修"]
- mileage: 里程（如包含起讫桩号请一并保留）
- roadLevel: 道路等级，必须从以下选项中严格选择：["高速公路","一级路","二级路"]
- projectOverview: 项目概况（长文本，保留原始内容）
- totalInvestment: 项目总投资，返回纯数字（万元）
- tenderUnit: 招标人名称
- contactInfo: 联系人及电话

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回纯数字（万元），不要带单位
4. 枚举字段必须严格从给定选项中选择，不要自创
5. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectNo":"...","projectType":"...",...}

文档内容：
{{content}}`,

    /**
     * 中标通知书 — 提取6个字段
     */
    win_notice: `你是专业的招标信息提取助手。请从以下中标通知书的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 招标项目名称
- winUnit: 中标单位名称
- winAmount: 中标金额，返回纯数字（万元）
- winNoticeDate: 中标通知书时间，返回 YYYY-MM-DD 格式
- sealUnit: 盖章单位，必须从以下选项中严格选择：["招标人","招标代理","招标人+招标代理","招标人+招标代理+交易中心","招标人+交易中心","招标代理+交易中心","其他"]
- tenderUnit: 招标人名称

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回纯数字（万元），不要带单位
4. 枚举字段必须严格从给定选项中选择，不要自创
5. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","winUnit":"...",...}

文档内容：
{{content}}`,

    /**
     * 中标公示 — 提取2个字段
     */
    win_public: `你是专业的招标信息提取助手。请从以下中标公示的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- publicDate: 公示发布时间，返回 YYYY-MM-DD 格式
- winUnit: 中标单位名称

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"publicDate":"...","winUnit":"..."}

文档内容：
{{content}}`,

    /**
     * 履约评价 — 提取4个字段
     */
    evaluation: `你是专业的招标信息提取助手。请从以下履约评价书的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名
- otherMembers: 其他参与人员姓名（多人用顿号、逗号分隔）
- evalDate: 评价书出具时间，返回 YYYY-MM-DD 格式

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectManager":"...","techManager":"...","otherMembers":"...","evalDate":"..."}

文档内容：
{{content}}`,

    /**
     * 代理服务合同 — 提取7个字段
     */
    contract: `你是专业的招标信息提取助手。请从以下代理服务合同的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- contractName: 合同名称
- entrustDate: 委托时间，返回 YYYY-MM-DD 格式
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名
- otherMembers: 其他参与人员姓名（多人用顿号、逗号分隔）
- entrustAmount: 委托金额/合同金额，返回纯数字（万元）
- contactInfo: 联系人及电话

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回纯数字（万元），不要带单位
4. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"contractName":"...","entrustDate":"...",...}

文档内容：
{{content}}`

  },

  // ==================== 文档类型与字段映射 ====================

  /** 各类文档可提取的字段列表 */
  DOC_TYPE_FIELDS: {
    tender_notice: ['announceDate', 'announceMedia'],
    tender_doc: ['projectNo', 'projectType', 'province', 'industry', 'projectName', 'tenderType', 'tenderMethod', 'orgMode', 'buildType', 'mileage', 'roadLevel', 'projectOverview', 'totalInvestment', 'tenderUnit', 'contactInfo'],
    win_notice: ['projectName', 'winUnit', 'winAmount', 'winNoticeDate', 'sealUnit', 'tenderUnit'],
    win_public: ['publicDate', 'winUnit'],
    evaluation: ['projectManager', 'techManager', 'otherMembers', 'evalDate'],
    contract: ['contractName', 'entrustDate', 'projectManager', 'techManager', 'otherMembers', 'entrustAmount', 'contactInfo']
  },

  /** 字段合并优先级（数字越小优先级越高） */
  SOURCE_PRIORITY: {
    tender_doc: 1,
    win_notice: 2,
    contract: 3,
    tender_notice: 4,
    win_public: 5,
    evaluation: 6
  },

  // ==================== 核心方法 ====================

  /**
   * 从单份文档中提取结构化信息
   * @param {string} docType - 文档类型（tender_notice / tender_doc / win_notice / win_public / evaluation / contract）
   * @param {string} content - 文档 Markdown 内容
   * @returns {Promise<Object>} 提取结果 JSON 对象
   */
  async extractFromDocument(docType, content) {
    // 1. 获取对应 Prompt 模板
    const promptTemplate = this.PROMPTS[docType];
    if (!promptTemplate) {
      throw new Error(`不支持的文档类型: ${docType}`);
    }

    // 2. 将 content 替换为实际文档内容
    const prompt = promptTemplate.replace('{{content}}', content);

    // 3. 调用 DeepSeek API
    const result = await window.API.callDeepSeek(prompt);

    // 4. 返回提取结果（API 已返回 JSON 对象）
    return result;
  },

  /**
   * 合并项目所有已提取的文档数据，检测冲突并保存
   * @param {string} projectId - 项目ID
   * @returns {Promise<Object>} 合并后的完整字段数据（含冲突标记）
   */
  async mergeExtractedData(projectId) {
    // 1. 从 DB 获取项目所有已成功提取的文件
    const allFiles = await window.DB.getProjectFiles(projectId);
    const extractedFiles = allFiles.filter(f => f.status === 'success' && f.extracted);

    if (extractedFiles.length === 0) {
      return {};
    }

    // 2. 按优先级排序：tender_doc > win_notice > contract > tender_notice > win_public > evaluation
    extractedFiles.sort((a, b) => {
      const pa = this.SOURCE_PRIORITY[a.docType] || 99;
      const pb = this.SOURCE_PRIORITY[b.docType] || 99;
      return pa - pb;
    });

    // 3. 遍历 30 个字段，收集各来源中的值
    const merged = {};
    const plainValues = {}; // 纯值版本，用于保存到 DB

    for (const fieldMeta of window.Utils.FIELDS) {
      const fieldKey = fieldMeta.key;
      const sources = []; // 收集该字段在各来源中的值

      for (const file of extractedFiles) {
        const docType = file.docType;
        const extracted = file.extracted;
        if (!extracted || !(fieldKey in extracted)) continue;

        const rawValue = extracted[fieldKey];
        // 排除 null、undefined、空字符串
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
          continue;
        }

        sources.push({ docType, value: rawValue });
      }

      if (sources.length === 0) {
        // 没有任何来源提取到该字段
        merged[fieldKey] = {
          value: null,
          source: null,
          conflict: false,
          sources: []
        };
        plainValues[fieldKey] = null;
        continue;
      }

      if (sources.length === 1) {
        // 只有一个来源有值，直接使用
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.docType,
          conflict: false,
          sources: sources
        };
        plainValues[fieldKey] = src.value;
        continue;
      }

      // 多个来源有值，检查是否冲突
      const firstNormalized = this._normalizeValue(sources[0].value);
      let hasConflict = false;

      for (let i = 1; i < sources.length; i++) {
        const currNormalized = this._normalizeValue(sources[i].value);
        if (!this._valuesEqual(firstNormalized, currNormalized)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // 多个来源值相同，使用优先级最高的值（排序后第一个）
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.docType,
          conflict: false,
          sources: sources
        };
        plainValues[fieldKey] = src.value;
      } else {
        // 存在冲突，取优先级最高的值，但标记冲突
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.docType,
          conflict: true,
          sources: sources
        };
        plainValues[fieldKey] = src.value;
      }
    }

    // 4. 将纯值版本保存到 DB
    await window.DB.saveMergedData(projectId, plainValues);

    return merged;
  },

  /**
   * 获取某文档类型能提取的字段 key 数组
   * @param {string} docType - 文档类型
   * @returns {string[]} 字段 key 数组
   */
  getDocTypeFields(docType) {
    return this.DOC_TYPE_FIELDS[docType] || [];
  },

  // ==================== 内部工具方法 ====================

  /**
   * 将值归一化，用于冲突比较
   * - 数字保持不变
   * - 字符串去除首尾空格
   * - 日期统一为 YYYY-MM-DD 格式
   * - null / undefined / 空字符串 返回 null
   * @param {*} val - 原始值
   * @returns {*|null} 归一化后的值
   * @private
   */
  _normalizeValue(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;

    const s = String(val).trim();
    if (s === '') return null;

    // 尝试日期统一格式
    if (typeof dayjs !== 'undefined') {
      const d = dayjs(s);
      if (d.isValid()) {
        return d.format('YYYY-MM-DD');
      }
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return window.Utils.formatDate(d);
      }
    }

    return s;
  },

  /**
   * 比较两个归一化后的值是否相等
   * @param {*} a - 归一化值 A
   * @param {*} b - 归一化值 B
   * @returns {boolean}
   * @private
   */
  _valuesEqual(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a === b;
  }

};
