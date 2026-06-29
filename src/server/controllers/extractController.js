/**
 * 信息提取控制器 - 处理 AI 信息提取相关逻辑
 */
const deepseekService = require('../services/deepseek');

module.exports = {
  /**
   * POST /api/extract
   * 代理 DeepSeek 信息提取
   * Body: { prompt: string, options?: { model?: string, jsonMode?: boolean } }
   */
  async extract(req, res) {
    try {
      const { prompt, options = {} } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: '缺少 prompt 参数' });
      }
      const result = await deepseekService.callDeepSeek(prompt, options);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[Extract] 提取失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};
