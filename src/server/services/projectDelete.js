/**
 * 项目物理删除服务
 * 清理本地/NAS 文件、归档记录（若存在）及数据库关联数据
 */
const dao = require('../database/dao');
const archiveDao = require('../database/archiveDao');
const nasArchive = require('./nasArchive');

/**
 * 物理删除项目及其全部关联数据
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function performPhysicalProjectDelete(projectId) {
  await nasArchive.cleanupProjectStoredFiles(projectId);
  archiveDao.removeArchive(projectId);
  dao.deleteProject(projectId);
}

module.exports = {
  performPhysicalProjectDelete
};
