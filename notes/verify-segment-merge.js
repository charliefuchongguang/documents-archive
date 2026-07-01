/**
 * 多标段数据合并验证脚本
 * 
 * 用法：node notes/verify-segment-merge.js
 * 
 * 验证 submitController.submitProject() 按 segment_no 分组收集 extracted_data 的逻辑
 * 不启动 HTTP 服务器，直接调用 controller 方法 + mock req/res
 */
const path = require('path');
const fs = require('fs');

// 切换到 server 目录以便 require 模块
const serverDir = path.join(__dirname, '..', 'src', 'server');
process.chdir(serverDir);

const dao = require(path.join(serverDir, 'database', 'dao'));
const archiveDao = require(path.join(serverDir, 'database', 'archiveDao'));
const { submitProject } = require(path.join(serverDir, 'controllers', 'submitController'));

// 加载测试数据
const testData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-data', 'multi-segment-project.json'), 'utf-8')
);

const PROJECT_ID = testData.project.id;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function cleanup() {
  console.log('\n========== 清理测试数据 ==========');
  try {
    // 删除归档记录
    const db = dao.getDb();
    db.prepare('DELETE FROM archives WHERE project_id = ?').run(PROJECT_ID);
    // 删除项目（级联删除 files、merged_data）
    dao.deleteProject(PROJECT_ID);
    console.log('  测试数据已清理');
  } catch (e) {
    console.warn('  清理时出错（可忽略）:', e.message);
  }
}

async function run() {
  console.log('========== 多标段数据合并验证 ==========\n');

  // 清理可能残留的旧测试数据
  cleanup();

  // ========== 1. 创建测试项目 ==========
  console.log('1. 创建测试项目...');
  dao.createProject({
    id: PROJECT_ID,
    name: testData.project.name,
    createdBy: 'test-user',
    createdByName: '测试用户'
  });
  dao.updateProjectSegments(PROJECT_ID, testData.project.segments);
  dao.updateProjectProcurementType(PROJECT_ID, testData.project.procurement_type);
  console.log(`  项目已创建: ${PROJECT_ID}`);

  // ========== 2. 创建测试文件 ==========
  console.log('\n2. 创建测试文件（含 extracted_data 和 segment_no）...');
  for (const file of testData.files) {
    dao.createFile({
      id: file.id,
      projectId: file.projectId,
      docType: file.docType,
      fileName: file.fileName,
      segmentNo: file.segmentNo
    });
    // 更新 extracted_data
    dao.updateFile(file.id, {
      extractedData: file.extracted_data,
      status: 'done'
    });
    console.log(`  文件 ${file.id}: segment_no=${file.segmentNo}, 字段数=${Object.keys(file.extracted_data).length}`);
  }

  // ========== 3. 模拟 submitProject 调用 ==========
  console.log('\n3. 调用 submitProject（模拟前端提交，不传 segmentFormData）...');
  
  let responseStatus = null;
  let responseBody = null;

  const mockReq = {
    params: { id: PROJECT_ID },
    body: {},  // 不传 segmentFormData，测试 fallback 逻辑
    user: { userid: 'test-user', name: '测试用户' }
  };

  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    }
  };

  await submitProject(mockReq, mockRes);

  console.log(`  响应状态: ${responseStatus}`);
  assert(responseStatus === 201, 'HTTP 状态码应为 201');
  assert(responseBody && responseBody.success === true, '响应 success 应为 true');

  // ========== 4. 检查归档表数据 ==========
  console.log('\n4. 检查归档表中各标段的 form_data...');
  
  const db = dao.getDb();
  const archives = db.prepare(
    'SELECT * FROM archives WHERE project_id = ? ORDER BY segment_no'
  ).all(PROJECT_ID);

  console.log(`  归档记录数: ${archives.length}`);
  assert(archives.length === 2, '应有 2 条归档记录（2个标段）');

  // 解析 form_data
  const seg1Archive = archives.find(a => a.segment_no === 1);
  const seg2Archive = archives.find(a => a.segment_no === 2);

  assert(seg1Archive !== undefined, '标段1 的归档记录存在');
  assert(seg2Archive !== undefined, '标段2 的归档记录存在');

  if (!seg1Archive || !seg2Archive) {
    console.error('\n  归档记录不完整，终止验证');
    cleanup();
    console.log(`\n========== 结果: ${passed} 通过, ${failed} 失败 ==========`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const seg1Data = typeof seg1Archive.form_data === 'string'
    ? JSON.parse(seg1Archive.form_data) : seg1Archive.form_data;
  const seg2Data = typeof seg2Archive.form_data === 'string'
    ? JSON.parse(seg2Archive.form_data) : seg2Archive.form_data;

  // ========== 5. 验证标段1独有字段 ==========
  console.log('\n5. 验证标段1 独有字段...');
  for (const [key, expectedVal] of Object.entries(testData.expected.segment1Only)) {
    assert(seg1Data[key] === expectedVal,
      `标段1.${key} = "${seg1Data[key]}" (期望 "${expectedVal}")`);
  }

  // ========== 6. 验证标段2独有字段 ==========
  console.log('\n6. 验证标段2 独有字段...');
  for (const [key, expectedVal] of Object.entries(testData.expected.segment2Only)) {
    assert(seg2Data[key] === expectedVal,
      `标段2.${key} = "${seg2Data[key]}" (期望 "${expectedVal}")`);
  }

  // ========== 7. 验证全局字段存在于两个标段 ==========
  console.log('\n7. 验证全局字段（segment_no=0）存在于两个标段...');
  const seg0Data = testData.files.find(f => f.segmentNo === 0).extracted_data;
  for (const key of testData.expected.globalFields) {
    assert(seg1Data[key] === seg0Data[key],
      `标段1 包含全局字段 ${key} = "${seg1Data[key]}"`);
    assert(seg2Data[key] === seg0Data[key],
      `标段2 包含全局字段 ${key} = "${seg2Data[key]}"`);
  }

  // ========== 8. 验证共享字段在两个标段都有值 ==========
  console.log('\n8. 验证共享字段在两个标段都有值...');
  for (const key of testData.expected.sharedFields) {
    assert(seg1Data[key] !== undefined, `标段1 包含共享字段 ${key}`);
    assert(seg2Data[key] !== undefined, `标段2 包含共享字段 ${key}`);
  }

  // ========== 9. 关键验证：标段间字段不互相覆盖 ==========
  console.log('\n9. 关键验证：标段间字段值互不相同（无覆盖）...');
  assert(seg1Data.winCandidate !== seg2Data.winCandidate,
    `winCandidate 不同: 标段1="${seg1Data.winCandidate}" vs 标段2="${seg2Data.winCandidate}"`);
  assert(seg1Data.winAmount !== seg2Data.winAmount,
    `winAmount 不同: 标段1="${seg1Data.winAmount}" vs 标段2="${seg2Data.winAmount}"`);
  assert(seg1Data.pmName !== seg2Data.pmName,
    `pmName 不同: 标段1="${seg1Data.pmName}" vs 标段2="${seg2Data.pmName}"`);
  assert(seg1Data.winOrg !== seg2Data.winOrg,
    `winOrg 不同: 标段1="${seg1Data.winOrg}" vs 标段2="${seg2Data.winOrg}"`);

  // ========== 10. 验证 projectNo 存在于两个标段 ==========
  console.log('\n10. 验证 projectNo...');
  assert(seg1Data.projectNo && seg1Data.projectNo.length > 0,
    `标段1 projectNo = "${seg1Data.projectNo}"`);
  assert(seg2Data.projectNo && seg2Data.projectNo.length > 0,
    `标段2 projectNo = "${seg2Data.projectNo}"`);
  assert(seg1Data.projectNo === seg2Data.projectNo,
    `两个标段 projectNo 一致: "${seg1Data.projectNo}"`);

  // ========== 清理 ==========
  cleanup();

  // ========== 总结 ==========
  console.log(`\n========== 验证结果 ==========`);
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  总计: ${passed + failed}`);
  console.log(`  结论: ${failed === 0 ? '✓ 全部通过' : '✗ 存在失败项'}`);
  console.log(`==============================`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('验证脚本执行出错:', err);
  cleanup();
  process.exit(1);
});
