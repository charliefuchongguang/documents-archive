/**
 * 数据提交控制器 - 智能表格提交已停用
 */
module.exports = {
  async submit(req, res) {
    res.status(410).json({ error: '智能表格提交功能已停用，请使用 Excel 导出' });
  }
};
