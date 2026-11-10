/**
 * extract.js - 文档信息提取逻辑
 * 提供6类文档的 Prompt 模板、AI 提取调用、字段合并与冲突检测
 */

window.Extract = {

  // ==================== Prompt 模板 ====================

  PROMPTS: {

    /**
     * 招标公告截图 — 提取公告时间、公告媒体与最高限价
     */
    tender_notice: `你是专业的招标信息提取助手。请从以下招标公告截图的 Markdown 文本中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- announceDate: 公告时间，返回 YYYY-MM-DD 格式
- announceMedia: 公告发布的媒体/平台名称
- entrustAmount: 最高限价/最高投标限价金额（写入委托金额字段）。仅当文档明确出现「最高限价」「最高投标限价」「最高限价金额」「招标控制价」等表述时提取，返回纯数字（万元）。禁止使用合同金额、中标金额、投标报价、总投资、代理服务费或其它金额；未找到最高限价时必须返回 null

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回纯数字（万元），不要带单位
4. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"announceDate":"...","announceMedia":"...","entrustAmount":null}

文档内容：
{{content}}`,

    /**
     * 招标文件 — 提取核心字段（含最高限价→委托金额）
     */
    tender_doc: `你是专业的招标信息提取助手。请从以下招标文件的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- tenderDocNo: 招标文件编号（文档中的项目编号/招标编号，不是系统归档编号）
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
- totalInvestment: 项目总投资（整个建设项目的投资规模），返回纯数字（万元）。仅当文档明确写明「项目总投资」「工程总投资」「总投资」等时提取；禁止用最高限价、合同金额、中标金额、投标报价等替代；未找到返回 null
- entrustAmount: 最高限价/最高投标限价金额（写入委托金额字段）。仅当文档明确出现「最高限价」「最高投标限价」「最高限价金额」「招标控制价」等表述时提取，返回纯数字（万元）。禁止使用合同金额、中标金额、投标报价、总投资、代理服务费或其它金额；未找到最高限价时必须返回 null
- tenderUnit: 招标人名称
- contactInfo: 业主（招标人/采购人/建设单位）的联系人姓名及电话。必须取业主侧联系方式；禁止提取招标代理、代理机构、咨询公司或投标人的联系人及电话。格式如「张三 138xxxxxxxx」。未找到业主联系方式时返回 null
- segments: 标段名称列表（数组），从招标文件中提取所有标段名称。如果文档中提到了多个标段（如"第一标段"、"第二标段"等），请全部提取并返回数组。如果只有单个标段或没有标段信息，返回空数组[]
- segmentEntrustAmounts: 各标段最高限价列表（数组）。若文档按标段分别列出「最高限价」「最高投标限价」「招标控制价」，逐项提取为委托金额（万元）。格式：[{"segmentName":"第一标段","entrustAmount":1200},{"segmentName":"第二标段","entrustAmount":800}]。仅提取上述限价表述，禁止用中标价、合同价、投标报价、总投资、代理服务费等替代；某标段未找到则 entrustAmount 为 null。文档仅一个总限价、无分标段表时返回空数组[]。金额统一为万元（文档为「元」时除以10000）

规则：
1. 如果某个字段在文档中未找到，返回 null（segments、segmentEntrustAmounts 无数据时返回 []）
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回纯数字（万元），不要带单位
4. 枚举字段必须严格从给定选项中选择，不要自创
5. segments 必须是字符串数组，每个元素是一个标段的完整名称
6. segmentEntrustAmounts 中 segmentName 尽量与 segments 数组中的名称一致
7. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"tenderDocNo":"...","projectType":"...","entrustAmount":null,"segments":["第一标段","第二标段",...],"segmentEntrustAmounts":[{"segmentName":"第一标段","entrustAmount":1200},...],...}

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
- segmentName: 标段名称（如"第一标段"、"一标段"、"A标段"等，如果文档中没有标段信息则返回空字符串）

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
     * 中标公示 — 提取4个字段
     */
    win_public: `你是专业的招标信息提取助手。请从以下中标公示的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 招标项目名称
- publicDate: 公示发布时间，返回 YYYY-MM-DD 格式
- winUnit: 中标单位名称
- segmentName: 标段名称（如果文档中提及标段信息则提取，否则返回空字符串）

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"publicDate":"...","winUnit":"..."}

文档内容：
{{content}}`,

    /**
     * 履约评价 — 提取人员、评价时间与业主联系方式
     */
    evaluation: `你是专业的招标信息提取助手。请从以下履约评价书的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名
- otherMembers: 其他参与人员姓名（多人用顿号、逗号分隔）
- evalDate: 评价书出具时间，返回 YYYY-MM-DD 格式
- tenderUnit: 招标人/采购人/建设单位/委托方名称（业主名称）
- contactInfo: 业主（招标人/采购人/建设单位/委托方）的联系人姓名及电话。必须取业主侧联系方式；禁止提取招标代理、代理机构或评价人自身的联系人及电话。格式如「张三 138xxxxxxxx」。未找到业主联系方式时返回 null
- segmentName: 标段名称（如「第一标段」「一标段」「A标段」等；文档中没有标段信息则返回空字符串）

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectManager":"...","techManager":"...","otherMembers":"...","evalDate":"...","tenderUnit":"...","contactInfo":null,"segmentName":""}

文档内容：
{{content}}`,

    /**
     * 代理服务合同 — 提取合同、人员与项目总投资（委托金额/联系人另从来源提取）
     */
    contract: `你是专业的招标信息提取助手。请从以下代理服务合同的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- contractName: 合同名称
- entrustDate: 委托时间。优先返回 YYYY-MM-DD；文档只有年月时返回 YYYY-MM；只有年份时返回 YYYY
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名
- otherMembers: 其他参与人员姓名（多人用顿号、逗号分隔）
- totalInvestment: 项目总投资（整个建设项目的投资规模），返回纯数字（万元）。仅当文档明确写明「项目总投资」「工程总投资」「总投资」等时提取；禁止使用合同金额、代理服务费、委托金额、中标金额等替代；未找到返回 null

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期优先返回 YYYY-MM-DD；委托时间在文档只有年月/年份时可返回 YYYY-MM / YYYY
3. 金额统一返回纯数字（万元），不要带单位；除 totalInvestment 外不要提取其它金额字段
4. 不要提取联系人及电话（无论业主还是代理）
5. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"contractName":"...","entrustDate":"...","totalInvestment":null,...}

文档内容：
{{content}}`,

    /**
     * 造价咨询合同 — 提取统计表 C/D/E/J/K/L/M/N/O/P
     */
    cost_contract: `你是专业的造价咨询合同信息提取助手。请从以下造价咨询合同的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称，即本合同对应的建设项目/委托项目名称。必须是项目本身名称，禁止返回「造价咨询合同」「咨询合同」等文件名或合同类型名称
- industry: 行业，优先保留文档原文（如「公路工程」「市政工程」「铁路工程」「房建工程」），不要强行归并为「公路」等短词
- costServiceContent: 造价咨询内容/咨询类别/服务范围，如「限价编制」「工程量清单及招标控制价编制」「竣工结算审计」
- contractName: 合同名称
- contractAmount: 合同金额，取合同价款/咨询酬金/咨询服务费的含税总额，返回纯数字（万元）。文档金额单位为元时除以 10000
- clientUnit: 委托单位，即合同甲方/委托人/建设单位名称，填写原文
- entrustDate: 合同签订日期（委托时间）。优先返回 YYYY-MM-DD；只有年月时返回 YYYY-MM；只有年份时返回 YYYY
- projectManager: 合同载明的项目负责人姓名
- techManager: 合同载明的技术负责人姓名
- otherMembers: 合同载明的其他参与人员姓名（多人用顿号、逗号分隔）
- mileage: 项目里程，仅当合同明确载明时返回，保留原文（含起讫桩号）
- roadLevel: 道路等级，仅当合同明确载明时返回，保留原文（如「高速公路」「一级公路」「二级公路」）
- projectOverview: 项目概况，仅当合同明确载明时返回，保留原文

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 金额统一返回纯数字（万元），不要带单位，不要返回千分位
3. 行业、道路等级、里程尽量保留文档原文，不要自行改写
4. 不要提取乙方、联系人、工期等统计表不需要的信息
5. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","industry":"...","costServiceContent":"...","contractName":"...","contractAmount":null,"clientUnit":"...","entrustDate":"...","projectManager":"...","techManager":"...","otherMembers":"...","mileage":null,"roadLevel":null,"projectOverview":null}

文档内容：
{{content}}`,

    /**
     * 造价咨询成果文件/限价说明/清单 — 提取统计表 C/D/E/F/G/H/I
     */
    cost_result: `你是专业的造价咨询成果文件信息提取助手。请从以下造价咨询成果文件、限价说明或工程量清单的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称，即本成果文件对应的建设项目名称
- industry: 行业，优先保留文档原文（如「公路工程」「市政工程」「铁路工程」「房建工程」），不要强行归并为「公路」等短词
- costServiceContent: 造价咨询内容/咨询类别/服务范围，如「限价编制」「工程量清单编制」「预算复核」
- costAmount: 造价金额（万元），取成果文件中的最高限价、招标控制价、预算造价、清单合计或工程造价总额，返回纯数字（万元）。如文档按标段/合同段分别列示，请汇总为项目总造价；禁止取合同金额、咨询费、代理费、中标金额
- mileage: 项目里程，保留原文（含起讫桩号）
- roadLevel: 道路等级，保留原文（如「高速公路」「一级公路」「二级公路」「三级公路」「市政道路」）
- projectOverview: 项目概况，保留原文长文本，重点保留桥梁、隧道等特殊信息

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 金额统一返回纯数字（万元），不要带单位，不要返回千分位
3. 行业、道路等级、里程尽量保留文档原文，不要自行改写
4. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","industry":"...","costServiceContent":"...","costAmount":null,"mileage":"...","roadLevel":"...","projectOverview":"..."}

文档内容：
{{content}}`,

    /**
     * 造价咨询业务原始资料 — 补充项目概况与造价金额
     */
    cost_raw_material: `你是专业的造价项目资料信息提取助手。请从以下造价咨询业务原始资料（招标文件、技术规范、工程量清单、设计文件、材料价格等）的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称
- industry: 行业，优先保留文档原文
- costServiceContent: 造价咨询内容/咨询类别/服务范围
- costAmount: 造价金额（万元）。仅当文档明确写明「最高限价」「招标控制价」「概算」「预算总额」「清单合计」等造价成果金额时提取；原始资料中的合同价、投标报价、材料单价不得作为造价金额；未明确时返回 null
- mileage: 项目里程，保留原文（含起讫桩号）
- roadLevel: 道路等级，保留原文
- projectOverview: 项目概况，保留原文长文本

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 金额统一返回纯数字（万元），不要带单位，不要返回千分位
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","industry":"...","costServiceContent":"...","costAmount":null,"mileage":"...","roadLevel":"...","projectOverview":"..."}

文档内容：
{{content}}`,

    /**
     * 造价咨询过程文件（质量控制记录表等） — 补充内容与人员
     */
    cost_process: `你是专业的造价咨询过程文件信息提取助手。请从以下造价咨询过程文件（质量控制记录表、编制/校审记录等）的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称
- industry: 行业，优先保留文档原文
- costServiceContent: 造价咨询内容/咨询类别/服务范围（如「工程量清单及限价编制」）
- clientUnit: 委托单位，填写原文
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名。优先取校核人/审核人/复核人，排除项目负责人
- otherMembers: 其他参与人员姓名（编制人及其他参与人员，排除项目负责人和技术负责人；多人用顿号、逗号分隔）

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 人员姓名只填姓名，不要附加职务说明
3. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","industry":"...","costServiceContent":"...","clientUnit":"...","projectManager":"...","techManager":"...","otherMembers":"..."}

文档内容：
{{content}}`,

    /**
     * 造价咨询履约评价 — 补充人员与委托单位
     */
    cost_evaluation: `你是专业的造价咨询履约评价信息提取助手。请从以下造价咨询工作履约评价表的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称
- costServiceContent: 造价咨询内容/咨询类别
- clientUnit: 委托单位，填写原文
- projectManager: 项目负责人姓名
- techManager: 技术负责人姓名
- otherMembers: 其他参与人员姓名（多人用顿号、逗号分隔）

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","costServiceContent":"...","clientUnit":"...","projectManager":"...","techManager":"...","otherMembers":"..."}

文档内容：
{{content}}`,

    /**
     * 咨询工作回访记录 — 补充项目名称、咨询内容与委托单位
     */
    cost_return_visit: `你是专业的造价咨询回访记录信息提取助手。请从以下咨询工作回访记录的 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectName: 项目名称
- costServiceContent: 造价咨询内容/咨询类别
- clientUnit: 委托单位，填写原文

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"projectName":"...","costServiceContent":"...","clientUnit":"..."}

文档内容：
{{content}}`

  },

  // ==================== 文档类型与字段映射 ====================

  /** 各类文档可提取的字段列表 */
  DOC_TYPE_FIELDS: {
    tender_notice: ['announceDate', 'announceMedia', 'entrustAmount'],
    tender_doc: ['tenderDocNo', 'projectType', 'province', 'industry', 'projectName', 'tenderType', 'tenderMethod', 'orgMode', 'buildType', 'mileage', 'roadLevel', 'projectOverview', 'totalInvestment', 'entrustAmount', 'tenderUnit', 'contactInfo', 'segments', 'segmentEntrustAmounts'],
    win_notice: ['projectName', 'winUnit', 'winAmount', 'winNoticeDate', 'sealUnit', 'tenderUnit', 'segmentName'],
    win_public: ['projectName', 'publicDate', 'winUnit', 'segmentName'],
    evaluation: ['projectManager', 'techManager', 'otherMembers', 'evalDate', 'tenderUnit', 'contactInfo', 'segmentName'],
    contract: ['contractName', 'entrustDate', 'projectManager', 'techManager', 'otherMembers', 'totalInvestment'],
    cost_contract: ['projectName', 'industry', 'costServiceContent', 'contractName', 'contractAmount', 'clientUnit', 'entrustDate', 'projectManager', 'techManager', 'otherMembers', 'mileage', 'roadLevel', 'projectOverview'],
    cost_result: ['projectName', 'industry', 'costServiceContent', 'costAmount', 'mileage', 'roadLevel', 'projectOverview'],
    cost_raw_material: ['projectName', 'industry', 'costServiceContent', 'costAmount', 'mileage', 'roadLevel', 'projectOverview'],
    cost_process: ['projectName', 'industry', 'costServiceContent', 'clientUnit', 'projectManager', 'techManager', 'otherMembers'],
    cost_evaluation: ['projectName', 'costServiceContent', 'clientUnit', 'projectManager', 'techManager', 'otherMembers'],
    cost_return_visit: ['projectName', 'costServiceContent', 'clientUnit']
  },

  /** 字段合并优先级（数字越小优先级越高） */
  SOURCE_PRIORITY: {
    tender_doc: 1,
    win_notice: 2,
    contract: 3,
    cost_contract: 1,
    cost_result: 2,
    cost_raw_material: 3,
    cost_process: 4,
    cost_evaluation: 5,
    cost_return_visit: 6,
    tender_notice: 4,
    win_public: 5,
    evaluation: 6
  },

  /** 标段级字段（与复核页保持一致） */
  SEGMENT_FIELDS: [
    'projectName', 'entrustAmount', 'winAmount', 'winUnit', 'winNoticeDate', 'sealUnit', 'publicDate',
    'evalDate', 'tenderUnit', 'contactInfo'
  ],

  /**
   * 字段级来源优先级（未配置的字段回落到 SOURCE_PRIORITY）
   * 履约评价中的招标人/联系人优先于招标文件
   */
  FIELD_SOURCE_PRIORITY: {
    tenderUnit: { evaluation: 1, tender_doc: 2, win_notice: 3, contract: 4, tender_notice: 5, win_public: 6 },
    contactInfo: { evaluation: 1, tender_doc: 2, win_notice: 3, contract: 4, tender_notice: 5, win_public: 6 },
    evalDate: { evaluation: 1 },
    // 造价咨询：合同负责合同类字段，成果文件负责造价/概况类字段
    projectName: { cost_contract: 1, cost_result: 2, cost_return_visit: 3, cost_process: 4, cost_evaluation: 5 },
    industry: { cost_result: 1, cost_raw_material: 2, cost_contract: 3, cost_process: 4 },
    costServiceContent: { cost_contract: 1, cost_process: 2, cost_return_visit: 3, cost_result: 4, cost_evaluation: 5 },
    costAmount: { cost_result: 1, cost_raw_material: 2 },
    mileage: { cost_result: 1, cost_raw_material: 2, cost_contract: 3 },
    roadLevel: { cost_result: 1, cost_raw_material: 2, cost_contract: 3 },
    projectOverview: { cost_result: 1, cost_raw_material: 2, cost_contract: 3 },
    contractName: { cost_contract: 1 },
    contractAmount: { cost_contract: 1 },
    clientUnit: { cost_contract: 1, cost_process: 2, cost_evaluation: 3, cost_return_visit: 4 },
    entrustDate: { cost_contract: 1 },
    projectManager: { cost_contract: 1, cost_process: 2, cost_evaluation: 3 },
    techManager: { cost_contract: 1, cost_process: 2, cost_evaluation: 3 },
    otherMembers: { cost_contract: 1, cost_process: 2, cost_evaluation: 3 }
  },

  /**
   * 获取字段在指定文档类型下的来源优先级
   * @param {string} fieldKey
   * @param {string} docType
   * @returns {number}
   */
  _getSourcePriority(fieldKey, docType) {
    const map = this.FIELD_SOURCE_PRIORITY[fieldKey];
    if (map && map[docType] !== undefined) return map[docType];
    return this.SOURCE_PRIORITY[docType] || 99;
  },

  // ==================== 核心方法 ====================

  /**
   * 从单份文档中提取结构化信息
   * @param {string} docType - 文档类型（tender_notice / tender_doc / win_notice / win_public / evaluation / contract / cost_*）
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
   * 已归档项目：优先读取落库的 merged-data（只读，不写回）
   * @param {string} projectId
   * @returns {Promise<Object>} 与 mergeExtractedData 相同的展示结构
   */
  async loadArchivedMergedData(projectId) {
    const stored = await window.DB.getMergedData(projectId);
    const plain = (stored && (stored.form_data || stored.formData)) || {};
    const conflicts = (stored && stored.conflicts) || {};

    const merged = {};
    for (const fieldMeta of window.Utils.FIELDS) {
      const fieldKey = fieldMeta.key;
      if (fieldKey === 'segmentName' || fieldKey === 'segments') continue;
      const rawValue = plain[fieldKey];
      const hasValue = rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
      const conflictInfo = conflicts[fieldKey];
      merged[fieldKey] = {
        value: hasValue ? rawValue : null,
        source: null,
        conflict: !!(conflictInfo && (conflictInfo.conflict || conflictInfo === true)),
        sources: (conflictInfo && conflictInfo.sources) || []
      };
    }

    const segmentData = {};
    const savedSegments = Array.isArray(stored?.segmentFormData) ? stored.segmentFormData : [];
    savedSegments.forEach((item, idx) => {
      const fd = (item && (item.formData || item)) || null;
      if (fd && typeof fd === 'object' && Object.keys(fd).length > 0) {
        segmentData[idx + 1] = fd;
      }
    });

    return { formData: merged, fieldMeta: {}, segmentData };
  },

  /**
   * 合并项目所有已提取的文档数据，检测冲突并保存
   * 支持多文件（同docType多个文件）和标段识别
   * 已归档项目改为只读加载 GET merged-data，避免触发写接口
   * @param {string} projectId - 项目ID
   * @param {{ preferExtracted?: boolean }} [options] - preferExtracted=true 时以新提取结果覆盖草稿值
   * @returns {Promise<Object>} 合并后的完整字段数据（含冲突标记）
   *   返回格式：{ formData: {...}, fieldMeta: {...}, segmentData: { 1: {...}, 2: {...} } }
   *   向后兼容：旧调用方仍可使用原逻辑
   */
  async mergeExtractedData(projectId, options = {}) {
    const preferExtracted = options.preferExtracted === true;
    let projectInfo = null;
    // 已归档：优先读库中已落库的合并结果，不写回
    try {
      const project = await window.DB.getProject(projectId);
      projectInfo = project || null;
      if (project && ['archived', 'pending_review', 'pending_paper'].includes(project.status)) {
        return this.loadArchivedMergedData(projectId);
      }
    } catch (e) {
      // 项目查询失败时继续走常规合并，由上层统一处理错误
    }

    // 1. 从 DB 获取项目所有已成功提取的文件
    const allFiles = await window.DB.getProjectFiles(projectId);
    const extractedFiles = allFiles.filter(f => f.status === 'success' && f.extracted);

    if (extractedFiles.length === 0) {
      // 没有可提取文件时，回显已保存的草稿/归档数据（自动保存后刷新依赖此逻辑）
      return this.loadArchivedMergedData(projectId);
    }

    // 2. 按优先级排序：tender_doc > win_notice > contract > tender_notice > win_public > evaluation
    extractedFiles.sort((a, b) => {
      const pa = this.SOURCE_PRIORITY[a.docType] || 99;
      const pb = this.SOURCE_PRIORITY[b.docType] || 99;
      return pa - pb;
    });

    // 3. 项目标段配置（同时用于多标段判断与分标段限价回填）
    let projectSegments = [];
    try {
      const segRes = await Http.get(`/projects/${projectId}/segments`);
      projectSegments = segRes.segments || [];
    } catch {
      projectSegments = [];
    }

    const winNoticeFiles = extractedFiles.filter(f => f.docType === 'win_notice');
    const winPublicFiles = extractedFiles.filter(f => f.docType === 'win_public');
    const segmentFiles = [...winNoticeFiles, ...winPublicFiles];
    const isCostProject = !!(projectInfo && (projectInfo.categoryCode || projectInfo.category_code) === 'cost');
    const hasMultipleSegments = !isCostProject && (
      projectSegments.length > 1
      || segmentFiles.some(f => f.segmentNo && f.segmentNo > 0)
    );

    // 4. 收集各标段字段：所有带标段号的文件都参与（中标通知书/公示/履约评价等）
    const segmentData = {};
    if (hasMultipleSegments) {
      const fieldPriorityMap = {};

      for (const file of extractedFiles) {
        const segNo = file.segmentNo || 0;
        if (segNo <= 0) continue;
        const extracted = file.extracted || {};
        const allowedFields = this.DOC_TYPE_FIELDS[file.docType] || [];

        for (const field of this.SEGMENT_FIELDS) {
          if (!allowedFields.includes(field)) continue;
          const val = extracted[field];
          if (val === null || val === undefined || String(val).trim() === '') continue;

          if (!segmentData[segNo]) segmentData[segNo] = {};
          const priority = this._getSourcePriority(field, file.docType);
          const priorityKey = `${segNo}:${field}`;
          const prevPriority = fieldPriorityMap[priorityKey];
          if (prevPriority === undefined || priority < prevPriority) {
            segmentData[segNo][field] = val;
            fieldPriorityMap[priorityKey] = priority;
          }
        }

        if (!segmentData[segNo]) segmentData[segNo] = {};
        segmentData[segNo]._segmentNo = segNo;
      }

      // 用 tender_doc 的通用值回填标段中缺失的 projectName
      const tenderDocFiles = extractedFiles.filter(f => f.docType === 'tender_doc');
      for (const tdFile of tenderDocFiles) {
        const tdExtracted = tdFile.extracted;
        if (!tdExtracted) continue;
        for (const segNo of Object.keys(segmentData)) {
          const tdName = tdExtracted.projectName;
          if (!segmentData[segNo].projectName &&
              tdName !== null &&
              tdName !== undefined &&
              String(tdName).trim() !== '') {
            segmentData[segNo].projectName = tdName;
          }
        }
      }
    }

    // 4b. 从招标文件提取各标段最高限价 → segmentData[segNo].entrustAmount
    const tenderDocFiles = extractedFiles.filter(f => f.docType === 'tender_doc');
    for (const tdFile of tenderDocFiles) {
      if (!tdFile.extracted) continue;
      this._applySegmentEntrustAmounts(tdFile.extracted, segmentData, projectSegments);
    }

    // 5. 遍历所有字段，收集各来源中的值（支持同docType多文件合并）
    const merged = {};
    const plainValues = {}; // 纯值版本，用于保存到 DB

    for (const fieldMeta of window.Utils.FIELDS) {
      const fieldKey = fieldMeta.key;
      if (fieldKey === 'segmentName') continue; // 标段名称不合并到表单
      if (fieldKey === 'segments') continue; // segments数组字段不合并到表单
      if (fieldKey === 'segmentEntrustAmounts') continue; // 分标段限价单独写入 segmentData
      // 多标段时，projectName 也是标段特有字段，不进入全局合并
      if (hasMultipleSegments && fieldKey === 'projectName') continue;
      const sources = []; // 收集该字段在各来源中的值

      for (const file of extractedFiles) {
        const docType = file.docType;
        const extracted = file.extracted;
        if (!extracted) continue;

        // 系统项目编号不由文档提取填充；招标文件编号兼容历史提取的 projectNo
        if (fieldKey === 'projectNo') continue;

        let rawValue = extracted[fieldKey];
        if (
          (rawValue === null || rawValue === undefined || String(rawValue).trim() === '')
          && fieldKey === 'tenderDocNo'
          && extracted.projectNo != null
          && String(extracted.projectNo).trim() !== ''
        ) {
          rawValue = extracted.projectNo;
        }

        if (!(fieldKey in extracted) && !(fieldKey === 'tenderDocNo' && rawValue != null)) continue;

        // 仅采纳该文档类型声明可提取的字段
        const allowedFields = this.DOC_TYPE_FIELDS[docType];
        if (allowedFields && !allowedFields.includes(fieldKey)) {
          continue;
        }

        // 排除 null、undefined、空字符串
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
          continue;
        }

        // 多标段时，带标段号的文件不参与全局标段字段合并（已收集到 segmentData）
        const segNo = file.segmentNo || 0;
        if (hasMultipleSegments && segNo > 0 && this.SEGMENT_FIELDS.includes(fieldKey)) {
          continue;
        }

        // 标注来源（含段号信息）与字段级优先级
        const sourceLabel = (hasMultipleSegments && segNo > 0)
          ? `${docType}#${segNo}`
          : docType;

        sources.push({
          docType,
          value: rawValue,
          segmentNo: segNo,
          sourceLabel,
          priority: this._getSourcePriority(fieldKey, docType)
        });
      }

      sources.sort((a, b) => a.priority - b.priority);

      if (sources.length === 0) {
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
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.sourceLabel || src.docType,
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
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.sourceLabel || src.docType,
          conflict: false,
          sources: sources
        };
        plainValues[fieldKey] = src.value;
      } else {
        // 存在冲突，保留所有来源值
        const allValues = sources.map(s => ({
          value: s.value,
          source: s.sourceLabel || s.docType,
          segmentNo: s.segmentNo
        }));
        const src = sources[0];
        merged[fieldKey] = {
          value: src.value,
          source: src.sourceLabel || src.docType,
          conflict: true,
          sources: sources,
          allValues: allValues  // 冲突时保留全部来源值
        };
        plainValues[fieldKey] = src.value;
      }
    }

    // 5b. 合并已保存的草稿值：默认以手工修改优先；重新提取时有新值的字段以提取结果优先
    {
      const saved = await window.DB.getMergedData(projectId);
      const savedForm = (saved && (saved.formData || saved.form_data)) || {};
      const isEmpty = (v) => v === null || v === undefined || String(v).trim() === '';

      for (const fieldMeta of window.Utils.FIELDS) {
        const fieldKey = fieldMeta.key;
        if (fieldKey === 'segmentName' || fieldKey === 'segments' || fieldKey === 'segmentEntrustAmounts') continue;
        if (hasMultipleSegments && fieldKey === 'projectName') continue;
        const savedVal = savedForm[fieldKey];
        if (isEmpty(savedVal)) continue;
        const currentVal = merged[fieldKey] ? merged[fieldKey].value : null;
        // 新提取结果优先；但提取未产出的字段仍保留手工值
        if (preferExtracted && !isEmpty(currentVal)) continue;
        if (!preferExtracted
          && !isEmpty(currentVal)
          && this._valuesEqual(this._normalizeValue(currentVal), this._normalizeValue(savedVal))) {
          continue;
        }
        merged[fieldKey] = {
          value: savedVal,
          source: null,
          conflict: false,
          sources: []
        };
        plainValues[fieldKey] = savedVal;
      }

      const savedSegments = Array.isArray(saved?.segmentFormData) ? saved.segmentFormData : [];
      savedSegments.forEach((item, idx) => {
        const fd = (item && (item.formData || item)) || null;
        if (!fd) return;
        const segNo = idx + 1;
        if (!segmentData[segNo]) segmentData[segNo] = {};
        for (const key of this.SEGMENT_FIELDS) {
          const savedVal = fd[key];
          if (isEmpty(savedVal)) continue;
          const currentVal = segmentData[segNo][key];
          if (preferExtracted && !isEmpty(currentVal)) continue;
          if (!preferExtracted
            && !isEmpty(currentVal)
            && this._valuesEqual(this._normalizeValue(currentVal), this._normalizeValue(savedVal))) {
            continue;
          }
          segmentData[segNo][key] = savedVal;
        }
        segmentData[segNo]._segmentNo = segNo;
      });
    }

    // 6. 将纯值版本保存到 DB
    await window.DB.saveMergedData(projectId, plainValues);

    // 7. 构造返回结果
    const result = { formData: merged, fieldMeta: {} };

    if (Object.keys(segmentData).length > 0) {
      result.segmentData = segmentData;
    }

    return result;
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
  },

  /**
   * 将招标文件 segmentEntrustAmounts 写入 segmentData[segNo].entrustAmount
   * @param {Object} tenderExtracted
   * @param {Object} segmentData
   * @param {Array<{name?: string}>} projectSegments
   * @private
   */
  _applySegmentEntrustAmounts(tenderExtracted, segmentData, projectSegments) {
    const list = tenderExtracted?.segmentEntrustAmounts;
    if (!Array.isArray(list) || list.length === 0) return;

    const tenderSegmentNames = Array.isArray(tenderExtracted.segments) ? tenderExtracted.segments : [];
    const tenderSegments = tenderSegmentNames.map((name) => ({ name }));
    const segments = Array.isArray(projectSegments) && projectSegments.length > 0
      ? projectSegments
      : tenderSegments;

    list.forEach((item, index) => {
      if (!item) return;
      const amount = item.entrustAmount;
      if (amount === null || amount === undefined || String(amount).trim() === '') return;

      let segNo = 0;
      const segName = item.segmentName ? String(item.segmentName).trim() : '';

      if (segName && segments.length > 0) {
        segNo = window.Utils.fuzzyMatchSegmentName(segName, segments);
      }
      if (segNo === 0 && segName && tenderSegments.length > 0) {
        segNo = window.Utils.fuzzyMatchSegmentName(segName, tenderSegments);
      }
      if (segNo === 0 && tenderSegmentNames.length > index) {
        segNo = index + 1;
      }
      if (segNo === 0 && list.length === 1) {
        segNo = 1;
      }
      if (segNo === 0) return;

      if (!segmentData[segNo]) segmentData[segNo] = {};
      if (!segmentData[segNo].entrustAmount) {
        segmentData[segNo].entrustAmount = amount;
      }
    });
  }

};
