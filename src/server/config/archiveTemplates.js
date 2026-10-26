/**
 * 归档目录模板
 * - 基础目录来自公司《业务档案归档管理办法》
 * - 招标项目叠加发改委《招标人主体责任履行指引》第三十四条、
 *   交通运输部《公路工程建设项目资格预审文件和招标文件公平竞争合规指引》相关目录
 */
const TEMPLATE_VERSION = '2026.10-1';
const EMPTY_FOLDER_SUFFIX = '（空）';

function item(key, name, order, options = {}) {
  return {
    key,
    name,
    order,
    docTypes: options.docTypes || [],
    keywords: options.keywords || [],
    fallback: !!options.fallback,
    createIfFiles: !!options.createIfFiles
  };
}

/** 招标项目通用合规目录（招标代理 + 政府采购） */
const COMMON_TENDER_ITEMS = [
  item('tender_approval', '招标事项核准文件', 10, {
    keywords: ['招标事项核准', '核准文件', '招标核准']
  }),
  item('tender_plan', '招标方案', 20, {
    keywords: ['招标方案', '招标策划', '市场调研', '咨询论证']
  }),
  item('tender_plan_notice', '招标计划公告', 30, {
    keywords: ['招标计划', '招标计划公告', '招标计划发布']
  }),
  item('tender_doc_change', '招标文件变更、澄清内容', 150, {
    keywords: ['招标文件变更', '澄清', '补遗', '修改通知', '答疑']
  }),
  item('fair_review', '公平竞争审查表及审查意见', 160, {
    keywords: ['公平竞争审查', '公平竞争审查表', '审查意见', '公平竞争合规审查']
  }),
  item('fair_special', '公平竞争审查特殊情形说明', 170, {
    keywords: ['特殊情形', '公平竞争特殊情形', '例外情形']
  }),
  item('filing_record', '资格预审文件、招标文件备案及修改记录', 180, {
    keywords: ['备案', '备案回执', '修改备案', '交通运输主管部门备案']
  }),
  item('fair_rectify', '公平竞争审查整改记录', 190, {
    keywords: ['公平竞争整改', '整改记录', '审查整改']
  }),
  item('bid_docs', '投标文件', 210, {
    keywords: ['投标文件', '投标书', '投标响应文件']
  }),
  item('bid_opening_record', '开标过程记录', 220, {
    keywords: ['开标记录', '开标过程', '开标一览表', '签到表']
  }),
  item('bid_opening_photos', '开标时照片', 230, {
    keywords: ['开标照片', '开标时照片', '开标现场']
  }),
  item('bid_eval_record', '评标过程记录', 240, {
    keywords: ['评标记录', '评标过程', '评标记录表']
  }),
  item('bid_eval_review', '评标报告审查材料', 260, {
    keywords: ['评标报告审查', '评标报告复核', '评标报告审查材料']
  }),
  item('award_decision_record', '定标过程记录', 270, {
    keywords: ['定标记录', '定标过程', '定标报告']
  }),
  item('fairness_self_check', '中标结果公平性自查资料', 300, {
    keywords: ['公平性自查', '中标结果公平性', '公平竞争自查']
  }),
  item('tender_report', '招标投标情况书面报告', 320, {
    keywords: ['招标投标情况', '书面报告', '招标情况报告']
  }),
  item('contract_text', '合同文本（中标合同）', 330, {
    keywords: ['中标合同', '合同文本', '施工合同', '采购合同']
  }),
  item('contract_change', '合同变更内容', 340, {
    keywords: ['合同变更', '变更协议', '补充协议']
  }),
  item('objection', '异议处理记录', 350, {
    keywords: ['异议', '异议处理', '异议答复']
  }),
  item('complaint', '投诉处理记录', 360, {
    keywords: ['投诉', '投诉处理', '投诉答复', '投诉决定']
  }),
  item('performance_bond', '履约保证金、保函核验记录', 370, {
    keywords: ['履约保证金', '保函', '保证金核验']
  }),
  item('post_evaluation', '招标后评价报告', 410, {
    keywords: ['后评价', '招标后评价', '项目后评价']
  }),
  item('supplier_evaluation', '供应商考核评价记录', 420, {
    keywords: ['供应商评价', '供应商考核', '履约评价']
  })
];

const TEMPLATE_DEFS = {
  tender_agency: {
    code: 'tender_agency',
    label: '招标代理',
    items: [
      item('contract', '委托代理合同', 40, { docTypes: ['contract'], keywords: ['代理合同', '委托代理合同'] }),
      item('tender_notice', '招标公告或资格预审公告', 50, {
        docTypes: ['tender_notice', 'prequal_notice'],
        keywords: ['招标公告', '资格预审公告', '公告截图']
      }),
      item('prequal_record', '资格预审文件编写纪录表', 60, {
        keywords: ['资格预审文件编写', '资格预审编写记录']
      }),
      item('prequal_purchase', '资格预审文件购买登记表', 70, {
        keywords: ['资格预审文件购买', '购买登记表']
      }),
      item('prequal_doc', '资格预审文件（含补遗书）', 80, {
        docTypes: ['prequal_doc'],
        keywords: ['资格预审文件', '资审文件']
      }),
      item('prequal_approval', '资格预审文件批复函', 90, {
        keywords: ['资格预审批复', '批复函']
      }),
      item('prequal_review', '资格预审评审报告', 100, {
        docTypes: ['prequal_review'],
        keywords: ['资格预审评审', '资审评审报告']
      }),
      item('bid_invitation', '投标邀请书', 110, {
        keywords: ['投标邀请书', '邀请书']
      }),
      item('tender_doc_record', '招标文件编写纪录表', 120, {
        keywords: ['招标文件编写', '招标文件编写记录']
      }),
      item('tender_doc', '招标文件（含补遗书）', 130, {
        docTypes: ['tender_doc'],
        keywords: ['招标文件', '采购文件']
      }),
      item('tender_doc_purchase', '招标文件购买登记表', 140, {
        keywords: ['招标文件购买', '文件购买登记']
      }),
      item('price_limit', '标底、最高限价编制文件', 200, {
        keywords: ['标底', '最高限价', '招标控制价']
      }),
      item('bid_eval_report', '评标报告', 250, {
        docTypes: ['bid_eval_report'],
        keywords: ['评标报告', '评标结果报告']
      }),
      item('win_candidate_public', '中标候选人公示', 280, {
        docTypes: ['win_public'],
        keywords: ['中标候选人公示', '候选人公示', '中标公示']
      }),
      item('win_result_public', '中标结果公告', 290, {
        keywords: ['中标结果公告', '结果公告']
      }),
      item('win_notice', '中标通知书', 310, {
        docTypes: ['win_notice'],
        keywords: ['中标通知书', '成交通知书']
      }),
      item('evaluation', '招标代理履约评价表', 380, {
        docTypes: ['evaluation'],
        keywords: ['履约评价', '评价表', '评价书']
      }),
      item('handover', '与业主交接资料清单', 390, {
        docTypes: ['handover_list'],
        keywords: ['交接清单', '交接资料', '移交清单']
      }),
      item('start_approval', '招标启动条件的批复文件', 400, {
        docTypes: ['approval'],
        keywords: ['批复', '启动条件', '工可批复', '初设批复']
      }),
      item('archive_stats', '公司项目资料归档统计表', 430, {
        keywords: ['归档统计表', '资料归档统计']
      })
    ]
  },

  gov_procurement: {
    code: 'gov_procurement',
    label: '政府采购代理',
    items: [
      item('contract', '委托代理协议', 40, { docTypes: ['contract'], keywords: ['委托代理协议', '代理协议'] }),
      item('budget_approval', '财政部门预算批复文件', 45, {
        keywords: ['预算批复', '财政部门批复']
      }),
      item('tech_requirements', '采购人技术需求资料', 47, {
        keywords: ['技术需求', '采购需求']
      }),
      item('tender_notice', '网页版招标公告', 50, {
        docTypes: ['tender_notice'],
        keywords: ['招标公告', '采购公告', '网页版公告']
      }),
      item('import_approval', '政府采购进口产品核准函及进口论证专家名单', 55, {
        keywords: ['进口产品', '进口论证', '核准函']
      }),
      item('tender_doc_argument', '招标文件论证意见', 65, {
        keywords: ['招标文件论证', '论证意见']
      }),
      item('tender_doc', '招标文件', 130, {
        docTypes: ['tender_doc'],
        keywords: ['招标文件', '采购文件']
      }),
      item('tender_doc_sale_record', '招标文件发售、下载记录', 145, {
        keywords: ['发售记录', '下载记录', '文件发售']
      }),
      item('tender_doc_change', '招标文件补充文件或澄清文件', 150, {
        keywords: ['补充文件', '澄清文件', '变更公告']
      }),
      item('procurement_method_change', '变更采购方式申请及相关附件', 155, {
        keywords: ['变更采购方式', '采购方式申请']
      }),
      item('procurement_method_approval', '变更采购方式审批函', 156, {
        keywords: ['变更采购方式审批', '审批函']
      }),
      item('bid_docs', '投标文件', 210, {
        keywords: ['投标文件', '投标书']
      }),
      item('bid_eval_report', '评标报告', 250, {
        docTypes: ['bid_eval_report'],
        keywords: ['评标报告']
      }),
      item('eval_result_confirmation', '采购人对评标结果的确认文件', 275, {
        keywords: ['评标结果确认', '结果确认']
      }),
      item('win_result_public', '网页版中标结果公告', 290, {
        docTypes: ['win_public'],
        keywords: ['中标结果公告', '结果公告', '中标公告']
      }),
      item('win_notice', '中标通知书', 310, {
        docTypes: ['win_notice'],
        keywords: ['中标通知书', '成交通知书']
      }),
      item('contract_text', '政府采购合同', 330, {
        keywords: ['政府采购合同', '中标合同', '合同文本']
      }),
      item('acceptance', '验收证明文件', 345, {
        keywords: ['验收证明', '验收报告']
      }),
      item('objection', '供应商质疑材料、处理过程记录及答复', 350, {
        keywords: ['质疑', '质疑答复', '质疑处理']
      }),
      item('complaint', '供应商投诉书、投诉处理有关文书、投诉处理决定书', 360, {
        keywords: ['投诉书', '投诉处理', '投诉决定']
      }),
      item('evaluation', '采购代理履约评价表', 380, {
        docTypes: ['evaluation'],
        keywords: ['履约评价', '评价表']
      }),
      item('handover', '与采购人的资料交接表', 390, {
        docTypes: ['handover_list'],
        keywords: ['交接表', '交接清单', '移交清单']
      }),
      item('other', '其他有关重要文件', 440, {
        docTypes: ['other_attach'],
        keywords: ['其他', '其它']
      })
    ]
  },

  ppp_consult: {
    code: 'ppp_consult',
    label: 'PPP 咨询',
    items: [
      item('comparison_doc', '咨询比选文件', 50, { keywords: ['比选文件', '咨询比选'] }),
      item('comparison_application', '比选申请文件', 60, { keywords: ['比选申请'] }),
      item('comparison_notice', '比选公告', 55, { keywords: ['比选公告'] }),
      item('win_public', '中标公示', 280, { docTypes: ['win_public'], keywords: ['中标公示', '中标结果'] }),
      item('win_notice', '中标通知书', 310, { docTypes: ['win_notice'], keywords: ['中标通知书'] }),
      item('contract', '委托咨询合同', 40, { docTypes: ['contract'], keywords: ['咨询合同', '委托合同'] }),
      item('early_work', '前期工作及批复', 110, { docTypes: ['approval'], keywords: ['前期工作', '工可', '批复'] }),
      item('process_docs', '过程文件', 200, { keywords: ['过程文件', '咨询报告', '汇报文件'] }),
      item('report_record', '咨询报告编写记录表', 120, { keywords: ['咨询报告编写', '编写记录'] }),
      item('report', '咨询报告', 130, { keywords: ['咨询报告', '特许经营方案', '绩效评价'] }),
      item('financial_model', '财务测算模型', 210, { keywords: ['财务测算', '测算模型'] }),
      item('evaluation', '咨询服务履约评价表', 380, { docTypes: ['evaluation'], keywords: ['履约评价', '评价表'] }),
      item('report_approval', '咨询成果批复', 300, { keywords: ['咨询成果批复', '成果批复'] }),
      item('ndrc_registration', '发改委入库信息', 320, { keywords: ['发改委入库', '入库信息', '在线审批监管平台'] }),
      item('handover', '与业主交接资料清单', 390, { docTypes: ['handover_list'], keywords: ['交接清单', '移交清单'] }),
      item('authorization', '实施机构、政府出资人代表授权文件', 400, { keywords: ['授权文件', '实施机构', '出资人代表'] }),
      item('archive_stats', '公司项目资料归档统计表', 430, { keywords: ['归档统计表'] })
    ]
  },

  cost_consult: {
    code: 'cost_consult',
    label: '造价咨询',
    items: [
      item('project_intake', '拟承接项目情况表', 20, { keywords: ['拟承接', '项目情况表'] }),
      item('application', '委托咨询申请书', 30, { keywords: ['委托咨询申请', '申请书'] }),
      item('contract', '造价咨询合同', 40, { docTypes: ['contract'], keywords: ['造价咨询合同', '咨询合同'] }),
      item('implementation', '实施项目情况表', 50, { keywords: ['实施项目', '项目情况表'] }),
      item('task_book', '造价咨询项目任务书', 60, { keywords: ['任务书', '项目任务书'] }),
      item('raw_material', '造价咨询业务原始资料', 200, { keywords: ['原始资料', '工程量清单', '材料价格'] }),
      item('result', '造价咨询成果文件', 210, { keywords: ['成果文件', '造价成果'] }),
      item('process_docs', '造价咨询过程文件', 220, { docTypes: ['other_attach'], keywords: ['过程文件', '编制记录', '校审记录'] }),
      item('evaluation', '造价咨询工作履约评价表', 380, { docTypes: ['evaluation'], keywords: ['履约评价', '评价表'] }),
      item('return_visit', '咨询工作回访记录', 390, { keywords: ['回访记录', '回访'] })
    ]
  }
};

const OTHER_ITEM = item('other', '其他有关重要文件', 9999, {
  docTypes: ['other_attach'],
  keywords: ['其他', '其它'],
  fallback: true,
  createIfFiles: true
});

function normalizeFolderName(name) {
  return String(name || '')
    .replace(/[\/\\]/g, '、')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '') || '未命名目录';
}

function buildTemplate(def) {
  const merged = def.items.map((it) => ({ ...it }));
  const byKey = new Set(merged.map((it) => it.key));

  if (def.code === 'tender_agency' || def.code === 'gov_procurement') {
    for (const common of COMMON_TENDER_ITEMS) {
      if (byKey.has(common.key)) continue;
      merged.push({ ...common });
      byKey.add(common.key);
    }
  }

  if (!byKey.has('other')) {
    merged.push({ ...OTHER_ITEM });
  }

  merged.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : 9999;
    const orderB = Number.isFinite(b.order) ? b.order : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, 'zh');
  });

  return {
    code: def.code,
    label: def.label,
    version: TEMPLATE_VERSION,
    items: merged.map((it, index) => ({
      ...it,
      number: index + 1,
      folderName: normalizeFolderName(it.name),
      keywords: [...new Set([it.name, ...(it.keywords || [])].map((k) => String(k).trim()).filter(Boolean))]
    }))
  };
}

const TEMPLATES = Object.fromEntries(
  Object.entries(TEMPLATE_DEFS).map(([code, def]) => [code, buildTemplate(def)])
);

function getTemplateList() {
  return Object.values(TEMPLATES).map((t) => ({
    code: t.code,
    label: t.label,
    version: t.version,
    itemCount: t.items.length
  }));
}

function getTemplate(code) {
  return TEMPLATES[code] || null;
}

function isValidTemplateCode(code) {
  return !!TEMPLATES[code];
}

function isValidFolderKey(folderKey) {
  if (!folderKey) return false;
  const [templateCode, itemKey] = String(folderKey).split(':');
  const template = TEMPLATES[templateCode];
  if (!template || !itemKey) return false;
  return template.items.some((it) => it.key === itemKey);
}

function getItemByFolderKey(templateCode, folderKey) {
  const template = TEMPLATES[templateCode];
  if (!template || !folderKey) return null;
  const [code, itemKey] = String(folderKey).split(':');
  if (code && code !== templateCode) return null;
  return template.items.find((it) => it.key === (itemKey || code)) || null;
}

function findItemByDocType(template, docType) {
  if (!template || !docType) return null;
  return template.items.find((it) => Array.isArray(it.docTypes) && it.docTypes.includes(docType)) || null;
}

function resolveFolderItem(template, file) {
  const byKey = getItemByFolderKey(template.code, file && (file.folder_key || file.folderKey));
  if (byKey) return byKey;
  const byDocType = findItemByDocType(template, file && (file.doc_type || file.docType));
  if (byDocType) return byDocType;
  return template.items.find((it) => it.key === 'other') || template.items[template.items.length - 1];
}

function resolveTemplateCode(project, formData) {
  const explicit = project && (project.archive_template || project.archiveTemplate);
  if (explicit && isValidTemplateCode(explicit)) return explicit;

  const categoryCode = String(
    (project && (project.category_code || project.categoryCode)) || ''
  ).toLowerCase();
  const categoryId = String(project && (project.category_id || project.categoryId) || '');

  if (categoryCode === 'consult' || categoryId === 'cat_consult') return 'ppp_consult';
  if (categoryCode === 'cost' || categoryId === 'cat_cost') return 'cost_consult';

  const projectTypeRaw = formData && (formData.projectType && formData.projectType.value !== undefined
    ? formData.projectType.value
    : formData.projectType);
  const projectType = String(projectTypeRaw || '').trim();
  if (projectType === '政府采购') return 'gov_procurement';

  return 'tender_agency';
}

function getFolderDisplayName(item, hasFiles) {
  if (!item) return '';
  return hasFiles ? item.folderName : `${item.folderName}${EMPTY_FOLDER_SUFFIX}`;
}

module.exports = {
  TEMPLATE_VERSION,
  EMPTY_FOLDER_SUFFIX,
  COMMON_TENDER_ITEMS,
  TEMPLATES,
  getTemplateList,
  getTemplate,
  isValidTemplateCode,
  isValidFolderKey,
  getItemByFolderKey,
  findItemByDocType,
  resolveFolderItem,
  resolveTemplateCode,
  normalizeFolderName,
  getFolderDisplayName
};