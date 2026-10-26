/**
 * 归档时：本地暂存搬迁到最终路径；NAS 按最终路径尽力上传
 */
const dao = require('../database/dao');
const archiveDao = require('../database/archiveDao');
const nasService = require('./nas');
const localStorage = require('./localStorage');
const nasPaths = require('../utils/nasPaths');
const logger = require('../utils/logger');
const config = require('../config');
const archiveTemplates = require('../config/archiveTemplates');

/**
 * 将项目全部文件从本地暂存移至最终归档路径，并尽力写入 NAS
 * @param {string} projectId
 * @param {Object} project - projects 表记录
 * @param {string} year - 4 位中标年份
 * @returns {Promise<void>}
 */
async function moveProjectFilesToFinalArchive(projectId, project, year, templateCode) {
  const projectWithDept = dao.getProjectWithDepartment(projectId);
  const categoryName = projectWithDept?.category_name || '招标';
  const files = dao.getFilesByProject(projectId);
  const template = archiveTemplates.getTemplate(templateCode)
    || archiveTemplates.getTemplate(archiveTemplates.resolveTemplateCode(projectWithDept || project, {}));

  if (!template) {
    throw new Error('归档模板不存在');
  }

  const basePathArgs = {
    region: project.region,
    year,
    procurementType: project.procurement_type || 'G',
    categoryName,
    projectName: project.name
  };

  const filePlans = files.map((file) => {
    const segmentNo = file.segment_no || 0;
    const folderItem = archiveTemplates.resolveFolderItem(template, file);
    return { file, segmentNo, folderItem };
  });

  // 先搬迁有文件的目录
  for (const { file, segmentNo, folderItem } of filePlans) {
    const stagingAbs = nasPaths.resolveLocalAbs(file.local_path)
      || (file.local_path ? nasPaths.localStagingAbs(file.local_path) : null);
    if (!stagingAbs || !localStorage.fileExists(stagingAbs)) {
      throw new Error(`文件「${file.file_name}」尚未存入本地，无法归档`);
    }

    const archiveRel = nasPaths.relativeArchive({
      ...basePathArgs,
      segmentNo,
      folderName: folderItem.folderName,
      fileName: file.file_name
    });
    const archiveAbs = nasPaths.localArchiveAbs(archiveRel);
    const nasFinalPath = nasPaths.nasArchiveAbs(archiveRel);

    if (stagingAbs !== archiveAbs) {
      localStorage.moveFile(stagingAbs, archiveAbs);
    }

    const patch = {
      local_path: archiveRel,
      folder_key: `${template.code}:${folderItem.key}`
    };
    if (config.nas.enabled) {
      try {
        const buffer = localStorage.readFile(archiveAbs);
        await nasService.uploadFileWithRetry(nasFinalPath, buffer);
        patch.nas_path = nasFinalPath;
        logger.info('归档', `NAS 已写入: ${file.file_name}`, { projectId, to: nasFinalPath });
      } catch (nasError) {
        patch.nas_path = null;
        patch.error_msg = '文件未能存入 NAS: ' + (nasError.message || '未知错误');
        logger.error('归档', `NAS 写入失败（本地已归档）: ${file.file_name}`, nasError);
      }
    } else {
      patch.nas_path = null;
    }

    dao.updateFile(file.id, patch);
    logger.info('归档', `本地已搬迁: ${file.file_name}`, {
      projectId,
      from: stagingAbs,
      to: archiveAbs
    });
  }

  // 再按模板创建全部目录；没有文件的目录追加“（空）”
  const segmentNos = new Set(filePlans.map((p) => p.segmentNo));
  let segmentConfig = [];
  try {
    segmentConfig = JSON.parse(project.segments || '[]');
  } catch {
    segmentConfig = [];
  }
  if (segmentConfig.length > 1) {
    for (let i = 1; i <= segmentConfig.length; i++) segmentNos.add(i);
  } else if (segmentNos.size === 0) {
    segmentNos.add(0);
  }

  for (const segmentNo of segmentNos) {
    const usedKeys = new Set(
      filePlans.filter((p) => p.segmentNo === segmentNo).map((p) => p.folderItem.key)
    );
    const projectDir = nasPaths.relativeProjectDir({ ...basePathArgs, segmentNo });

    for (const folderItem of template.items) {
      const hasFiles = usedKeys.has(folderItem.key);
      if (!hasFiles && folderItem.createIfFiles) continue;
      const folderName = archiveTemplates.getFolderDisplayName(folderItem, hasFiles);
      const relDir = `${projectDir}/${nasPaths.sanitizePathSegment(folderName)}`;
      localStorage.ensureDirectory(nasPaths.localArchiveAbs(relDir));
      if (config.nas.enabled) {
        try {
          await nasService.ensureDirectory(nasPaths.nasArchiveAbs(relDir));
        } catch (error) {
          logger.warn('归档', `NAS 创建空目录失败（继续）: ${relDir}`, error);
        }
      }
    }
  }

  const localStagingDir = nasPaths.localStagingAbs(projectId);
  try {
    localStorage.deleteDirectory(localStagingDir);
  } catch (error) {
    logger.warn('归档', `清理本地暂存目录失败（继续）: ${localStagingDir}`, error);
  }

  try {
    await nasService.deleteRemoteDirectory(nasPaths.getStagingDir(projectId));
  } catch (error) {
    logger.warn('归档', `清理 NAS 历史暂存目录失败（继续）: ${nasPaths.getStagingDir(projectId)}`, error);
  }
}

/**
 * 删除项目本地暂存目录，并尽力清理 NAS 历史暂存
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function cleanupProjectStagingNas(projectId) {
  const localStagingDir = nasPaths.localStagingAbs(projectId);
  try {
    localStorage.deleteDirectory(localStagingDir);
  } catch (error) {
    logger.warn('本地存储', `删除项目暂存目录失败（继续）: ${localStagingDir}`, error);
  }

  try {
    await nasService.deleteRemoteDirectory(nasPaths.getStagingDir(projectId));
  } catch (error) {
    logger.warn('NAS', `删除项目暂存目录失败（继续）: ${nasPaths.getStagingDir(projectId)}`, error);
  }
}

/**
 * 按库中路径尽力删除本地与 NAS 物理文件（撤回归档）
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function cleanupProjectStoredFiles(projectId) {
  const files = dao.getFilesByProject(projectId);
  const archiveRefs = new Set();

  for (const file of files) {
    localStorage.tryDeleteByRel(file.local_path);
    if (file.nas_path) {
      try {
        await nasService.deleteRemoteFile(file.nas_path);
      } catch (error) {
        logger.warn('NAS', `删除归档文件失败（继续）: ${file.nas_path}`, error);
      }
    }
    // 兜底：从文件相对路径推导项目目录
    if (file.local_path) {
      const parts = String(file.local_path).split('/').filter(Boolean);
      if (parts.length >= 2) archiveRefs.add(`${parts[0]}/${parts[1]}`);
    }
  }

  // 优先使用归档记录中的 archive_ref（包含空目录所在项目目录）
  try {
    for (const row of archiveDao.getArchivesByProject(projectId)) {
      if (row.archive_ref) archiveRefs.add(row.archive_ref);
    }
  } catch (error) {
    logger.warn('归档', `读取归档目录失败（继续）: ${projectId}`, error);
  }

  for (const ref of archiveRefs) {
    try {
      localStorage.deleteDirectory(nasPaths.localArchiveAbs(ref));
    } catch (error) {
      logger.warn('本地存储', `删除项目归档目录失败（继续）: ${ref}`, error);
    }
    if (config.nas.enabled) {
      try {
        await nasService.deleteRemoteDirectory(nasPaths.nasArchiveAbs(ref));
      } catch (error) {
        logger.warn('NAS', `删除项目归档目录失败（继续）: ${ref}`, error);
      }
    }
  }

  await cleanupProjectStagingNas(projectId);
}

module.exports = {
  moveProjectFilesToFinalArchive,
  cleanupProjectStagingNas,
  cleanupProjectStoredFiles
};
