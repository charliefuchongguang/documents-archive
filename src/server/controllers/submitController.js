/**
 * 归档提交控制器
 * - 提交项目到归档表
 * - 管理员查看归档列表
 * - 管理员撤回归档（支持单条/批量）
 * - 管理员导出归档数据
 */
const dao = require('../database/dao');
const archiveDao = require('../database/archiveDao');

module.exports = {
  /**
   * POST /api/submit/project/:id
   * 提交项目到归档表
   * 归档前自动合并所有文件的 extracted_data + 已有 merged_data
   */
  async submitProject(req, res) {
    try {
      const projectId = req.params.id;
      const project = dao.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: '项目不存在' });
      }

      // 已归档项目不允许重复提交
      if (project.status === 'archived') {
        return res.status(409).json({ error: '已归档项目无法重复提交' });
      }

      // ========== 生成项目编号 ==========
      const year = new Date().getFullYear().toString().slice(-2); // e.g. '26'
      const procurementType = project.procurement_type || 'F';
      const projectNo = archiveDao.generateProjectNo(year, procurementType);

      // ========== 归档前自动合并提取数据 ==========
      // 1. 读取所有文件的 extracted_data，按 segment_no 分组
      const files = dao.getFilesByProject(projectId);
      const globalExtracted = {};      // segment_no=0 的全局共享数据
      const segmentExtractedMap = {};  // { segNo: { merged fields } }

      files.forEach(file => {
        if (file.extracted_data) {
          try {
            const data = typeof file.extracted_data === 'string'
              ? JSON.parse(file.extracted_data)
              : file.extracted_data;
            const segNo = file.segment_no || 0;
            if (segNo === 0) {
              Object.assign(globalExtracted, data);
            } else {
              if (!segmentExtractedMap[segNo]) segmentExtractedMap[segNo] = {};
              Object.assign(segmentExtractedMap[segNo], data);
            }
          } catch {}
        }
      });

      // 2. 读取已有的 merged_data（用户在复核页面手动编辑过的数据）
      const existingMerged = dao.getMergedData(projectId);
      const existingFormData = (existingMerged && existingMerged.form_data)
        ? (typeof existingMerged.form_data === 'string'
          ? JSON.parse(existingMerged.form_data)
          : existingMerged.form_data)
        : {};

      // 3. 合并全局数据：globalExtracted 为基础，已有 merged_data 优先
      const finalFormData = { ...globalExtracted, ...existingFormData };

      // 4. 保存合并结果到 merged_data 表
      dao.saveMergedData({
        projectId,
        formData: finalFormData,
        conflicts: existingMerged?.conflicts || {}
      });

      console.log(`[提交归档] 项目 ${project.name} 合并完成：全局${Object.keys(globalExtracted).length}个字段，${Object.keys(segmentExtractedMap).length}个标段组 → 共享${Object.keys(finalFormData).length}个字段`);

      // ========== 获取标段配置，按标段写入归档表 ==========
      const segments = JSON.parse(project.segments || '[]');

      let archiveResult;

      if (segments.length <= 1) {
        // ---------- 单标段逻辑 ----------
        // form_data 中写入 projectNo
        finalFormData.projectNo = projectNo;

        archiveResult = archiveDao.archiveProject({
          projectId,
          projectName: project.name,
          formData: finalFormData,
          submittedBy: req.user.userid,
          submittedByName: req.user.name,
          segmentNo: 0,
          segmentName: '',
          projectNo
        });
      } else {
        // ---------- 多标段逻辑 ----------
        const segmentFormData = req.body.segmentFormData || [];

        const formDataArray = segments.map((seg, i) => {
          const segNo = i + 1;
          // 优先使用前端传来的标段数据
          if (segmentFormData[i] && segmentFormData[i].formData) {
            const segData = { ...segmentFormData[i].formData };
            segData.projectNo = projectNo;
            return segData;
          }
          // fallback：用全局共享数据 + 该标段的提取数据构建
          const segExtracted = segmentExtractedMap[segNo] || {};
          const segData = { ...finalFormData, ...segExtracted };
          segData.projectNo = projectNo;
          return segData;
        });

        archiveResult = archiveDao.archiveProjectBatch({
          projectId,
          projectName: project.name,
          segments,
          formDataArray,
          projectNo,
          submittedBy: req.user.userid,
          submittedByName: req.user.name
        });
      }

      // 更新项目状态为已归档
      dao.updateProject(projectId, { status: 'archived' });

      res.status(201).json({
        success: true,
        archive: archiveResult,
        projectNo,
        message: '项目已成功提交到归档表'
      });
    } catch (error) {
      console.error('[提交归档] 失败:', error.message);
      if (error.message.includes('已归档')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/submit/archives?page=1&pageSize=20
   * 获取归档列表（仅管理员）
   */
  async listArchives(req, res) {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const result = archiveDao.getArchives({
        page: Number(page),
        pageSize: Number(pageSize)
      });
      res.json(result);
    } catch (error) {
      console.error('[归档列表] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * DELETE /api/submit/archive/:id
   * 撤回归档 - 单条（仅管理员）
   * 删除归档记录，同时删除关联项目数据
   */
  async undoArchive(req, res) {
    try {
      const projectId = req.params.id;

      // 检查归档记录是否存在
      const archive = archiveDao.getArchive(projectId);
      if (!archive) {
        return res.status(404).json({ error: '归档记录不存在' });
      }

      // 删除归档记录（archiveDao 内部会自动压缩序号）
      archiveDao.removeArchive(projectId);

      // 删除关联的项目数据（级联删除 files、merged_data 等）
      dao.deleteProject(projectId);

      res.json({ success: true, message: '归档已撤回，项目及相关数据已删除' });
    } catch (error) {
      console.error('[撤回归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/submit/archive/undo-batch
   * 批量撤回归档（仅管理员）
   * Body: { ids: ["project-id-1", "project-id-2"] }
   * 删除归档记录及关联项目数据，自动压缩序号
   */
  async undoArchiveBatch(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要撤回的归档项目 ID 列表' });
      }

      const results = { success: [], failed: [] };

      for (const projectId of ids) {
        try {
          const archive = archiveDao.getArchive(projectId);
          if (!archive) {
            results.failed.push({ id: projectId, reason: '归档记录不存在' });
            continue;
          }

          // 删除归档记录（archiveDao 内部会自动压缩序号）
          archiveDao.removeArchive(projectId);

          // 删除关联的项目数据（级联删除 files、merged_data 等）
          dao.deleteProject(projectId);

          results.success.push(projectId);
        } catch (err) {
          results.failed.push({ id: projectId, reason: err.message });
        }
      }

      res.json({
        success: true,
        message: `成功撤回 ${results.success.length} 条，失败 ${results.failed.length} 条`,
        results
      });
    } catch (error) {
      console.error('[批量撤回归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/submit/export-excel
   * 获取全部归档数据供前端生成Excel（仅管理员）
   */
  async exportArchivesExcel(req, res) {
    try {
      const data = archiveDao.getAllArchivesForExport();
      res.json({ success: true, data, count: data.length });
    } catch (error) {
      console.error('[导出归档] 失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};
