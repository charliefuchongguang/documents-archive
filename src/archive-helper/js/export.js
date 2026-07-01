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
   * 批量导出归档数据为 Excel 文件
   * @param {Array} archivesData - 后端返回的归档数组
   *   每条记录: { seq_no, project_id, project_name, form_data (JSON string), submitted_by_name, submitted_at }
   */
  exportArchivesToExcel(archivesData) {
    if (!archivesData || archivesData.length === 0) {
      ElementPlus.ElMessage.warning('没有可导出的归档数据');
      return;
    }

    // 1. 解析所有 form_data，收集全部字段 key（保持 Utils.FIELDS 顺序优先）
    const parsedRows = archivesData.map(record => {
      let formObj = {};
      try {
        formObj = typeof record.form_data === 'string' ? JSON.parse(record.form_data) : (record.form_data || {});
      } catch {
        formObj = {};
      }
      return { record, formObj };
    });

    // 构建表头：序号 | 项目编号 | 项目名称 | 标段名称 | [form_data 字段] | 提交人 | 提交时间
    // 排除与表头固定列重复或内部使用的字段
    const excludeKeys = ['segmentName'];
    const knownKeys = Utils.FIELDS.map(f => f.key).filter(k => !excludeKeys.includes(k));
    const extraKeys = [];
    parsedRows.forEach(({ formObj }) => {
      Object.keys(formObj).forEach(k => {
        if (!knownKeys.includes(k) && !extraKeys.includes(k) && !excludeKeys.includes(k)) {
          extraKeys.push(k);
        }
      });
    });
    const allKeys = [...knownKeys, ...extraKeys];

    // 构建 label 映射
    const labelMap = {};
    Utils.FIELDS.forEach(f => { labelMap[f.key] = f.label; });

    const headers = ['序号', '项目编号', '项目名称', '标段名称', ...allKeys.map(k => labelMap[k] || k), '提交人', '提交时间'];

    // 2. 构建数据行
    const rows = parsedRows.map(({ record, formObj }, idx) => {
      const row = [
        record.seq_no || (idx + 1),
        record.project_no || '',
        record.project_name || '',
        record.segment_name || ''
      ];
      allKeys.forEach(k => row.push(formObj[k] || ''));
      row.push(record.submitted_by_name || '');
      row.push(record.submitted_at || '');
      return row;
    });

    // 3. 使用 SheetJS 生成工作簿
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const colWidths = headers.map(h => ({ wch: Math.max(String(h).length * 2, 15) }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '归档汇总');

    // 4. 生成文件名并下载
    const date = dayjs().format('YYYYMMDD');
    const filename = `归档汇总表_${date}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

};
