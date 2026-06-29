/**
 * DeepSeek AI API 封装
 * - 通用 Chat API 调用
 * - 连接测试
 */
const fetch = require('node-fetch');
const config = require('../config');

class DeepSeekService {
  /**
   * 调用 DeepSeek Chat API
   * @param {string} prompt - 提示词
   * @param {object} options - 选项
   * @param {string} options.model - 模型名称，默认 'deepseek-chat'
   * @param {boolean} options.jsonMode - 是否要求JSON格式返回，默认 true
   * @returns {Promise<object|string>} jsonMode=true 返回解析后的对象，否则返回文本
   */
  async callDeepSeek(prompt, options = {}) {
    const { model = 'deepseek-chat', jsonMode = true } = options;
    const apiKey = config.deepseek.apiKey;
    const baseUrl = config.deepseek.baseUrl;

    if (!apiKey) {
      throw new Error('未配置 DeepSeek API Key');
    }

    const requestBody = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    };

    if (jsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('DeepSeek API 返回内容为空');
    }

    if (!jsonMode) {
      return content;
    }

    try {
      return JSON.parse(content);
    } catch {
      throw new Error('DeepSeek 返回的内容不是有效的 JSON');
    }
  }

  /**
   * 测试 API 连接
   */
  async testConnection() {
    try {
      await this.callDeepSeek('请回复"连接成功"', { jsonMode: false });
      return { success: true, message: '连接成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new DeepSeekService();
