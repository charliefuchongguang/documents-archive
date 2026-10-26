/**
 * 项目状态常量与状态机辅助函数
 */
const STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  REVIEW_REJECTED: 'review_rejected',
  REVIEW_APPROVED: 'review_approved',
  PENDING_PAPER: 'pending_paper',
  ARCHIVED: 'archived'
};

function isProjectLocked(status) {
  return status === STATUS.PENDING_REVIEW
    || status === STATUS.PENDING_PAPER
    || status === STATUS.ARCHIVED;
}

function canSubmitForReview(status) {
  return status === STATUS.DRAFT || status === STATUS.REVIEW_REJECTED;
}

function canAdminReview(status) {
  return status === STATUS.PENDING_REVIEW;
}

function canPaperReview(status) {
  return status === STATUS.PENDING_PAPER;
}

function getLockedErrorMessage(status) {
  if (status === STATUS.PENDING_REVIEW) return '待审核项目无法修改';
  if (status === STATUS.PENDING_PAPER) return '待纸质核对项目无法修改';
  if (status === STATUS.ARCHIVED) return '已归档项目无法修改';
  return '当前项目状态无法修改';
}

function getStatusLabel(status) {
  const labels = {
    [STATUS.DRAFT]: '草稿',
    [STATUS.PENDING_REVIEW]: '待审核',
    [STATUS.REVIEW_REJECTED]: '审核不通过',
    [STATUS.REVIEW_APPROVED]: '审核通过',
    [STATUS.PENDING_PAPER]: '待纸质核对',
    [STATUS.ARCHIVED]: '已归档'
  };
  return labels[status] || status;
}

/**
 * 若项目处于锁定状态则写 409 响应
 * @param {import('express').Response} res
 * @param {{ status?: string }|null|undefined} project
 * @returns {boolean} true 表示已拦截
 */
function respondIfProjectLocked(res, project) {
  if (!project || !isProjectLocked(project.status)) return false;
  res.status(409).json({ error: getLockedErrorMessage(project.status) });
  return true;
}

module.exports = {
  STATUS,
  isProjectLocked,
  canSubmitForReview,
  canAdminReview,
  canPaperReview,
  getLockedErrorMessage,
  getStatusLabel,
  respondIfProjectLocked
};
