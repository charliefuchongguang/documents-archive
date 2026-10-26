/**
 * 项目访问权限校验
 * 规则：管理员可访问全部；普通用户可访问所属部门与自己部门相同的项目（可读可写）
 */
const dao = require('../database/dao');

/**
 * 校验当前用户是否可访问项目
 * @param {Object|undefined} project - 项目记录
 * @param {string} userId - 当前用户 ID
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function checkProjectAccess(project, userId) {
  if (!project) {
    return { ok: false, status: 404, error: '项目不存在' };
  }
  if (!dao.canAccessProject(project, userId)) {
    return { ok: false, status: 403, error: '无权访问此项目' };
  }
  return { ok: true };
}

/**
 * @deprecated 语义已扩展为部门级访问，请优先使用 checkProjectAccess
 */
function checkProjectOwner(project, userId) {
  return checkProjectAccess(project, userId);
}

/**
 * 在 Express 响应中写入访问校验结果
 * @param {import('express').Response} res
 * @param {{ ok: boolean, status?: number, error?: string }} result
 * @returns {boolean} 校验通过返回 true，否则已写响应返回 false
 */
function respondProjectAccessCheck(res, result) {
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return false;
  }
  return true;
}

/** @deprecated 请优先使用 respondProjectAccessCheck */
function respondProjectOwnerCheck(res, result) {
  return respondProjectAccessCheck(res, result);
}

/**
 * 根据请求用户刷新项目最后更新者
 * @param {string} projectId
 * @param {{ userid?: string, name?: string }|undefined} user
 */
function touchUpdaterFromReq(projectId, user) {
  if (!projectId || !user?.userid) return;
  dao.touchProjectUpdater(projectId, user.userid, user.name || '');
}

module.exports = {
  checkProjectAccess,
  checkProjectOwner,
  respondProjectAccessCheck,
  respondProjectOwnerCheck,
  touchUpdaterFromReq
};
