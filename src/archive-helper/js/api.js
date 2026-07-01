/**
 * api.js - 后端 API 代理封装
 * 所有 API 调用通过后端代理，不再直接访问外部服务
 */
window.API = {

  /**
   * 账号密码登录
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object>} 用户信息 { id, username, name, role }
   */
  async login(username, password) {
    const result = await Http.post('/auth/login', { username, password });
    Http.saveToken(result.token);
    return result.user;
  },

  /**
   * 调用 DeepSeek API（通过后端代理）
   * @param {string} prompt - 用户提示词
   * @param {Object} [options] - 可选参数 { model, jsonMode }
   * @returns {Promise<Object|string>} 解析后的 JSON 对象或文本
   */
  async callDeepSeek(prompt, options = {}) {
    const result = await Http.post('/extract', { prompt, options });
    return result.data;
  },

  /**
   * 测试 DeepSeek 连接（通过后端代理）
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    try {
      await this.callDeepSeek('请回复"连接成功"', { jsonMode: false });
      return { success: true, message: '连接成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 获取当前用户信息
   * @returns {Promise<Object>} { id, username, name, role }
   */
  async getUserInfo() {
    return Http.get('/auth/userinfo');
  },

  /**
   * 修改密码
   * @param {string} oldPassword
   * @param {string} newPassword
   * @returns {Promise<Object>}
   */
  async changePassword(oldPassword, newPassword) {
    return Http.put('/auth/change-password', { oldPassword, newPassword });
  },

  // ==========================================
  // 归档提交相关 API
  // ==========================================

  /**
   * 提交项目归档
   * @param {string} projectId - 项目 ID
   * @returns {Promise<Object>}
   */
  async submitProject(projectId, body = {}) {
    return Http.post('/submit/project/' + projectId, body);
  },

  /**
   * 获取归档列表（管理员）
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=20] - 每页条数
   * @returns {Promise<Object>} { list, total, page, pageSize }
   */
  async getArchives(page = 1, pageSize = 20) {
    return Http.get('/submit/archives?page=' + page + '&pageSize=' + pageSize);
  },

  /**
   * 获取全部归档数据用于导出（管理员）
   * @returns {Promise<Array>}
   */
  async exportArchivesData() {
    return Http.get('/submit/export-excel');
  }
};
