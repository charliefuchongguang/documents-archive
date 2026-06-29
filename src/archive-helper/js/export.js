/**
 * Excel 导出模块
 * 使用 SheetJS 将项目数据导出为 Excel 文件
 */

window.Export = {

  /**
   * 导出项目数据为 Excel 文件
   * @param {Object} formData - 表单数据 { fieldKey: value }
   * @param {String} projectName - 项目名称（用于文件名）
   */
  exportToExcel(formData, projectName) {
    // 1. 按照字段映射表的顺序（30个字段）构建数据行
    //    使用 Utils.FIELDS 获取字段顺序和中文标题

    // 2. 构建表头行（中文字段名）和数据行
    const headers = [];  // ['序号', '项目编号', '项目类型', ...]
    const row = [];      // [1, 'ZEC-Z25F-011', '招投标', ...]

    // 序号字段（第0个，系统生成，固定为1）
    headers.push('序号');
    row.push(1);

    // 遍历 Utils.FIELDS 按顺序添加
    Utils.FIELDS.forEach(field => {
      headers.push(field.label);
      row.push(formData[field.key] || '');
    });

    // 3. 使用 SheetJS 创建工作簿
    const ws = XLSX.utils.aoa_to_sheet([headers, row]);

    // 4. 设置列宽（让内容更易读）
    const colWidths = headers.map(h => ({ wch: Math.max(h.length * 2, 15) }));
    ws['!cols'] = colWidths;

    // 5. 创建工作簿并添加工作表
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '项目档案');

    // 6. 生成文件名并下载
    const date = dayjs().format('YYYYMMDD');
    const safeName = (projectName || '未命名项目').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `项目档案_${safeName}_${date}.xlsx`;

    XLSX.writeFile(wb, filename);
  },

  /**
   * 批量导出多个项目（预留，MVP不实现）
   */
  exportMultiple(projectsData) {
    // 预留接口
    ElMessage.info('批量导出功能开发中');
  }

};
