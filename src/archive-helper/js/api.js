/**
 * api.js - 后端 API 代理封装
 * 所有 API 调用通过后端代理，不再直接访问外部服务
 */
window.API = {

  /**
   * 账号密码登录（用户名或手机号）
   * @param {string} username - 用户名或手机号
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

  /**
   * 获取归档目录模板
   * @returns {Promise<{ version: string, templates: Array }>}
   */
  async getArchiveTemplates() {
    return Http.get('/archive-templates');
  },

  /**
   * 管理员：清空并全量重建查询辅助表
   * @returns {Promise<{ success: boolean, projectCount: number, segmentCount: number, message: string }>}
   */
  async rebuildSearchIndex() {
    return Http.post('/projects/search-index/rebuild', {});
  },

  // ==========================================
  // 用户管理 API（管理员）
  // ==========================================

  async listDepartments() {
    return Http.get('/departments');
  },

  async createDepartment(data) {
    return Http.post('/departments', data);
  },

  async updateDepartment(id, data) {
    return Http.put('/departments/' + id, data);
  },

  async deleteDepartment(id) {
    return Http.del('/departments/' + id);
  },

  async listRoles() {
    return Http.get('/roles');
  },

  async createRole(data) {
    return Http.post('/roles', data);
  },

  async updateRole(id, data) {
    return Http.put('/roles/' + id, data);
  },

  async deleteRole(id) {
    return Http.del('/roles/' + id);
  },

  async listUsers(page = 1, pageSize = 20, keyword = '', departmentId = '') {
    let url = '/users?page=' + page + '&pageSize=' + pageSize;
    if (keyword) url += '&keyword=' + encodeURIComponent(keyword);
    if (departmentId) url += '&departmentId=' + encodeURIComponent(departmentId);
    return Http.get(url);
  },

  async createUser(data) {
    return Http.post('/users', data);
  },

  async updateUser(id, data) {
    return Http.put('/users/' + id, data);
  },

  async deleteUser(id) {
    return Http.del('/users/' + id);
  },

  async resetUserPassword(id, password) {
    return Http.put('/users/' + id + '/reset-password', { password });
  },

  // ==========================================
  // 归档提交相关 API
  // ==========================================

  /**
   * 提交项目审核
   * @param {string} projectId - 项目 ID
   * @param {Object} [body] - 可选请求体（多标段 segmentFormData 等）
   * @returns {Promise<Object>}
   */
  async requestReview(projectId, body = {}) {
    return Http.post('/submit/project/' + projectId + '/request-review', body);
  },

  /**
   * 审核不通过（管理员）
   * @param {string} projectId
   * @param {string} comment
   * @returns {Promise<Object>}
   */
  async rejectReview(projectId, comment) {
    return Http.post('/submit/project/' + projectId + '/reject', { comment });
  },

  /**
   * 审核通过并归档（管理员）
   * @param {string} projectId
   * @param {Object} [body]
   * @returns {Promise<Object>}
   */
  async approveElectronic(projectId, body = {}) {
    return Http.post('/submit/project/' + projectId + '/approve', body);
  },

  /**
   * 兼容旧调用名
   */
  async approveAndArchive(projectId, body = {}) {
    return this.approveElectronic(projectId, body);
  },

  /**
   * 完成纸质档核对（仅管理员）
   * @param {string} projectId
   * @param {{ comment?: string }} [body]
   * @returns {Promise<Object>}
   */
  async completePaperReview(projectId, body = {}) {
    return Http.post('/submit/project/' + projectId + '/paper-complete', body);
  },

  /**
   * 提交项目归档（兼容旧接口，管理员待审核归档）
   * @param {string} projectId - 项目 ID
   * @returns {Promise<Object>}
   */
  async submitProject(projectId, body = {}) {
    return Http.post('/submit/project/' + projectId, body);
  },

  /**
   * 获取归档列表（管理员）
   * @param {Object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.pageSize=50]
   * @param {string} [options.search='']
   * @param {string[]} [options.regions=[]]
   * @returns {Promise<Object>} { items, total, page, pageSize }
   */
  async getArchives({ page = 1, pageSize = 50, search = '', regions = [] } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    for (const region of regions) {
      if (region) params.append('region', region);
    }
    const query = params.toString();
    return Http.get('/submit/archives' + (query ? '?' + query : ''));
  },

  /**
   * 懒加载归档项目附件（管理员）
   * @param {string} projectId
   * @param {number} segmentNo
   * @returns {Promise<Object>} { files }
   */
  async getArchiveProjectFiles(projectId, segmentNo) {
    return Http.get(
      '/submit/archives/' + encodeURIComponent(projectId)
      + '/files?segmentNo=' + encodeURIComponent(String(segmentNo))
    );
  },

  /**
   * 下载所选附件 ZIP（支持自动分包）
   * @param {string[]} fileIds
   * @returns {Promise<void>}
   */
  async downloadArchiveFilesZip(fileIds) {
    const result = await Http.postBlob('/submit/archives/download-zip', { fileIds });

    if (result.json && result.json.multiple) {
      const { totalPackages, packages } = result.json;
      for (let i = 0; i < packages.length; i++) {
        const pkg = await Http.postBlob('/submit/archives/download-zip-package', {
          fileIds: packages[i],
          packageIndex: i + 1,
          totalPackages
        });
        if (pkg.blob) {
          Http.downloadBlob(pkg.blob, pkg.filename);
        }
      }
      return { multiple: true, totalPackages };
    }

    if (result.blob) {
      Http.downloadBlob(result.blob, result.filename);
      return { multiple: false, totalPackages: 1 };
    }

    throw new Error('下载失败：未收到有效文件');
  },

  /**
   * 获取全部归档数据用于导出（管理员）
   * @returns {Promise<Array>}
   */
  async exportArchivesData() {
    return Http.get('/submit/export-excel');
  },

  // ==========================================
  // 合同管理 API
  // ==========================================

  async listContracts({
    page = 1,
    pageSize = 50,
    search = '',
    searchType = 'contract',
    anchorOnly = false,
    paymentOnly = false,
    childOnly = false,
    linkStatus = '',
    missingCredit = false
  } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (searchType) params.set('searchType', searchType);
    if (anchorOnly) params.set('anchorOnly', '1');
    if (paymentOnly) params.set('paymentOnly', '1');
    if (childOnly) params.set('childOnly', '1');
    if (linkStatus) params.set('linkStatus', linkStatus);
    if (missingCredit) params.set('missingCredit', '1');
    return Http.get('/contracts?' + params.toString());
  },

  async createContract(data) {
    const payload = typeof data === 'string' ? { name: data } : (data || {});
    return Http.post('/contracts', payload);
  },

  async getContract(id) {
    return Http.get('/contracts/' + encodeURIComponent(id));
  },

  async updateContract(id, data) {
    const payload = typeof data === 'string' ? { name: data } : (data || {});
    return Http.put('/contracts/' + encodeURIComponent(id), payload);
  },

  async deleteContract(id) {
    return Http.del('/contracts/' + encodeURIComponent(id));
  },

  async saveContractProjects(id, { name, projectIds }) {
    return Http.put('/contracts/' + encodeURIComponent(id) + '/projects', { name, projectIds });
  },

  async searchContractsForAdmin({ q = '', page = 1, pageSize = 20, excludeContractId = '' } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (excludeContractId) params.set('excludeContractId', excludeContractId);
    return Http.get('/contracts/projects/search?' + params.toString());
  },

  async searchContracts(q, limit = 20, anchorOnly = true) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit', String(limit));
    params.set('anchorOnly', anchorOnly ? '1' : '0');
    return Http.get('/contracts/search?' + params.toString());
  },

  async getProjectContracts(projectId) {
    return Http.get('/projects/' + encodeURIComponent(projectId) + '/contracts');
  },

  async addProjectContract(projectId, contractId) {
    return Http.post('/projects/' + encodeURIComponent(projectId) + '/contracts', { contractId });
  },

  async removeProjectContract(projectId, linkId) {
    return Http.del('/projects/' + encodeURIComponent(projectId) + '/contracts/' + encodeURIComponent(linkId));
  }
};
