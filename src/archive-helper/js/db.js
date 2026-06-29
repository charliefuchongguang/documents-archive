/**
 * db.js - 后端 REST API 数据访问封装
 * 通过 Http 模块调用后端 API，替代原 IndexedDB (Dexie.js)
 * 包含字段映射：后端 snake_case → 前端 camelCase
 */

/**
 * 映射后端项目字段为前端格式
 * 后端: id, name, status, created_by, created_by_name, synced_at, created_at, updated_at
 * 前端: projectId, projectName, status, createdBy, createdByName, syncedAt, createdAt, updatedAt
 */
function _mapProject(p) {
  if (!p) return null;
  return {
    ...p,
    projectId: p.id,
    projectName: p.name,
    createdAt: p.created_at || p.createdAt,
    updatedAt: p.updated_at || p.updatedAt,
    syncedAt: p.synced_at || p.syncedAt,
    createdBy: p.created_by || p.createdBy,
    createdByName: p.created_by_name || p.createdByName,
  };
}

/**
 * 映射后端文件字段为前端格式
 * 后端: id, project_id, doc_type, file_name, md_content, extracted_data, status, nas_path, error_msg
 * 前端: id, projectId, docType, filename, content, extracted, status, nasPath, errorMsg
 */
function _mapFile(f) {
  if (!f) return null;
  return {
    ...f,
    projectId: f.project_id || f.projectId,
    docType: f.doc_type || f.docType,
    filename: f.file_name || f.filename,
    content: f.md_content || f.content,
    extracted: f.extracted_data !== undefined ? f.extracted_data : f.extracted,
    nasPath: f.nas_path || f.nasPath,
    errorMsg: f.error_msg || f.errorMsg,
    createdAt: f.created_at || f.createdAt,
    updatedAt: f.updated_at || f.updatedAt,
  };
}

window.DB = {

  // ==================== 项目相关操作 ====================

  /**
   * 创建新项目
   * @param {string} name - 项目名称
   * @returns {Promise<string>} 创建的项目ID
   */
  async createProject(name) {
    const project = await Http.post('/projects', { name });
    return _mapProject(project).projectId;
  },

  /**
   * 获取所有项目
   * @returns {Promise<Array>} 项目列表（已映射为前端格式）
   */
  async getProjects() {
    const result = await Http.get('/projects?pageSize=100');
    const items = result.items || [];
    return items.map(_mapProject);
  },

  /**
   * 获取所有项目（兼容旧接口名）
   * @returns {Promise<Array>}
   */
  async getAllProjects() {
    return this.getProjects();
  },

  /**
   * 获取项目详情
   * @param {string} projectId - 项目ID
   * @returns {Promise<Object|null>} 项目对象（已映射）
   */
  async getProject(projectId) {
    const project = await Http.get(`/projects/${projectId}`);
    return _mapProject(project);
  },

  /**
   * 更新项目信息
   * @param {string} projectId - 项目ID
   * @param {Object} data - 要更新的数据（前端格式自动转后端格式）
   * @returns {Promise<Object>} 更新后的项目对象
   */
  async updateProject(projectId, data) {
    // 将前端 camelCase 转为后端 snake_case
    const mapped = {};
    if (data.projectName !== undefined) mapped.name = data.projectName;
    if (data.name !== undefined) mapped.name = data.name;
    if (data.status !== undefined) mapped.status = data.status;
    if (data.syncedAt !== undefined) mapped.synced_at = data.syncedAt;
    if (data.synced_at !== undefined) mapped.synced_at = data.synced_at;
    const result = await Http.put(`/projects/${projectId}`, mapped);
    return _mapProject(result);
  },

  /**
   * 删除项目及其关联数据
   * @param {string} projectId - 项目ID
   */
  async deleteProject(projectId) {
    await Http.del(`/projects/${projectId}`);
  },

  // ==================== 文件相关操作 ====================

  /**
   * 获取项目的所有文件
   * @param {string} projectId - 项目ID
   * @returns {Promise<Array>} 文件列表（已映射为前端格式）
   */
  async getFiles(projectId) {
    const files = await Http.get(`/projects/${projectId}/files`);
    return (files || []).map(_mapFile);
  },

  /**
   * 获取项目的所有文件（兼容旧接口名，extract.js 使用）
   * @param {string} projectId - 项目ID
   * @returns {Promise<Array>}
   */
  async getProjectFiles(projectId) {
    return this.getFiles(projectId);
  },

  /**
   * 上传文件（PDF → 后端处理 MineRU 转换和 NAS 存储）
   * @param {string} projectId - 项目ID
   * @param {string} docType - 文档类型
   * @param {File} file - PDF 文件对象
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(projectId, docType, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('docType', docType);
    const result = await Http.upload('/files/upload', formData);
    // 映射返回的 file 对象
    if (result.file) {
      result.file = _mapFile(result.file);
    }
    return result;
  },

  /**
   * 更新文件数据（提取结果、状态等）
   * @param {string} fileId - 文件ID
   * @param {Object} data - 待更新数据
   * @returns {Promise<Object>} 更新后的文件对象
   */
  async updateFile(fileId, data) {
    // 将前端格式转为后端格式
    const mapped = {};
    if (data.status !== undefined) mapped.status = data.status;
    if (data.extracted !== undefined) mapped.extracted_data = data.extracted;
    if (data.errorMsg !== undefined) mapped.error_msg = data.errorMsg;
    if (data.mdContent !== undefined) mapped.md_content = data.mdContent;
    if (data.nasPath !== undefined) mapped.nas_path = data.nasPath;
    const result = await Http.put(`/files/${fileId}`, mapped);
    return _mapFile(result);
  },

  /**
   * 更新文件的提取结果（兼容旧接口，extract.js 和 app.js 使用）
   * @param {string} fileId - 文件ID
   * @param {Object} extracted - 提取结果对象
   */
  async updateFileExtracted(fileId, extracted) {
    return this.updateFile(fileId, { extracted, status: 'success' });
  },

  /**
   * 更新文件状态（兼容旧接口，app.js 使用）
   * @param {string} fileId - 文件ID
   * @param {string} status - 状态
   * @param {string} [errorMsg] - 错误信息
   */
  async updateFileStatus(fileId, status, errorMsg) {
    const data = { status };
    if (errorMsg !== undefined) data.errorMsg = errorMsg;
    return this.updateFile(fileId, data);
  },

  /**
   * 删除文件
   * @param {string} fileId - 文件ID
   */
  async deleteFile(fileId) {
    await Http.del(`/files/${fileId}`);
  },

  /**
   * 获取项目文件状态（含队列状态）
   * @param {string} projectId - 项目ID
   * @returns {Promise<{files: Array, queue: {queueLength: number, processing: boolean}}>}
   */
  async getFileStatus(projectId) {
    const result = await Http.get(`/files/status/${projectId}`);
    if (result.files) {
      result.files = result.files.map(_mapFile);
    }
    return result;
  },

  /**
   * 重试转换失败的文件
   * @param {string} fileId - 文件ID
   * @returns {Promise<Object>}
   */
  async retryFile(fileId) {
    return Http.post(`/files/${fileId}/retry`);
  },

  /**
   * 保存文件内容（兼容旧接口，新流程中文件通过 uploadFile 上传）
   * @param {string} projectId - 项目ID
   * @param {string} docType - 文档类型
   * @param {string} filename - 文件名
   * @param {string} content - 文件内容
   * @deprecated 新流程请使用 uploadFile 上传 PDF
   */
  async saveFile(projectId, docType, filename, content) {
    // 新流程不再支持直接保存文本内容
    console.warn('[DB] saveFile 已废弃，请使用 uploadFile 上传 PDF');
  },

  /**
   * 获取指定类型的文件（兼容旧接口）
   * @param {string} projectId - 项目ID
   * @param {string} docType - 文档类型
   * @returns {Promise<Object|null>}
   */
  async getFile(projectId, docType) {
    const files = await this.getFiles(projectId);
    return files.find(f => f.docType === docType) || null;
  },

  // ==================== 合并数据相关操作 ====================

  /**
   * 保存合并后的项目数据
   * @param {string} projectId - 项目ID
   * @param {Object} formData - 合并后的字段数据
   * @param {Object} [conflicts] - 冲突信息
   */
  async saveMergedData(projectId, formData, conflicts) {
    return Http.post(`/projects/${projectId}/merged-data`, {
      formData,
      conflicts: conflicts || {}
    });
  },

  /**
   * 获取合并后的项目数据
   * @param {string} projectId - 项目ID
   * @returns {Promise<Object|null>} 合并数据
   */
  async getMergedData(projectId) {
    return Http.get(`/projects/${projectId}/merged-data`);
  }
};
