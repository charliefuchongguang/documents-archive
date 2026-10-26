/**
 * 信息提取控制器 - 处理 AI 信息提取相关逻辑
 * - 代理 DeepSeek 提取
 * - 自动保存提取结果到 files 表的 extracted_data 字段（累加合并）
 */
const deepseekService = require('../services/deepseek');
const dao = require('../database/dao');
const projectExtractLog = require('../utils/projectExtractLog');
const {
  checkProjectAccess,
  respondProjectAccessCheck,
  touchUpdaterFromReq
} = require('../utils/projectAuth');

module.exports = {
  /**
   * POST /api/extract
   * 代理 DeepSeek 信息提取，可选自动保存到文件记录
   * Body: {
   *   prompt: string,
   *   options?: { model?: string, jsonMode?: boolean },
   *   fileId?: string   // 提供时自动保存提取结果到 extracted_data
   * }
   */
  async extract(req, res) {
    try {
      const { prompt, options = {}, fileId } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: '缺少 prompt 参数' });
      }

      // 调用 DeepSeek 获取提取结果
      const result = await deepseekService.callDeepSeek(prompt, options);

      // 如果提供了 fileId，自动保存/累加提取结果到 extracted_data
      if (fileId && result && typeof result === 'object') {
        const file = dao.getFile(fileId);
        if (file) {
          const project = dao.getProject(file.project_id);
          const accessCheck = checkProjectAccess(project, req.user?.userid);
          if (!respondProjectAccessCheck(res, accessCheck)) return;

          // 读取已有的 extracted_data
          let existingData = {};
          if (file.extracted_data) {
            try {
              existingData = typeof file.extracted_data === 'string'
                ? JSON.parse(file.extracted_data)
                : file.extracted_data;
            } catch {
              existingData = {};
            }
          }

          // 累加合并：新字段覆盖旧字段（同 key 时以新提取为准）
          const mergedData = { ...existingData, ...result };

          // 保存回 files 表
          dao.updateFile(fileId, { extracted_data: mergedData });
          touchUpdaterFromReq(file.project_id, req.user);

          const hadPrevious = projectExtractLog.hasExtractedData(file.extracted_data);
          projectExtractLog.append(file.project_id, {
            action: hadPrevious ? 're-extract' : 'extract',
            fileId: file.id,
            fileName: file.file_name,
            docType: file.doc_type,
            segmentNo: file.segment_no,
            result: mergedData,
          });

          console.log(`[Extract] 文件 ${fileId} 提取结果已累加保存，新增/更新 ${Object.keys(result).length} 个字段，总计 ${Object.keys(mergedData).length} 个字段`);

          return res.json({
            success: true,
            data: mergedData,
            saved: true,
            segmentNo: file.segment_no || 0
          });
        } else {
          console.warn(`[Extract] fileId=${fileId} 对应的文件不存在，跳过自动保存`);
        }
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[Extract] 提取失败:', error.message);

      const { fileId } = req.body || {};
      if (fileId) {
        const file = dao.getFile(fileId);
        if (file) {
          projectExtractLog.append(file.project_id, {
            action: 'extract_failed',
            fileId: file.id,
            fileName: file.file_name,
            docType: file.doc_type,
            segmentNo: file.segment_no,
            error: error.message,
          });
        }
      }

      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/extract/data/:fileId
   * 获取文件已累积的提取字段（extracted_data）
   */
  async getExtractedData(req, res) {
    try {
      const { fileId } = req.params;
      const file = dao.getFile(fileId);
      if (!file) {
        return res.status(404).json({ error: '文件不存在' });
      }

      const project = dao.getProject(file.project_id);
      const accessCheck = checkProjectAccess(project, req.user?.userid);
      if (!respondProjectAccessCheck(res, accessCheck)) return;

      let extractedData = {};
      if (file.extracted_data) {
        try {
          extractedData = typeof file.extracted_data === 'string'
            ? JSON.parse(file.extracted_data)
            : file.extracted_data;
        } catch {
          extractedData = {};
        }
      }

      res.json({ success: true, fileId, data: extractedData, segmentNo: file.segment_no || 0 });
    } catch (error) {
      console.error('[获取提取数据] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};
