/**
 * MineRU PDF 转 Markdown 服务封装
 * 对接公司本地部署的 MineRU 服务
 * 接口：POST /api/mineru/upload（multipart: user + file）
 * 返回 md 文件 URL，需二次请求获取内容
 */
const fetch = require('node-fetch');
const FormData = require('form-data');
const config = require('../config');

class MineruService {
  /**
   * 将 PDF 文件转换为 Markdown
   * @param {Buffer} pdfBuffer - PDF 文件内容
   * @param {string} fileName - 原始文件名
   * @returns {Promise<{markdown: string, metadata: object}>}
   */
  async convertToMarkdown(pdfBuffer, fileName) {
    const { apiUrl, uploadPath, user } = config.mineru;
    if (!apiUrl) {
      throw new Error('未配置 MineRU 服务地址（MINERU_API_URL）');
    }

    const uploadUrl = `${apiUrl}${uploadPath}`;
    console.log(`[MineRU] 开始转换: ${fileName} → ${uploadUrl}`);

    // 构造 multipart 表单
    const formData = new FormData();
    formData.append('user', user);
    formData.append('file', pdfBuffer, {
      filename: fileName,
      contentType: 'application/pdf'
    });

    // 步骤1：上传 PDF 到 MineRU
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 120000 // 2分钟超时，PDF转换可能较慢
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MineRU 服务返回 HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    // 检查返回状态
    if (result.code !== 'OK') {
      throw new Error(`MineRU 转换失败: ${result.msg || '未知错误'}`);
    }

    if (!result.data || result.data.length === 0 || !result.data[0].url) {
      throw new Error('MineRU 返回数据为空，未获取到 Markdown URL');
    }

    const mdUrl = result.data[0].url;
    console.log(`[MineRU] 转换完成，获取 Markdown: ${mdUrl}`);

    // 步骤2：GET 请求获取实际 Markdown 内容
    const mdResponse = await fetch(mdUrl, { timeout: 30000 });
    if (!mdResponse.ok) {
      throw new Error(`获取 Markdown 内容失败 (${mdResponse.status}): ${mdUrl}`);
    }

    const markdown = await mdResponse.text();
    if (!markdown || markdown.trim().length === 0) {
      throw new Error('MineRU 返回的 Markdown 内容为空');
    }

    console.log(`[MineRU] 成功获取 Markdown，长度: ${markdown.length} 字符`);

    const metadata = {
      fileName: fileName,
      mdUrl: mdUrl,
      contentLength: markdown.length,
      convertedAt: new Date().toISOString()
    };

    return { markdown, metadata };
  }

  /**
   * 检查 MineRU 服务连通性
   */
  async checkConnection() {
    try {
      const { apiUrl, uploadPath } = config.mineru;
      if (!apiUrl) return { success: false, message: '未配置 MineRU 服务地址' };

      // 用 GET 请求上传接口，期望返回 404（说明服务在线但不支持 GET）
      const response = await fetch(`${apiUrl}${uploadPath}`, {
        method: 'GET',
        timeout: 5000
      });

      // 404 或 405 表示服务在线（不支持 GET 但能响应）
      if (response.status === 404 || response.status === 405 || response.ok) {
        return { success: true, message: 'MineRU 服务连接正常' };
      }
      return { success: false, message: `MineRU 服务返回 ${response.status}` };
    } catch (error) {
      return { success: false, message: 'MineRU 服务连接失败: ' + error.message };
    }
  }
}

module.exports = new MineruService();
