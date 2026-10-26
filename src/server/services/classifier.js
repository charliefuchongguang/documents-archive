/**
 * 文档类型内容识别服务（AI 兜底）
 * 用于「从文件夹导入」时，对文件名/文件夹无法命中的文件，按内容判断所属文档类型。
 * 流程：读取文本 / MineRU 转 Markdown → 截断 → DeepSeek 分类 → 校验白名单
 */
const crypto = require('crypto');
const fileTypes = require('../utils/fileTypes');
const deepseekService = require('./deepseek');
const mineruService = require('./mineru');

/**
 * 可识别的文档类型（key 与前端 Utils.DOC_TYPES 一致）
 * hint 用于辅助模型区分，特别是公示类与新类型
 */
const CLASSIFIABLE_TYPES = [
  { key: 'tender_notice', label: '招标公告截图', hint: '招标公告、采购公告、招标公告截图' },
  { key: 'tender_doc', label: '招标文件', hint: '招标文件、招标正文、采购文件、询比/谈判文件' },
  { key: 'win_notice', label: '中标通知书', hint: '中标通知书、成交通知书' },
  { key: 'win_public', label: '中标公示', hint: '中标候选人公示、评标结果公示、中标结果公告' },
  { key: 'evaluation', label: '履约评价', hint: '履约评价书、履约情况评价' },
  { key: 'contract', label: '代理服务合同', hint: '招标代理合同、委托代理合同、服务合同' },
  { key: 'bid_eval_report', label: '评标报告', hint: '评标报告、评标记录、评审报告' },
  { key: 'handover_list', label: '交接清单', hint: '资料交接单、档案移交清单' },
  { key: 'approval', label: '批复', hint: '立项批复、可行性研究批复等政府批复文件' },
  { key: 'prequal_notice', label: '资格预审公告', hint: '资格预审公告' },
  { key: 'prequal_doc', label: '资格预审文件', hint: '资格预审文件、资格预审申请文件' },
  { key: 'prequal_review', label: '评审报告（资格预审）', hint: '资格预审评审报告' },
  { key: 'other_attach', label: '其它附件', hint: '无法归入以上任何类型的其它材料' }
];

const ALLOWED_KEYS = new Set(CLASSIFIABLE_TYPES.map((t) => t.key));

/** 送入模型的正文截断长度 */
const MAX_CONTENT_CHARS = 8000;

/**
 * 构造分类 Prompt
 * @param {string} content
 * @returns {string}
 */
function buildPrompt(content) {
  const options = CLASSIFIABLE_TYPES
    .map((t, i) => `${i + 1}. ${t.key}（${t.label}；${t.hint}）`)
    .join('\n');

  return `你是招标代理行业档案归类助手。请根据下面的文档内容，判断它属于哪一类归档文档。

可选类型（只能从以下 key 中选择一个）：
${options}

规则：
1. docType 必须是上面给出的某个 key，不要自创
2. confidence 为 high / medium / low 三选一
3. reason 用一句中文简要说明判断依据
4. 无法确定时选择 other_attach 并给出 confidence=low
5. 只返回 JSON，不要任何解释文字

请只返回 JSON，格式如下：
{"docType":"tender_doc","confidence":"high","reason":"文档抬头为招标文件"}

文档内容：
${content}`;
}

/**
 * 归一化模型返回，确保 docType 落在白名单内
 * @param {object} raw
 * @returns {{docType: string, confidence: string, reason: string}}
 */
function normalizeResult(raw) {
  const docType = raw && typeof raw.docType === 'string' ? raw.docType.trim() : '';
  const confidence = raw && typeof raw.confidence === 'string' ? raw.confidence.trim() : '';
  const reason = raw && typeof raw.reason === 'string' ? raw.reason.trim() : '';

  if (!ALLOWED_KEYS.has(docType)) {
    return {
      docType: 'other_attach',
      confidence: 'low',
      reason: reason || '未能确定文档类型'
    };
  }
  return {
    docType,
    confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium',
    reason: reason || '按内容归类'
  };
}

class ClassifierService {
  /**
   * 按文件内容识别文档类型
   * @param {Buffer} fileBuffer
   * @param {string} fileName
   * @returns {Promise<{docType: string, confidence: string, reason: string}>}
   */
  async classify(fileBuffer, fileName) {
    const ext = fileTypes.getExt(fileName);

    // 仅存扩展名（zip/rar/legacy office 等）：无法解析内容，直接归入其它附件
    if (fileTypes.isStoreOnly(fileName)) {
      return {
        docType: 'other_attach',
        confidence: 'low',
        reason: `不支持的解析格式（${ext || '未知'}），已归入其它附件`
      };
    }

    let content = '';
    try {
      if (fileTypes.isTextReadable(fileName)) {
        content = fileBuffer.toString('utf-8');
      } else if (fileTypes.needsMineru(fileName, null)) {
        const fileId = 'classify-' + crypto.randomUUID();
        const result = await mineruService.convertToMarkdown(fileBuffer, fileName, fileId);
        content = result.markdown || '';
      } else {
        return {
          docType: 'other_attach',
          confidence: 'low',
          reason: '该格式无法解析内容，已归入其它附件'
        };
      }
    } catch (error) {
      return {
        docType: 'other_attach',
        confidence: 'low',
        reason: '内容解析失败：' + error.message
      };
    }

    if (!content || !content.trim()) {
      return {
        docType: 'other_attach',
        confidence: 'low',
        reason: '解析后内容为空，已归入其它附件'
      };
    }

    const snippet = content.slice(0, MAX_CONTENT_CHARS);
    const raw = await deepseekService.callDeepSeek(buildPrompt(snippet), { jsonMode: true });
    return normalizeResult(raw);
  }
}

module.exports = new ClassifierService();
module.exports.CLASSIFIABLE_TYPES = CLASSIFIABLE_TYPES;