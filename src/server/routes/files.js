/**
 * 文件路由 - /api/files/*
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const fileTypes = require('../utils/fileTypes');

/**
 * 修复上传文件名编码：
 * busboy 将文件名按 latin-1 解析，中文会乱码（UTF-8 字节被逐字符 latin-1 化）。
 * 这里将 latin-1 字符串按字节重新解回 UTF-8，得到正确的中文名。
 */
function fixFilename(name) {
  if (!name) return name;
  try {
    const iconv = require('iconv-lite');
    // 先把 latin-1 字符串还原成字节 Buffer，再按 UTF-8 解码
    const buf = iconv.encode(name, 'latin1');
    const decoded = iconv.decode(buf, 'utf-8');
    // 若解码后出现 U+FFFD（替换字符），说明原串并非 UTF-8，保留原名
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

// 配置 multer - 使用内存存储（req.file.buffer 可用）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB 上限
  fileFilter: (req, file, cb) => {
    // 修正中文文件名编码
    file.originalname = fixFilename(file.originalname);

    // 以扩展名为准（Office/压缩包 MIME 常为 octet-stream）
    if (fileTypes.isAllowed(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型，允许：${fileTypes.ALLOWED_EXTS.join(', ')}`), false);
    }
  }
});

// 上传文件（异步队列处理）
router.post('/upload', upload.single('file'), fileController.upload);

// 批量上传文件（同一 projectId + docType + segmentNo）
router.post('/upload-batch', upload.array('files', 10), fileController.batchUpload);

// 按文件内容 AI 识别文档类型（从文件夹导入兜底，不落库）
router.post('/classify', upload.single('file'), fileController.classify);

// 获取项目文件状态（含队列状态）
router.get('/status/:projectId', fileController.getStatus);

// 查看文件（浏览器内联打开，从 NAS 读取）
router.get('/:id/view', fileController.view);

// 重试转换失败的文件
router.post('/:id/retry', fileController.retry);

// 更新文件信息（提取结果、状态等）
router.put('/:id/paper-review', fileController.updatePaperReview);

// 更新文件信息（提取结果、状态等）
router.put('/:id', fileController.update);

// 更新文件标段号
router.put('/:id/segment-no', fileController.updateSegmentNo);

// 删除文件
router.delete('/:id', fileController.delete);

module.exports = router;
