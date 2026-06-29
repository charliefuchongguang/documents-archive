/**
 * 文件处理任务队列
 * 支持 MineRU PDF转换的异步排队处理
 * 上传后立即返回，后台排队处理，用户可随时查看进度
 */
const dao = require('../database/dao');
const mineruService = require('./mineru');
const nasService = require('./nas');
const fs = require('fs');
const path = require('path');

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '..', 'temp');

class TaskQueue {
  constructor() {
    this.queue = [];        // 待处理队列
    this.processing = false; // 是否正在处理
    this.concurrency = 1;   // 单线程处理（MineRU可能有并发限制）
  }

  /**
   * 添加文件到处理队列
   * @param {string} fileId - 文件ID
   */
  enqueue(fileId) {
    this.queue.push(fileId);
    console.log(`[队列] 文件 ${fileId} 加入队列，当前队列长度: ${this.queue.length}`);
    this._processNext();
  }

  /**
   * 处理下一个任务
   */
  async _processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const fileId = this.queue.shift();

    try {
      const file = dao.getFile(fileId);
      if (!file) {
        console.log(`[队列] 文件 ${fileId} 不存在，跳过`);
        this.processing = false;
        this._processNext();
        return;
      }

      // 更新状态为 converting
      dao.updateFile(fileId, { status: 'converting' });
      console.log(`[队列] 开始处理文件: ${file.file_name}`);

      // 按原始扩展名定位临时文件（支持 .pdf / .md / .markdown）
      const ext = (path.extname(file.file_name) || '.pdf').toLowerCase();
      const tempPath = path.join(TEMP_DIR, `${fileId}${ext}`);

      if (!fs.existsSync(tempPath)) {
        throw new Error('临时文件不存在，请重新上传');
      }

      const fileBuffer = fs.readFileSync(tempPath);

      // 步骤1：根据格式决定是否调用 MineRU
      // - PDF：调用 MineRU 转 Markdown
      // - MD/Markdown：直接读取文本作为 mdContent，跳过 MineRU
      const project = dao.getProject(file.project_id);
      let mdContent = '';
      let mineruMetadata = {};

      if (ext === '.md' || ext === '.markdown') {
        mdContent = fileBuffer.toString('utf-8');
        console.log(`[队列] Markdown 文件直接读取（跳过 MineRU），长度: ${mdContent.length}`);
      } else {
        try {
          const result = await mineruService.convertToMarkdown(fileBuffer, file.file_name);
          mdContent = result.markdown;
          mineruMetadata = result.metadata;
        } catch (convertError) {
          console.error(`[队列] MineRU 转换失败: ${file.file_name} - ${convertError.message}`);
          dao.updateFile(fileId, {
            status: 'convert_failed',
            error_msg: convertError.message
          });
          // 转换失败不清理临时文件，以便重试
          this.processing = false;
          this._processNext();
          return;
        }
      }

      // 步骤2：上传到 NAS
      let nasPath = null;
      let nasErrorMsg = null;
      try {
        const projectName = project ? project.name : 'unknown';
        const remotePath = nasService.buildArchivePath(projectName, file.doc_type, file.file_name);
        const nasResult = await nasService.uploadFile(remotePath, fileBuffer);
        nasPath = nasResult.path;
      } catch (nasError) {
        console.error(`[队列] NAS 上传失败: ${nasError.message}`);
        nasErrorMsg = 'PDF 未能存入 NAS';
      }

      // 步骤3：更新数据库
      dao.updateFile(fileId, {
        md_content: mdContent,
        status: 'uploaded',
        nas_path: nasPath,
        error_msg: nasErrorMsg
      });

      console.log(`[队列] 文件处理成功: ${file.file_name}，Markdown 长度: ${mdContent.length}`);

      // 清理临时文件
      try { fs.unlinkSync(tempPath); } catch (e) {
        console.warn(`[队列] 清理临时文件失败: ${tempPath}`, e.message);
      }

    } catch (error) {
      console.error(`[队列] 处理异常:`, error.message);
      // 尝试更新状态为失败
      try {
        dao.updateFile(fileId, {
          status: 'convert_failed',
          error_msg: error.message
        });
      } catch (dbError) {
        console.error(`[队列] 更新失败状态异常:`, dbError.message);
      }
    }

    this.processing = false;
    // 处理下一个
    this._processNext();
  }

  /**
   * 获取队列状态
   * @returns {{ queueLength: number, processing: boolean }}
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing
    };
  }
}

// 单例
module.exports = new TaskQueue();
