/**
 * db.js - 后端 REST API 数据访问封装
 * 通过 Http 模块调用后端 API，替代原 IndexedDB (Dexie.js)
 * 包含字段映射：后端 snake_case → 前端 camelCase
 */

/**
 * 映射后端项目字段为前端格式
 * 后端: id, name, status, created_by, created_by_name, updated_by, updated_by_name,
 *       department_id, department_name, department_sort_order,
 *       category_id, category_code, category_name, category_sort_order,
 *       synced_at, created_at, updated_at
 * 前端: projectId, projectName, status, createdBy, createdByName, updatedBy, updatedByName,
 *       departmentId, departmentName, departmentSortOrder,
 *       categoryId, categoryCode, categoryName, categorySortOrder,
 *       syncedAt, createdAt, updatedAt
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
    updatedBy: p.updated_by || p.updatedBy,
    updatedByName: p.updated_by_name || p.updatedByName,
    departmentId: p.department_id || p.departmentId || '',
    departmentName: p.department_name || p.departmentName || '',
    departmentSortOrder: p.department_sort_order != null
      ? Number(p.department_sort_order)
      : (p.departmentSortOrder != null ? Number(p.departmentSortOrder) : Number.MAX_SAFE_INTEGER),
    categoryId: p.category_id || p.categoryId || '',
    categoryCode: p.category_code || p.categoryCode || 'tender',
    categoryName: p.category_name || p.categoryName || '招标',
    categorySortOrder: p.category_sort_order != null
      ? Number(p.category_sort_order)
      : (p.categorySortOrder != null ? Number(p.categorySortOrder) : 1),
    procurementType: p.procurement_type || p.procurementType || 'G',
    region: p.region || '',
    reviewComment: p.review_comment || p.reviewComment || '',
    reviewedBy: p.reviewed_by || p.reviewedBy || '',
    reviewedByName: p.reviewed_by_name || p.reviewedByName || '',
    reviewedAt: p.reviewed_at || p.reviewedAt || '',
    paperReviewedBy: p.paper_reviewed_by || p.paperReviewedBy || '',
    paperReviewedByName: p.paper_reviewed_by_name || p.paperReviewedByName || '',
    paperReviewedAt: p.paper_reviewed_at || p.paperReviewedAt || '',
    paperReviewComment: p.paper_review_comment || p.paperReviewComment || '',
    archiveTemplate: p.archive_template || p.archiveTemplate || '',
    projectNo: p.project_no || p.projectNo || '',
    paperTotal: Number(p.paper_total != null ? p.paper_total : (p.paperTotal != null ? p.paperTotal : 0)) || 0,
    paperConfirmed: Number(p.paper_confirmed != null ? p.paper_confirmed : (p.paperConfirmed != null ? p.paperConfirmed : 0)) || 0,
  };
}

/**
 * 映射后端文件字段为前端格式
 * 后端: id, project_id, doc_type, file_name, md_content, extracted_data, status, nas_path, local_path, error_msg
 * 前端: id, projectId, docType, filename, content, extracted, status, nasPath, localPath, errorMsg
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
    localPath: f.local_path || f.localPath,
    segmentNo: f.segment_no !== undefined ? f.segment_no : (f.segmentNo || 0),
    errorMsg: (f.error_msg && f.error_msg !== 'null') ? f.error_msg : (f.errorMsg || null),
    contentHash: f.content_hash || f.contentHash || null,
    folderKey: f.folder_key || f.folderKey || '',
    createdAt: f.created_at || f.createdAt,
    updatedAt: f.updated_at || f.updatedAt,
    hasPaper: !!(f.has_paper || f.hasPaper),
    paperReviewed: !!(f.paper_reviewed || f.paperReviewed),
  };
}

window.DB = {

  // ==================== 项目相关操作 ====================

  /**
   * 创建新项目
   * @param {string} name - 项目名称
   * @param {string} [categoryCode='tender'] - 业务分类 code：tender | consult | cost
   * @param {{ region?: string, procurementType?: string }} [options]
   * @returns {Promise<string>} 创建的项目ID
   */
  async createProject(name, categoryCode = 'tender', options = {}) {
    const body = {
      name,
      categoryCode,
      region: options.region || '',
      procurementType: options.procurementType || 'G'
    };
    const project = await Http.post('/projects', body);
    return _mapProject(project).projectId;
  },

  /**
   * 获取项目列表（含可见部门骨架与全局状态统计）
   * @param {Object} [options]
   * @param {string} [options.search]
   * @param {string[]} [options.categoryCodes]
   * @param {string[]} [options.statuses]
   * @param {string[]} [options.regions]
   * @param {string[]} [options.tenderTypes]
   * @param {string[]} [options.projectTypes]
   * @param {string[]} [options.roadLevels]
   * @param {string[]} [options.industries]
   * @param {number} [options.page]
   * @param {number} [options.pageSize]
   * @returns {Promise<{ projects: Array, departments: Array, stats: Object, total: number, page: number, pageSize: number }>}
   */
  async getProjects({
    search = '',
    searchField = 'name_overview',
    categoryCodes = [],
    statuses = [],
    regions = [],
    tenderTypes = [],
    projectTypes = [],
    roadLevels = [],
    industries = [],
    page = 1,
    pageSize = 100,
    dateField = '',
    dateFrom = '',
    dateTo = '',
    amountField = 'totalInvestment',
    amountMin = '',
    amountMax = '',
    mileageMin = '',
    mileageMax = ''
  } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (searchField) params.set('searchField', searchField);
    if (dateField) params.set('dateField', dateField);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (amountField) params.set('amountField', amountField);
    if (amountMin !== '' && amountMin != null) params.set('amountMin', String(amountMin));
    if (amountMax !== '' && amountMax != null) params.set('amountMax', String(amountMax));
    if (mileageMin !== '' && mileageMin != null) params.set('mileageMin', String(mileageMin));
    if (mileageMax !== '' && mileageMax != null) params.set('mileageMax', String(mileageMax));
    for (const code of categoryCodes) {
      if (code) params.append('categoryCode', code);
    }
    for (const status of statuses) {
      if (status) params.append('status', status);
    }
    for (const region of regions) {
      if (region) params.append('region', region);
    }
    for (const v of tenderTypes) {
      if (v) params.append('tenderType', v);
    }
    for (const v of projectTypes) {
      if (v) params.append('projectType', v);
    }
    for (const v of roadLevels) {
      if (v) params.append('roadLevel', v);
    }
    for (const v of industries) {
      if (v) params.append('industry', v);
    }
    const query = params.toString();
    const result = await Http.get(`/projects${query ? `?${query}` : ''}`);
    const items = result.items || [];
    const departments = (result.departments || []).map((d) => ({
      id: d.id,
      name: d.name,
      sortOrder: d.sortOrder != null ? Number(d.sortOrder) : 0
    }));
    const stats = result.stats || {};
    return {
      projects: items.map(_mapProject),
      departments,
      stats: {
        inProgress: Number(stats.inProgress) || 0,
        pendingReview: Number(stats.pendingReview) || 0,
        reviewRejected: Number(stats.reviewRejected) || 0,
        pendingPaper: Number(stats.pendingPaper) || 0,
        archived: Number(stats.archived) || 0
      },
      total: Number(result.total) || 0,
      page: Number(result.page) || page,
      pageSize: Number(result.pageSize) || pageSize
    };
  },

  /**
   * 获取所有项目（兼容旧接口名）
   * @returns {Promise<Array>}
   */
  async getAllProjects() {
    const { projects } = await this.getProjects();
    return projects;
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
   * 更新项目归档模板（空值表示自动）
   * @param {string} projectId
   * @param {string} archiveTemplate
   * @returns {Promise<Object>}
   */
  async updateArchiveTemplate(projectId, archiveTemplate) {
    const result = await Http.put(`/projects/${projectId}/archive-template`, {
      archiveTemplate: archiveTemplate || ''
    });
    return _mapProject(result);
  },

  /**
   * 更新项目信息
   * @param {string} projectId
   * @param {Object} data
   * @returns {Promise<Object>}
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
   * 管理员调整项目所属部门与临时归属人
   * @param {string} projectId
   * @param {{ departmentId: string, ownerUserId: string }} data
   * @returns {Promise<Object>}
   */
  async reassignProjectOwnership(projectId, data) {
    const result = await Http.put(`/projects/${projectId}/ownership`, {
      departmentId: data.departmentId,
      ownerUserId: data.ownerUserId
    });
    return _mapProject(result);
  },

  /**
   * 删除项目及其关联数据
   * @param {string} projectId - 项目ID
   */
  async deleteProject(projectId) {
    await Http.del(`/projects/${projectId}`);
  },

  /**
   * 批量删除项目
   * @param {string[]} projectIds - 项目 ID 列表
   * @returns {Promise<Object>}
   */
  async deleteProjectsBatch(projectIds) {
    return Http.post('/projects/delete-batch', { ids: projectIds });
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
   * 上传文件（后端处理转换 / NAS；支持同分类同标段去重覆盖）
   * @param {string} projectId - 项目ID
   * @param {string} docType - 文档类型
   * @param {File} file - 文件对象
   * @param {number} [segmentNo=0] - 标段编号（1-based，0 表示未分配）
   * @param {{ overwrite?: boolean, onProgress?: (loaded: number, total: number) => void }} [options]
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(projectId, docType, file, segmentNo = 0, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('docType', docType);
    formData.append('segmentNo', segmentNo);
    if (options.folderKey) {
      formData.append('folderKey', options.folderKey);
    }
    if (options.overwrite) {
      formData.append('overwrite', 'true');
    }
    const result = await Http.upload('/files/upload', formData, options.onProgress);
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
    if (data.localPath !== undefined) mapped.local_path = data.localPath;
    if (data.hasPaper !== undefined) mapped.hasPaper = !!data.hasPaper;
    if (data.folderKey !== undefined) mapped.folder_key = data.folderKey;
    const result = await Http.put(`/files/${fileId}`, mapped);
    return _mapFile(result);
  },

  /**
   * 管理员确认含纸质文件（待审核）
   * @param {string} fileId
   * @param {boolean} paperReviewed
   * @returns {Promise<Object>}
   */
  async updateFilePaperReview(fileId, paperReviewed) {
    const result = await Http.put(`/files/${fileId}/paper-review`, { paperReviewed: !!paperReviewed });
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

  /**
   * 更新文件标段号
   * @param {string} fileId - 文件ID
   * @param {number} segmentNo - 标段编号（1-based，0 表示未分配）
   */
  async updateFileSegmentNo(fileId, segmentNo) {
    return Http.put(`/files/${fileId}/segment-no`, { segmentNo });
  },

  // ==================== 合并数据相关操作 ====================

  /**
   * 保存合并后的项目数据
   * @param {string} projectId - 项目ID
   * @param {Object} formData - 合并后的字段数据
   * @param {Object} [conflicts] - 冲突信息
   * @param {Array} [segmentFormData] - 多标段表单数据
   */
  async saveMergedData(projectId, formData, conflicts, segmentFormData) {
    const payload = {
      formData,
      conflicts: conflicts || {}
    };
    if (segmentFormData != null) {
      payload.segmentFormData = segmentFormData;
    }
    return Http.post(`/projects/${projectId}/merged-data`, payload);
  },

  /**
   * 获取合并后的项目数据
   * @param {string} projectId - 项目ID
   * @returns {Promise<Object|null>} 合并数据
   */
  async getMergedData(projectId) {
    const data = await Http.get(`/projects/${projectId}/merged-data`);
    if (!data) return null;
    // 统一为前端可用的 camelCase（dao 返回 form_data）
    return {
      ...data,
      formData: data.formData || data.form_data || {},
      conflicts: data.conflicts || {},
      segmentFormData: data.segmentFormData || data.segment_form_data || []
    };
  }
};
