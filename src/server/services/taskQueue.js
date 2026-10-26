/**
 * 文件处理任务队列
 * 支持 MineRU 文档转换的异步排队处理
 * 上传后立即返回，后台排队处理，用户可随时查看进度
 *
 * 类型分流（见 utils/fileTypes）：
 * - bid_eval_report / handover_list / other_attach：整类仅存，跳过 MineRU
 * - pdf / image / docx / pptx / xlsx：MineRU 转 MD → 本地暂存
 * - md/markdown/txt：直读文本 → 本地暂存
 * - 其余：仅存本地暂存（不转 MD）
 */
const dao = require('../database/dao');
const mineruService = require('./mineru');
const localStorage = require('./localStorage');
const nasPaths = require('../utils/nasPaths');
const fileTypes = require('../utils/fileTypes');
const logger = require('../utils/logger');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '..', 'temp');

class TaskQueue {
  constructor() {
    this.queue = [];        // 待处理队列
    this.active = 0;        // 当前进行中任务数
    // 多槽等待 MinerU；真正打到 MinerU API 的并发由 mineru.maxConcurrent 控制
    this.concurrency = Math.max(1, Number(config.mineru.fileQueueConcurrency) || 10);
    /** @type {Map<string, boolean>} 覆盖上传时强制重新解析 */
    this.forceReparseMap = new Map();
  }

  /**
   * 添加文件到处理队列
   * @param {string} fileId - 文件ID
   * @param {{ forceReparse?: boolean }} [options]
   */
  enqueue(fileId, options = {}) {
    if (options.forceReparse) {
      this.forceReparseMap.set(fileId, true);
    }
    this.queue.push(fileId);
    logger.info('队列', `文件 ${fileId} 加入队列，当前队列长度: ${this.queue.length}`, {
      forceReparse: !!options.forceReparse
    });
    this._processNext();
  }

  /**
   * 处理下一个任务（可多并发）
   */
  async _processNext() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const fileId = this.queue.shift();
      this.active += 1;
      this._processFile(fileId)
        .catch((error) => {
          logger.error('队列', `处理异常: fileId=${fileId}`, error);
          try {
            dao.updateFile(fileId, {
              status: 'convert_failed',
              error_msg: error.message
            });
          } catch (dbError) {
            logger.error('队列', `更新失败状态异常: fileId=${fileId}`, dbError);
          }
        })
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this._processNext();
        });
    }
  }

  /**
   * 处理单个文件：按类型转换/直读 + 写入本地暂存
   * @param {string} fileId
   */
  async _processFile(fileId) {
    const file = dao.getFile(fileId);
    if (!file) {
      logger.warn('队列', `文件 ${fileId} 不存在，跳过`);
      return;
    }

    // 更新状态为 converting（前端对仅存类型显示「处理中」）
    dao.updateFile(fileId, { status: 'converting' });
    logger.info('队列', `开始处理文件: ${file.file_name}`, { fileId });

    const ext = fileTypes.getExt(file.file_name) || '.pdf';
    let tempPath = path.join(TEMP_DIR, `${fileId}${ext}`);

    if (!fs.existsSync(tempPath)) {
      // 临时文件已清理时，从本地暂存/归档副本回填，便于补转 MD
      const stagingAbs = nasPaths.resolveLocalAbs(file.local_path);
      if (stagingAbs && fs.existsSync(stagingAbs)) {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        fs.copyFileSync(stagingAbs, tempPath);
        logger.info('队列', `已从本地存储回填临时文件: ${tempPath}`, { fileId });
      } else {
        throw new Error('临时文件不存在，请重新上传');
      }
    }

    const fileBuffer = fs.readFileSync(tempPath);
    const forceReparse = !!this.forceReparseMap.get(fileId);
    this.forceReparseMap.delete(fileId);

    // 步骤1：按类型决定是否转换
    // - bid_eval_report / handover_list / other_attach 等整类仅存：跳过 MineRU / 文本直读
    // - pdf / image / docx / pptx / xlsx：MineRU 转 Markdown
    // - md/markdown/txt：直接读取文本
    // - 其余：仅存储，md_content 为空
    const project = dao.getProjectWithDepartment(file.project_id);
    let mdContent = null;
    let mineruMetadata = {};

    if (fileTypes.isStoreOnlyDocType(file.doc_type)) {
      logger.info('队列', `文档类型仅存储，跳过 MD 转换: ${file.file_name}`, {
        fileId,
        docType: file.doc_type,
        ext
      });
    } else if (fileTypes.needsMineru(file.file_name, file.doc_type)) {
      try {
        const result = await mineruService.convertToMarkdown(
          fileBuffer,
          file.file_name,
          fileId,
          { forceReparse }
        );
        mdContent = result.markdown;
        mineruMetadata = result.metadata;
      } catch (convertError) {
        logger.error('队列', `MineRU 转换失败: ${file.file_name}`, convertError);
        dao.updateFile(fileId, {
          status: 'convert_failed',
          error_msg: convertError.message
        });
        // 转换失败不清理临时文件，以便重试
        return;
      }
    } else if (fileTypes.isTextReadable(file.file_name, file.doc_type)) {
      mdContent = fileBuffer.toString('utf-8');
      logger.info('队列', `文本文件直接读取（跳过 MineRU），长度: ${mdContent.length}`, { fileId });
    } else {
      logger.info('队列', `仅存储类型，跳过 MD 转换: ${file.file_name}`, { fileId, ext });
    }

    // 步骤2：写入本地暂存（失败则任务失败；未归档不写 NAS）
    const stagingRel = nasPaths.relativeStaging(file.project_id, file.file_name);
    const stagingAbs = nasPaths.localStagingAbs(stagingRel);
    try {
      logger.info('队列', `准备写入本地暂存: ${stagingAbs}`, { fileId, fileName: file.file_name });
      localStorage.writeFile(stagingAbs, fileBuffer);
    } catch (localError) {
      logger.error('队列', `本地暂存写入失败: ${file.file_name}`, localError);
      dao.updateFile(fileId, {
        status: 'convert_failed',
        error_msg: '本地存储失败: ' + (localError.message || '未知错误')
      });
      return;
    }

    // 步骤3：更新数据库
    dao.updateFile(fileId, {
      md_content: mdContent,
      mineru_output_dir: mineruMetadata.outputDir || null,
      status: 'uploaded',
      local_path: stagingRel,
      nas_path: null,
      error_msg: null
    });

    logger.info('队列', `文件处理完成: ${file.file_name}`, {
      fileId,
      localPath: stagingRel,
      hasMd: mdContent != null,
      mdLength: mdContent ? mdContent.length : 0
    });

    // 清理临时文件
    try { fs.unlinkSync(tempPath); } catch (e) {
      logger.warn('队列', `清理临时文件失败: ${tempPath}`, e);
    }
  }

  /**
   * 获取队列状态
   * @returns {{ queueLength: number, processing: boolean, active: number, concurrency: number }}
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.active > 0,
      active: this.active,
      concurrency: this.concurrency
    };
  }
}

// 单例
module.exports = new TaskQueue();
