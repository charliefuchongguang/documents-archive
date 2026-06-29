# 技术架构文档

> 项目：公路招标代理项目档案归档管理工具
> 开发工具：Qoder
> 状态：✅ 已确认

---

## 一、技术栈

| 层级 | 技术选择 | 选择理由 |
|------|----------|----------|
| 页面框架 | Vue 3 (CDN 全局构建版) | 支持组件化、响应式、条件渲染，适合多页面状态管理；无需 npm 构建，直接 CDN 引入即可运行 |
| UI 组件库 | Element Plus (CDN) | 提供表单、表格、上传、弹窗、折叠面板等丰富组件，30个字段的表单无需手写；与企业微信风格协调 |
| 数据存储 | IndexedDB (Dexie.js) | 容量无限制，支持结构化查询，适合存储项目数据 + Markdown 文件内容 |
| 文件导出 | SheetJS (xlsx) | 企业微信 API 不可用时，降级导出 Excel 文件 |
| 日期处理 | dayjs | 体积小，格式化/解析日期字段（公告时间、委托时间等） |
| 图标 | Lucide Icons | 轻量、清晰，与企业微信风格一致 |
| 路由 | 原生 Hash 路由 | 纯前端无刷新切换页面（#/home、#/project/:id、#/review/:id） |

---

## 二、项目结构

```
archive-helper/
├── index.html              # 主入口：引入所有 CDN、挂载 Vue 应用
├── css/
│   └── style.css           # 自定义样式（覆盖 Element Plus 默认值、企业微信适配）
├── js/
│   ├── app.js              # Vue 应用入口：创建 Vue 实例、定义路由、全局状态
│   ├── db.js               # Dexie.js 封装：IndexedDB 数据库定义、CRUD 操作
│   ├── api.js              # DeepSeek API 封装：统一调用、错误处理、重试机制
│   ├── extract.js          # 信息提取逻辑：6类文档的 Prompt 模板、结果解析、字段合并
│   ├── wechat.js           # 企业微信 API 封装：智能表格写入（或降级导出 Excel）
│   └── utils.js            # 工具函数：日期格式化、金额解析、冲突检测、枚举值校验
└── PRDS/                   # 产品文档（需求、PRD、UI、tech）
    ├── requirements.md
    ├── PRD.md
    ├── UI.md
    ├── tech.md
    └── 字段映射表.md
```

---

## 三、数据结构

### IndexedDB 数据库设计

```javascript
// 数据库名: archiveDB，版本: 1
const db = new Dexie('archiveDB');

db.version(1).stores({
  // 项目表
  projects: `
    projectId,
    projectName,
    status,           // 'draft' | 'ready' | 'submitted'
    createdAt,
    updatedAt,
    syncedAt
  `,
  
  // 文件表（每个项目6类文档，每类一行）
  files: `
    ++id,
    projectId,
    docType,          // 'tender_doc' | 'bid_notice' | 'win_notice' | 'win_public' | 'evaluation' | 'contract'
    filename,
    content,          // Markdown 原文
    extracted,        // AI 提取结果 JSON
    status,           // 'pending' | 'extracting' | 'done' | 'error'
    errorMsg
  `,
  
  // 合并数据表（每个项目一行，30个字段的最终数据）
  mergedData: `
    projectId,
    projectNo, projectType, province, industry, projectName,
    tenderType, tenderMethod, announceDate, announceMedia,
    orgMode, buildType, mileage, roadLevel,
    projectOverview, totalInvestment,
    contractName, entrustDate, projectManager, techManager, otherMembers,
    publicDate, entrustAmount, winUnit, winAmount,
    winNoticeDate, sealUnit, evalDate,
    tenderUnit, contactInfo
  `
});
```

### 单文件提取 Prompt 模板（以招标文件为例）

```javascript
const TENDER_DOC_PROMPT = `你是一个专业的招标信息提取助手。请从以下招标文件 Markdown 内容中提取指定字段，并以严格的 JSON 格式返回。

需要提取的字段：
- projectNo: 项目编号（招标文件编号）
- projectType: 项目类型，从 ["招投标", "政府采购", "招投标+政府采购"] 中选择
- province: 项目所在省份（不要带"省"字）
- industry: 行业，从 ["公路","水运","航空","铁路","市政","建筑房地产","电力","化工医药","机械电子","能源工业","冶金矿产","农林水利","轻纺食品","环保","旅游","其它"] 中选择
- projectName: 招标项目名称
- tenderType: 招标类型/内容，从 ["规划编制","项目业主","项目管理","可研","勘察","设计","勘察设计","设计施工总承包","设备材料","施工","施工监理","试验检测","保险","其他"] 中选择
- tenderMethod: 招标/采购方式，从 ["邀请招标","公开招标","竞争性谈判","竞争性磋商","询价","单一来源采购","比选"] 中选择
- buildType: 招标项目建设类型，从 ["新建","改扩建","养护/大中修"] 中选择，可多选
- mileage: 里程（如 "160km"，含起讫桩号）
- roadLevel: 道路等级，从 ["高速公路","一级路","二级路"] 中选择
- projectOverview: 项目概况（长文本，保留原始内容）
- totalInvestment: 项目总投资（万元），返回纯数字
- tenderUnit: 招标人名称
- contactInfo: 联系人及电话

规则：
1. 如果某个字段在文档中未找到，返回 null
2. 日期统一返回 YYYY-MM-DD 格式
3. 金额统一返回数字（万元）
4. 枚举字段必须严格从给定选项中选择，不要自创

请只返回 JSON，不要任何解释文字。格式：
{"projectNo":"...","projectType":"...","province":"...",...}

文档内容：
{{documentContent}}`;
```

---

## 四、关键实现说明

### 1. 信息提取流程

```
用户上传 .md 文件
  → 读取文件内容（FileReader → 文本）
  → 存入 IndexedDB（files 表）
  → 用户点击「提取」
  → 从 db 读取文件内容
  → 组装 Prompt（文档类型 → 对应 Prompt 模板）
  → 调用 DeepSeek API（api.js）
  → 解析返回的 JSON
  → 存入 files.extracted 字段
  → 触发字段合并（extract.js）
  → 更新 mergedData 表
  → UI 显示提取结果
```

### 2. 字段合并策略

```
每次单文件提取完成后：
  1. 读取该项目的所有已提取结果
  2. 按字段优先级合并（招标文件 > 中标通知书 > 代理合同 > 其他）
  3. 检测冲突：同一字段在不同来源值不一致时
     → 在 mergedData 中标记 conflict: true
     → UI 显示冲突提示，用户手动选择
  4. 未提取到的字段标记为 null
  5. 保存合并结果到 mergedData 表
```

### 3. 企业微信智能表格同步

**方案 A（首选）：企业微信 API 直接写入**
```javascript
// 调用企业微信文档 API（需管理员开通权限）
// 参考：https://developer.work.weixin.qq.com/document/path/...
async function syncToWechatTable(projectData) {
  // 1. 获取智能表格的 sheet_id 和表格范围
  // 2. 将 projectData 的30个字段映射为表格行数据
  // 3. 调用 wework API 追加一行
}
```

**方案 B（降级）：导出 Excel 手动导入**
```javascript
// 使用 SheetJS 生成 Excel 文件
function exportToExcel(projectData) {
  const ws = XLSX.utils.json_to_sheet([projectData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "项目档案");
  XLSX.writeFile(wb, `项目档案_${projectData.projectNo}.xlsx`);
}
```

> ⚠️ 开发时先实现方案 B 作为保底，方案 A 在有企业微信 API 权限后追加。

---

## 五、开发注意事项

- 所有依赖通过 CDN 引入，不使用 npm / Node.js
- 数据存储使用 IndexedDB（Dexie.js），key 命名以 `archive-helper-` 为前缀
- 不引入任何后端服务，纯前端实现
- 使用 Element Plus 的现有组件，不手写同类组件（如表单、弹窗、上传）
- 企业微信自建应用运行在移动端 WebView 和 PC 端 CEF 中，需确保 Vue 3 兼容
- 文件上传使用原生 `<input type="file" accept=".md">`，通过 FileReader 读取文本内容
- DeepSeek API Key 严禁硬编码，必须通过设置弹窗存入 localStorage

---

## 六、AI API 集成说明

### API Key 管理（强制要求）

- **严禁硬编码 API Key**：代码中不允许出现任何明文 Key
- **使用 localStorage 存取 Key**：
  ```javascript
  const API_KEY_STORAGE = 'archive-helper-deepseek-key';
  const API_BASE_STORAGE = 'archive-helper-deepseek-base';
  
  // 读取
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  const baseUrl = localStorage.getItem(API_BASE_STORAGE) || 'https://api.deepseek.com';
  
  // 保存
  localStorage.setItem(API_KEY_STORAGE, userInputKey);
  localStorage.setItem(API_BASE_STORAGE, userInputBase);
  
  // 清除
  localStorage.removeItem(API_KEY_STORAGE);
  ```
- **必须实现设置弹窗**：用于用户输入、查看、清除 API Key（参见 UI.md 中的设置弹窗设计）
- **启动检测**：页面加载时检查 Key 是否存在，不存在则自动弹出设置弹窗并提示用户

### API 调用封装

```javascript
// js/api.js
async function callDeepSeek(prompt, model = 'deepseek-chat') {
  const apiKey = localStorage.getItem('archive-helper-deepseek-key');
  const baseUrl = localStorage.getItem('archive-helper-deepseek-base') || 'https://api.deepseek.com';
  
  if (!apiKey) {
    showSettings(); // 弹出设置弹窗
    throw new Error('请先配置 DeepSeek API Key');
  }
  
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3 // 降低随机性，提高提取稳定性
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    // 友好错误提示
    if (error.message.includes('401')) throw new Error('API Key 无效，请检查设置');
    if (error.message.includes('timeout')) throw new Error('请求超时，请检查网络后重试');
    throw error;
  }
}
```

### CORS 注意事项

| AI 服务 | 前端直接调用 | 备注 |
|---------|-------------|------|
| DeepSeek | ✅ 支持 | 推荐，国内可直调，价格便宜 |

---

## 七、CDN 引入清单

所有库通过 CDN 引入，使用 jsDelivr 或 unpkg：

```html
<!-- Vue 3 -->
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>

<!-- Element Plus -->
<link rel="stylesheet" href="https://unpkg.com/element-plus/dist/index.css" />
<script src="https://unpkg.com/element-plus"></script>

<!-- Dexie.js (IndexedDB) -->
<script src="https://unpkg.com/dexie/dist/dexie.js"></script>

<!-- SheetJS (Excel 导出) -->
<script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>

<!-- dayjs -->
<script src="https://unpkg.com/dayjs/dayjs.min.js"></script>

<!-- Lucide Icons -->
<script src="https://unpkg.com/lucide@latest"></script>
```
