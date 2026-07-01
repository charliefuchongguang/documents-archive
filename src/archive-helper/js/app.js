/**
 * app.js - Vue 应用主入口
 * 负责应用初始化、路由管理、全局状态及页面组件注册
 */

// CDN 版本 Element Plus 全局组件引用
const ElMessage = ElementPlus.ElMessage;
const ElMessageBox = ElementPlus.ElMessageBox;

// ============================================
// 路由系统
// ============================================

/**
 * 解析当前 hash 路由
 * 支持的路由格式：
 *   #/home          → { name: 'home', params: {} }
 *   #/project/:id   → { name: 'project', params: { id } }
 *   #/review/:id    → { name: 'review', params: { id } }
 *   #/admin-archives → { name: 'admin-archives', params: {} }
 * @returns {{path: string, name: string, params: Object}}
 */
function parseRoute() {
  const hash = window.location.hash || '#/home';
  const path = hash.replace(/^#/, '') || '/';

  // 匹配 /project/:id
  const projectMatch = path.match(/^\/project\/([^/]+)$/);
  if (projectMatch) {
    return { path, name: 'project', params: { id: projectMatch[1] } };
  }

  // 匹配 /review/:id
  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch) {
    return { path, name: 'review', params: { id: reviewMatch[1] } };
  }

  // 匹配 /admin-archives
  if (path === '/admin-archives') {
    return { path, name: 'admin-archives', params: {} };
  }

  // 默认首页
  return { path, name: 'home', params: {} };
}

/**
 * 路由导航函数
 * @param {string} path - 目标路径（如 '/home'、'/project/123'）
 */
function navigateTo(path) {
  window.location.hash = path;
}

// 将导航函数挂载到全局，供其他文件使用
window.navigateTo = navigateTo;

// ============================================
// Vue 应用创建
// ============================================

const app = Vue.createApp({
  data() {
    return {
      currentRoute: parseRoute(),
      showSettings: false,  // 设置弹窗开关
      showLogin: !Http.isLoggedIn(),  // 是否显示登录页
      currentUser: null,    // 当前登录用户
    };
  },
  computed: {
    /**
     * 当前页面名称，用于条件渲染对应页面组件
     * @returns {'home' | 'project' | 'review' | 'admin-archives'}
     */
    currentPage() {
      return this.currentRoute.name;
    }
  },
  methods: {
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 打开设置弹窗
     */
    openSettings() {
      this.showSettings = true;
    },
    /**
     * 关闭设置弹窗
     */
    closeSettings() {
      this.showSettings = false;
    },
    /**
     * 登录成功回调
     * @param {Object} user - 用户信息
     */
    onLoginSuccess(user) {
      this.currentUser = user;
      this.showLogin = false;
    },
    /**
     * 退出登录
     */
    logout() {
      Http.clearToken();
      this.currentUser = null;
      this.showLogin = true;
    }
  },
  async mounted() {
    // 监听 hash 变化，实时更新当前路由
    window.addEventListener('hashchange', () => {
      this.currentRoute = parseRoute();
    });

    // 将应用实例挂载到全局，供 Http 模块访问
    window.app = this;

    // 检查登录态
    if (Http.isLoggedIn()) {
      // 加载当前用户信息
      try {
        this.currentUser = await API.getUserInfo();
        this.showLogin = false;
      } catch (error) {
        console.warn('[App] 获取用户信息失败:', error.message);
        this.showLogin = true;
      }
    }
  },
  // 根模板：根据状态显示登录页或主应用
  template: `
    <div class="app-container">
      <!-- 登录页 -->
      <login-page
        v-if="showLogin"
        @login-success="onLoginSuccess"
      />

      <!-- 主应用 -->
      <template v-else>
        <home-page
          v-if="currentPage === 'home'"
          @open-settings="openSettings"
        />
        <project-page
          v-else-if="currentPage === 'project'"
          :project-id="currentRoute.params.id"
          @open-settings="openSettings"
        />
        <review-page
          v-else-if="currentPage === 'review'"
          :project-id="currentRoute.params.id"
          @open-settings="openSettings"
        />
        <admin-archive-page
          v-else-if="currentPage === 'admin-archives'"
          @open-settings="openSettings"
        />

        <settings-dialog v-model:visible="showSettings" :user="currentUser" @logout="logout" />
      </template>
    </div>
  `
});

// ============================================
// 登录页组件（LoginPage）
// ============================================

/**
 * 登录页组件 - 账号密码登录
 */
app.component('login-page', {
  emits: ['login-success'],
  data() {
    return {
      form: { username: '', password: '' },
      loading: false
    };
  },
  methods: {
    async handleLogin() {
      if (!this.form.username || !this.form.password) {
        ElMessage.warning('请输入用户名和密码');
        return;
      }
      this.loading = true;
      try {
        const user = await API.login(this.form.username, this.form.password);
        ElMessage.success(`欢迎，${user.name}！`);
        this.$emit('login-success', user);
      } catch (error) {
        ElMessage.error(error.message || '登录失败');
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
    <div class="login-container">
      <div class="login-card">
        <h2 style="text-align: center; margin-bottom: 24px;">项目档案归档管理系统</h2>
        <el-form :model="form" @submit.prevent="handleLogin" label-width="0">
          <el-form-item>
            <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" placeholder="密码" type="password" prefix-icon="Lock" size="large" show-password @keyup.enter="handleLogin" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleLogin" :loading="loading" size="large" style="width: 100%;">
              登 录
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  `
});

// ============================================
// 设置弹窗组件（SettingsDialog）
// ============================================

app.component('settings-dialog', {
  props: {
    visible: Boolean,
    user: Object
  },
  emits: ['update:visible', 'logout'],
  data() {
    return {
      testing: false,       // 测试中状态
      testResult: null,     // 测试结果 { success, message }
      changingPassword: false, // 修改密码中状态
      passwordForm: {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      showPasswordForm: false  // 是否显示修改密码表单
    };
  },
  methods: {
    /**
     * 弹窗打开时重置测试结果
     */
    onOpen() {
      this.testResult = null;
      this.showPasswordForm = false;
      this.passwordForm = { oldPassword: '', newPassword: '', confirmPassword: '' };
    },
    /**
     * 测试 DeepSeek 连接（通过后端代理）
     */
    async testConn() {
      this.testing = true;
      this.testResult = null;
      if (window.API && window.API.testConnection) {
        const result = await window.API.testConnection();
        this.testResult = result;
      } else {
        this.testResult = { success: false, message: 'API 测试方法尚未实现' };
      }
      this.testing = false;
    },
    /**
     * 修改密码
     */
    async changePassword() {
      const { oldPassword, newPassword, confirmPassword } = this.passwordForm;
      if (!oldPassword || !newPassword) {
        ElMessage.warning('请输入旧密码和新密码');
        return;
      }
      if (newPassword !== confirmPassword) {
        ElMessage.warning('两次输入的新密码不一致');
        return;
      }
      if (newPassword.length < 6) {
        ElMessage.warning('新密码长度不能少于6位');
        return;
      }
      this.changingPassword = true;
      try {
        await API.changePassword(oldPassword, newPassword);
        ElMessage.success('密码修改成功');
        this.showPasswordForm = false;
        this.passwordForm = { oldPassword: '', newPassword: '', confirmPassword: '' };
      } catch (error) {
        ElMessage.error(error.message || '密码修改失败');
      } finally {
        this.changingPassword = false;
      }
    },
    /**
     * 退出登录
     */
    async logout() {
      try {
        await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
          confirmButtonText: '退出',
          cancelButtonText: '取消',
          type: 'warning'
        });
        this.$emit('logout');
        this.$emit('update:visible', false);
      } catch {
        // 用户取消
      }
    }
  },
  template: `
    <el-dialog
      :model-value="visible"
      @update:model-value="$emit('update:visible', $event)"
      @open="onOpen"
      title="设置"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <!-- 当前登录用户 -->
        <el-form-item label="当前用户">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-input :value="user ? user.name : '未登录'" disabled style="flex: 1;" />
            <el-tag v-if="user && user.role === 'admin'" type="danger" size="small">管理员</el-tag>
            <el-tag v-else-if="user" size="small">普通用户</el-tag>
          </div>
        </el-form-item>

        <!-- 修改密码 -->
        <el-form-item label="账号安全">
          <el-button size="small" @click="showPasswordForm = !showPasswordForm">
            {{ showPasswordForm ? '取消修改' : '修改密码' }}
          </el-button>
        </el-form-item>

        <template v-if="showPasswordForm">
          <el-form-item label="旧密码">
            <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入旧密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入新密码（至少6位）" />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" @keyup.enter="changePassword" />
          </el-form-item>
          <el-button type="primary" size="small" @click="changePassword" :loading="changingPassword" style="margin-bottom: 16px;">
            确认修改
          </el-button>
        </template>

        <!-- AI 服务状态 -->
        <el-form-item label="AI 服务">
          <el-input value="DeepSeek（通过后端代理）" disabled />
        </el-form-item>

        <div v-if="testResult" style="margin-bottom: 16px;">
          <el-alert
            :title="testResult.message"
            :type="testResult.success ? 'success' : 'error'"
            show-icon
            :closable="false"
          />
        </div>

        <div style="margin-bottom: 16px; padding: 12px; background: #f5f7fa; border-radius: 4px; font-size: 13px; color: #666;">
          API Key 由后端统一管理，前端无需配置
        </div>
      </el-form>

      <template #footer>
        <el-button @click="testConn" :loading="testing">测试连接</el-button>
        <el-button @click="logout" type="danger" plain>退出登录</el-button>
        <el-button @click="$emit('update:visible', false)">关闭</el-button>
      </template>
    </el-dialog>
  `
});

// ============================================
// 首页组件 - 项目列表页面
// ============================================

/**
 * 首页组件 - 项目列表页面
 * 展示所有项目卡片，支持搜索、新建、删除项目
 */
app.component('home-page', {
  emits: ['open-settings'],
  data() {
    return {
      projects: [],      // 项目列表数据
      searchText: '',    // 搜索关键词
      showCreateDialog: false, // 新建项目弹窗开关
      newProjectName: '', // 新建项目名称
      loading: true      // 加载状态
    };
  },
  computed: {
    /**
     * 根据搜索关键词过滤项目列表
     */
    filteredProjects() {
      if (!this.searchText) return this.projects;
      return this.projects.filter(p =>
        p.projectName.toLowerCase().includes(this.searchText.toLowerCase())
      );
    },
    /**
     * 当前用户是否为管理员
     * @returns {boolean}
     */
    isAdmin() {
      const app = window.app;
      return app && app.currentUser && app.currentUser.role === 'admin';
    }
  },
  async mounted() {
    await this.loadProjects();
  },
  methods: {
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 从后端加载所有项目，按更新时间倒序排列
     */
    async loadProjects() {
      this.loading = true;
      try {
        this.projects = await DB.getProjects();
        this.projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      } catch (error) {
        ElMessage.error('加载项目列表失败: ' + error.message);
      }
      this.loading = false;
    },
    /**
     * 打开新建项目弹窗，默认名称为"未命名项目 + 当天日期"
     */
    openCreateDialog() {
      this.newProjectName = '未命名项目 ' + Utils.formatDate(new Date());
      this.showCreateDialog = true;
    },
    /**
     * 创建新项目并跳转到项目详情页
     */
    async createProject() {
      try {
        const projectId = await DB.createProject(this.newProjectName);
        this.showCreateDialog = false;
        this.navigateTo('#/project/' + projectId);
      } catch (error) {
        ElMessage.error('创建项目失败: ' + error.message);
      }
    },
    /**
     * 删除项目（带二次确认）
     * @param {string} projectId
     */
    async deleteProject(projectId) {
      await ElMessageBox.confirm('确定要删除此项目吗？删除后不可恢复。', '确认删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      });
      try {
        await DB.deleteProject(projectId);
        await this.loadProjects();
        ElMessage.success('项目已删除');
      } catch (error) {
        ElMessage.error('删除项目失败: ' + error.message);
      }
    },
    /**
     * 将日期字符串转换为相对时间描述
     * @param {string} dateStr - ISO 日期字符串
     * @returns {string} 相对时间描述
     */
    getRelativeTime(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return '今天';
      if (diffDays === 1) return '昨天';
      if (diffDays < 30) return diffDays + '天前';
      return Math.floor(diffDays / 30) + '月前';
    }
  },
  template: `
    <div class="page-container">
      <!-- 顶部导航栏 -->
      <header class="top-navbar">
        <div class="navbar-left">
          <span class="app-logo">📁 档案归档助手</span>
        </div>
        <div class="navbar-right">
          <el-button v-if="isAdmin" @click="navigateTo('#/admin-archives')">归档管理</el-button>
          <el-button text @click="$emit('open-settings')">⚙️</el-button>
          <el-button type="primary" @click="openCreateDialog">+ 新建项目</el-button>
        </div>
      </header>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchText"
          placeholder="搜索项目名称..."
          clearable
        />
      </div>

      <!-- 项目卡片网格 -->
      <div class="project-grid" v-loading="loading">
        <div v-if="!loading && filteredProjects.length === 0" class="empty-state">
          <p>还没有项目，点击右上角「+ 新建项目」开始</p>
        </div>
        <div
          v-for="project in filteredProjects"
          :key="project.projectId"
          class="project-card"
          :class="'card-' + project.status"
          @click="navigateTo('#/project/' + project.projectId)"
        >
          <div class="card-header">
            <span class="card-title">{{ project.projectName }}</span>
            <el-button
              text
              size="small"
              @click.stop="deleteProject(project.projectId)"
              class="card-delete"
            >🗑️</el-button>
          </div>
          <div class="card-body">
            <span v-if="project.status === 'draft'" class="card-progress">
              草稿
            </span>
            <span v-else-if="project.status === 'submitted'" class="card-status">
              ✅ 已提交
            </span>
            <span v-else-if="project.status === 'archived'" class="card-status">
              📦 已归档
            </span>
            <span v-else class="card-status card-ready-text">
              可提交
            </span>
          </div>
          <div class="card-footer">
            <span class="card-time">
              更新: {{ getRelativeTime(project.updatedAt) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 新建项目弹窗 -->
      <el-dialog v-model="showCreateDialog" title="新建项目" width="400px">
        <el-form>
          <el-form-item label="项目名称">
            <el-input
              v-model="newProjectName"
              placeholder="输入项目名称"
              @keyup.enter="createProject"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateDialog = false">取消</el-button>
          <el-button type="primary" @click="createProject">创建</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

// ============================================
// 项目详情页组件
// ============================================

/**
 * 项目详情页组件
 * 展示项目文件上传、提取状态及提取结果预览
 */
app.component('project-page', {
  props: ['projectId'],
  emits: ['open-settings'],
  data() {
    return {
      project: null,
      files: {},            // { docType: [fileObj1, fileObj2, ...] } 按文档类型分组的文件数组
      mergedResult: null,
      loading: true,
      editingName: false,
      tempName: '',
      pollingTimer: null,    // 文件状态轮询定时器
      segments: [],           // 标段列表 [{name: ''}]
      showSegmentConfig: false, // 是否展开标段配置
      procurementType: 'F'    // 采购内容类型：F=服务, G=工程, H=货物
    };
  },
  computed: {
    /**
     * 文档类型定义
     */
    docTypes() {
      return Utils.DOC_TYPES;
    },
    /**
     * 已上传文件总数（所有 docType 数组中的文件总数）
     */
    totalFileCount() {
      return Object.values(this.files).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    },
    /**
     * 已成功提取的文件数量
     */
    extractedCount() {
      return Object.values(this.files).reduce((sum, arr) => {
        if (!Array.isArray(arr)) return sum;
        return sum + arr.filter(f => f && (f.status === 'done' || f.status === 'success')).length;
      }, 0);
    },
    /**
     * 是否有多标段
     */
    isMultiSegment() {
      return this.segments.length > 1;
    },
    /**
     * 预览用的前几个有值字段
     */
    previewFields() {
      if (!this.mergedResult) return [];
      const formData = this.mergedResult.formData || this.mergedResult;
      return Utils.FIELDS
        .filter(f => formData[f.key] && formData[f.key].value)
        .slice(0, 8)
        .map(f => ({ label: f.label, value: formData[f.key].value }));
    }
  },
  async mounted() {
    await this.loadProject();
  },
  beforeUnmount() {
    this.stopPolling();
  },
  methods: {
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 加载项目信息、文件列表及合并数据
     */
    async loadProject() {
      this.loading = true;
      try {
        this.project = await DB.getProject(this.projectId);
        await Promise.all([this.loadFiles(), this.loadSegments()]);
        // 从项目信息中加载采购类型
        if (this.project && this.project.procurementType) {
          this.procurementType = this.project.procurementType;
        }
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        // 如果已有提取完成的文件且当前 segments 为空/单个，尝试自动识别标段
        if (this.segments.length <= 1) {
          await this.autoDetectSegments();
        }
        // 如果有 pending/converting 文件，启动轮询
        this._checkAndStartPolling();
      } catch (error) {
        ElMessage.error('加载项目失败: ' + error.message);
      }
      this.loading = false;
    },
    /**
     * 加载项目的所有文件并按 docType 分组为数组
     */
    async loadFiles() {
      const fileList = await DB.getFiles(this.projectId);
      this.files = {};
      fileList.forEach(f => {
        if (!this.files[f.docType]) {
          this.files[f.docType] = [];
        }
        this.files[f.docType].push(f);
      });
    },
    /**
     * 开始编辑项目名称
     */
    startEditName() {
      this.tempName = this.project ? this.project.projectName : '';
      this.editingName = true;
    },
    /**
     * 保存项目名称
     */
    async saveName() {
      const name = this.tempName.trim();
      if (!name) {
        ElMessage.warning('项目名称不能为空');
        return;
      }
      await DB.updateProject(this.projectId, { projectName: name });
      if (this.project) {
        this.project.projectName = name;
      }
      this.editingName = false;
      ElMessage.success('名称已更新');
    },
    /**
     * 处理文件上传（支持多文件选择，PDF → 后端异步队列处理）
     * 上传后立即返回，不等待 MineRU 转换完成
     * @param {string} docType - 文档类型
     * @param {Event} event - 文件选择事件
     */
    async handleFileUpload(docType, event) {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length === 0) return;
      try {
        for (const file of selectedFiles) {
          await DB.uploadFile(this.projectId, docType, file, 0);
        }
        ElMessage.success(`${selectedFiles.length} 个文件已上传，正在排队处理`);
        await this.loadFiles();
        this.startPolling();
      } catch (error) {
        ElMessage.error('文件上传失败: ' + error.message);
      }
      // 重置 input 以允许重复选择同一文件
      event.target.value = '';
    },
    /**
     * 提取单个文件的信息
     * @param {number|string} fileId - 文件ID
     * @param {string} docType - 文档类型
     */
    async extractFile(fileId, docType) {
      // 从文件列表中查找该文件
      const allFiles = Object.values(this.files).flat();
      const file = allFiles.find(f => f.id === fileId);
      if (!file) return;
      await DB.updateFileStatus(fileId, 'extracting');
      await this.loadFiles();
      try {
        const result = await Extract.extractFromDocument(docType, file.content);
        await DB.updateFileExtracted(fileId, result);
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        await this.loadFiles();
        ElMessage.success('提取完成');
        // 按文档类型控制标段检测时机：
        // tender_doc 提取完成后重新检测标段（权威来源）
        // win_notice/win_public 提取完成后只做分配标段号
        if (docType === 'tender_doc') {
          await this.autoDetectSegments();
        } else if (docType === 'win_notice' || docType === 'win_public') {
          if (this.segments.length > 1) {
            await this.autoAssignFileSegments();
          } else {
            await this.autoDetectSegments();
          }
        } else {
          await this.autoDetectSegments();
        }
      } catch (error) {
        await DB.updateFileStatus(fileId, 'error', error.message);
        await this.loadFiles();
        ElMessage.error('提取失败: ' + error.message);
      }
    },
    /**
     * 启动文件状态轮询
     */
    startPolling() {
      this.stopPolling();
      this.pollingTimer = setInterval(() => this.checkFileStatus(), 5000);
    },
    /**
     * 停止文件状态轮询
     */
    stopPolling() {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    },
    /**
     * 检查文件状态（轮询回调）
     */
    async checkFileStatus() {
      if (!this.project) return;
      try {
        const result = await DB.getFileStatus(this.projectId);
        // 按 docType 分组为数组
        this.files = {};
        (result.files || []).forEach(f => {
          if (!this.files[f.docType]) {
            this.files[f.docType] = [];
          }
          this.files[f.docType].push(f);
        });
        // 如果没有 pending/converting 的文件，停止轮询
        const processing = (result.files || []).filter(f => f.status === 'pending' || f.status === 'converting');
        if (processing.length === 0) {
          this.stopPolling();
          // 状态变更后刷新合并数据
          this.mergedResult = await Extract.mergeExtractedData(this.projectId);
          // 检查是否有新完成提取的 tender_doc（优先确定标段）
          const newTenderDoc = (result.files || []).filter(
            f => f.docType === 'tender_doc' && (f.status === 'done' || f.status === 'success')
          );
          if (newTenderDoc.length > 0) {
            await this.autoDetectSegments();
          } else if (this.segments.length > 1) {
            // 已有标段配置，只做分配
            await this.autoAssignFileSegments();
          } else {
            await this.autoDetectSegments();
          }
        }
      } catch (error) {
        console.error('[轮询] 检查文件状态失败:', error.message);
      }
    },
    /**
     * 检查是否有正在处理的文件，有则启动轮询
     */
    _checkAndStartPolling() {
      const processing = Object.values(this.files).flat().filter(
        f => f && (f.status === 'pending' || f.status === 'converting')
      );
      if (processing.length > 0) {
        this.startPolling();
      }
    },
    /**
     * 重试转换失败的文件
     * @param {number|string} fileId - 文件ID
     */
    async retryConvert(fileId) {
      try {
        await DB.retryFile(fileId);
        ElMessage.success('已重新加入处理队列');
        await this.loadFiles();
        this.startPolling();
      } catch (error) {
        ElMessage.error('重试失败: ' + error.message);
      }
    },
    /**
     * 重新上传：删除当前文件并清除提取结果
     * @param {number|string} fileId - 文件ID
     */
    async reupload(fileId) {
      await ElMessageBox.confirm('确定要重新上传吗？当前文件和提取结果将被清除。', '确认重新上传', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      });
      if (fileId) {
        await DB.deleteFile(fileId);
      }
      await this.loadFiles();
      this.mergedResult = await Extract.mergeExtractedData(this.projectId);
    },
    /**
     * 计算某文件已识别的字段数量
     * @param {number|string} fileId - 文件ID
     * @returns {number}
     */
    extractedFieldCount(fileId) {
      const allFiles = Object.values(this.files).flat();
      const file = allFiles.find(f => f.id === fileId);
      if (!file || !file.extracted) return 0;
      return Object.values(file.extracted).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
    },

    // ==================== 标段管理 ====================

    /**
     * 加载标段配置
     */
    async loadSegments() {
      try {
        const res = await Http.get(`/projects/${this.projectId}/segments`);
        this.segments = res.segments || [];
        this.showSegmentConfig = this.segments.length > 1;
      } catch {
        this.segments = [];
      }
    },

    /**
     * 保存标段配置
     */
    async saveSegments() {
      try {
        await Http.put(`/projects/${this.projectId}/segments`, { segments: this.segments });
        ElMessage.success('标段配置已保存');
      } catch (error) {
        ElMessage.error('保存标段失败: ' + error.message);
      }
    },

    /**
     * 添加标段
     */
    addSegment() {
      this.segments.push({ name: '' });
    },

    /**
     * 删除标段
     * @param {number} index - 标段索引
     */
    removeSegment(index) {
      this.segments.splice(index, 1);
    },

    /**
     * 保存采购内容类型
     */
    async saveProcurementType() {
      try {
        await Http.put(`/projects/${this.projectId}/procurement-type`, { procurementType: this.procurementType });
        ElMessage.success('采购类型已保存');
      } catch (error) {
        ElMessage.error('保存采购类型失败: ' + error.message);
      }
    },

    /**
     * 自动检测标段：
     * 1. 优先从 tender_doc 的 extracted.segments 获取标段列表（权威来源）
     * 2. 如果 tender_doc 没有 segments 信息，fallback 到从 win_notice/win_public 收集 segmentName
     */
    async autoDetectSegments() {
      // === 策略一：优先从 tender_doc 获取 segments 数组 ===
      const tenderDocFiles = (this.files['tender_doc'] || [])
        .filter(f => f.status === 'done' || f.status === 'success');

      for (const file of tenderDocFiles) {
        if (!file.extracted) continue;
        let data = file.extracted;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { continue; }
        }
        // tender_doc 提取了 segments 数组且包含多个标段
        if (Array.isArray(data.segments) && data.segments.length > 1) {
          const newSegments = data.segments
            .filter(name => name && name.trim())
            .map(name => ({ name: name.trim() }));
          if (newSegments.length > 1) {
            this.segments = newSegments;
            this.showSegmentConfig = true;
            await this.saveSegments();
            ElMessage.success(`已从招标文件识别 ${newSegments.length} 个标段`);
            await this.autoAssignFileSegments();
            return;
          }
        }
      }

      // === 策略二（fallback）：从 win_notice/win_public 收集 segmentName ===
      const winFiles = [
        ...(this.files['win_notice'] || []),
        ...(this.files['win_public'] || [])
      ].filter(f => f.status === 'done' || f.status === 'success');

      const normalize = (name) => {
        if (!name) return '';
        return name.trim().replace(/\s+/g, '');
      };

      const segmentMap = new Map();
      for (const file of winFiles) {
        if (file.extracted) {
          let data = file.extracted;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { continue; }
          }
          if (data.segmentName && data.segmentName.trim()) {
            const original = data.segmentName.trim();
            const normalized = normalize(original);
            if (!segmentMap.has(normalized) || original.length > segmentMap.get(normalized).length) {
              segmentMap.set(normalized, original);
            }
          }
        }
      }

      if (segmentMap.size > 1) {
        const newSegments = Array.from(segmentMap.values()).map(name => ({ name }));
        if (newSegments.length !== this.segments.length) {
          this.segments = newSegments;
          this.showSegmentConfig = true;
          await this.saveSegments();
          ElMessage.success(`已自动识别 ${newSegments.length} 个标段`);
          await this.autoAssignFileSegments();
        }
      }
    },

    /**
     * 自动为中标通知书和中标公示文件分配标段号
     * 使用三级模糊匹配策略：精确匹配 → 包含匹配 → 关键词匹配
     */
    async autoAssignFileSegments() {
      if (this.segments.length <= 1) return;

      const winFiles = [
        ...(this.files['win_notice'] || []),
        ...(this.files['win_public'] || [])
      ].filter(f => f.status === 'done' || f.status === 'success');

      for (const file of winFiles) {
        let data = file.extracted;
        if (!data) continue;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { continue; }
        }
        if (!data.segmentName) continue;

        const segNo = this._fuzzyMatchSegment(data.segmentName);
        if (segNo > 0 && file.segmentNo !== segNo) {
          await DB.updateFileSegmentNo(file.id, segNo);
          file.segmentNo = segNo;
        }
      }
    },

    /**
     * 模糊匹配标段名称，返回匹配的标段号（1-based），未匹配返回 0
     * 匹配策略：
     *   a. 精确匹配（normalize后相同）
     *   b. 包含匹配（一个包含另一个）
     *   c. 关键词匹配（提取数字/序号部分比较）
     * @param {string} name - 待匹配的标段名称
     * @returns {number} 标段号（1-based）或 0
     */
    _fuzzyMatchSegment(name) {
      if (!name || this.segments.length === 0) return 0;

      const normalize = (s) => (s || '').trim().replace(/\s+/g, '');
      const inputNorm = normalize(name);

      // 中文数字 → 阿拉伯数字映射
      const cnNumMap = {
        '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
        '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
        '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
        '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
        '壹': '1', '贰': '2', '叁': '3', '肆': '4', '伍': '5',
        '陆': '6', '柒': '7', '捌': '8', '玖': '9'
      };

      // 提取标段中的序号数字
      const extractNumber = (s) => {
        const norm = normalize(s);
        // 尝试匹配中文数字（如"第一"、"第壹"）
        const cnMatch = norm.match(/第([一二三四五六七八九十①②③④⑤⑥⑦⑧⑨⑩壹贰叁肆伍陆柒捌玖])/);
        if (cnMatch) {
          return cnNumMap[cnMatch[1]] || cnMatch[1];
        }
        // 尝试匹配阿拉伯数字（如"1标段"、"第1标段"）
        const numMatch = norm.match(/(\d+)/);
        if (numMatch) return numMatch[1];
        // 尝试匹配字母（如"A标段"）
        const letterMatch = norm.match(/([A-Za-z])/);
        if (letterMatch) return letterMatch[1].toUpperCase();
        return norm; // 无法提取序号，返回整体归一化结果
      };

      const inputNum = extractNumber(name);

      for (let i = 0; i < this.segments.length; i++) {
        const segNorm = normalize(this.segments[i].name);

        // a. 精确匹配
        if (inputNorm === segNorm) return i + 1;

        // b. 包含匹配
        if (inputNorm.includes(segNorm) || segNorm.includes(inputNorm)) return i + 1;

        // c. 关键词匹配（序号数字比较）
        const segNum = extractNumber(this.segments[i].name);
        if (inputNum && segNum && inputNum === segNum) return i + 1;
      }

      return 0; // 未匹配
    }
  },
  template: `
    <div class="page-container" v-loading="loading">
      <!-- 顶部栏 -->
      <header class="top-navbar">
        <div class="navbar-left">
          <el-button text @click="navigateTo('#/home')">← 返回列表</el-button>
          <span v-if="!editingName" class="project-title" @click="startEditName">
            {{ project ? project.projectName : '' }}
          </span>
          <template v-else>
            <el-input v-model="tempName" size="small" style="width:200px" @keyup.enter="saveName" />
            <el-button text size="small" @click="saveName">✓</el-button>
            <el-button text size="small" @click="editingName = false">✗</el-button>
          </template>
        </div>
        <div class="navbar-right">
          <el-button text @click="$emit('open-settings')">⚙️</el-button>
        </div>
      </header>

      <!-- 进度条 -->
      <div class="progress-section">
        <el-progress :percentage="(extractedCount / Math.max(totalFileCount, 1)) * 100" :format="() => extractedCount + '/' + totalFileCount + ' 文件已提取'" />
      </div>

      <!-- 采购类型 + 标段配置区 -->
      <div class="config-section" style="padding: 0 20px; margin-bottom: 12px; display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
        <!-- 采购内容类型 -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: #606266; white-space: nowrap;">采购类型：</span>
          <el-select v-model="procurementType" size="small" style="width: 140px;" @change="saveProcurementType">
            <el-option label="服务(F)" value="F" />
            <el-option label="工程(G)" value="G" />
            <el-option label="货物(H)" value="H" />
          </el-select>
        </div>

        <!-- 标段配置按钮 -->
        <el-button size="small" @click="showSegmentConfig = !showSegmentConfig">
          {{ showSegmentConfig ? '收起标段配置' : '配置多标段' }}
        </el-button>

        <!-- 标段配置展开区 -->
        <div v-if="showSegmentConfig" style="width: 100%; background: #f5f7fa; border-radius: 8px; padding: 12px 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 500;">标段列表（共 {{ segments.length }} 个）</span>
            <el-button size="small" type="primary" plain @click="addSegment">+ 添加标段</el-button>
          </div>
          <div v-for="(seg, idx) in segments" :key="idx" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 13px; color: #909399; min-width: 50px;">标段{{ idx + 1 }}</span>
            <el-input v-model="seg.name" size="small" placeholder="标段名称（如：一标段）" style="flex: 1;" />
            <el-button size="small" text type="danger" @click="removeSegment(idx)" :disabled="segments.length <= 1">删除</el-button>
          </div>
          <el-button size="small" type="primary" @click="saveSegments" style="margin-top: 4px;">保存标段配置</el-button>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="project-content">
        <!-- 左侧文件列表 -->
        <div class="file-list">
          <div v-for="(info, docType) in docTypes" :key="docType" class="file-card">
            <div class="file-card-header">
              <span>{{ info.label }}</span>
              <el-tag v-if="info.required" size="small" type="danger">必填</el-tag>
              <el-tag v-else size="small" type="info">可选</el-tag>
              <el-tag size="small" type="info" style="margin-left: 4px;">{{ (files[docType] || []).length }} 个文件</el-tag>
            </div>

            <div class="file-card-body">
              <!-- 已上传文件列表，用 v-for 遍历 -->
              <div v-for="fileItem in (files[docType] || [])" :key="fileItem.id" class="file-item" style="margin-bottom: 8px; padding: 6px 8px; background: #fafafa; border-radius: 4px;">
                <div class="file-name" style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span>📄 {{ fileItem.filename }}</span>
                  <!-- 多标段时，中标通知书类型显示标段选择 -->
                  <el-select v-if="isMultiSegment && docType === 'win_notice'" v-model="fileItem.segmentNo" size="small" placeholder="选择标段" style="width: 120px; margin-left: auto;">
                    <el-option v-for="(seg, si) in segments" :key="si" :label="seg.name || ('标段'+(si+1))" :value="si" />
                  </el-select>
                </div>

                <!-- 排队中 -->
                <template v-if="fileItem.status === 'pending'">
                  <el-button size="small" loading>排队中...</el-button>
                  <el-button size="small" @click="reupload(fileItem.id)">取消</el-button>
                </template>

                <!-- 转换中（MineRU处理中） -->
                <template v-else-if="fileItem.status === 'converting'">
                  <el-button size="small" loading>转换中...</el-button>
                </template>

                <!-- 转换完成，待提取 -->
                <template v-else-if="fileItem.status === 'uploaded'">
                  <el-button size="small" type="primary" @click="extractFile(fileItem.id, docType)">提取</el-button>
                  <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                </template>

                <!-- MineRU 转换失败 -->
                <template v-else-if="fileItem.status === 'convert_failed'">
                  <div class="extract-error">❌ 转换失败: {{ fileItem.errorMsg || '未知错误' }}</div>
                  <el-button size="small" type="primary" @click="retryConvert(fileItem.id)">重试</el-button>
                  <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                </template>

                <!-- 提取中 -->
                <template v-else-if="fileItem.status === 'extracting'">
                  <el-button size="small" loading>提取中...</el-button>
                </template>

                <!-- 提取完成 -->
                <template v-else-if="fileItem.status === 'done' || fileItem.status === 'success'">
                  <div class="extract-success">✅ 提取完成（已识别 {{ extractedFieldCount(fileItem.id) }} 个字段）</div>
                  <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                  <el-button size="small" @click="extractFile(fileItem.id, docType)">重新提取</el-button>
                </template>

                <!-- 提取失败 -->
                <template v-else-if="fileItem.status === 'error'">
                  <div class="extract-error">❌ {{ fileItem.errorMsg || '提取失败' }}</div>
                  <el-button size="small" type="primary" @click="extractFile(fileItem.id, docType)">重试</el-button>
                  <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                </template>
              </div>

              <!-- 上传按钮（始终可见，允许继续添加文件） -->
              <label class="upload-btn">
                {{ (files[docType] || []).length > 0 ? '继续添加文件' : '选择文件' }}
                <input type="file" accept=".pdf,.md,.markdown" multiple hidden @change="handleFileUpload(docType, $event)" />
              </label>
            </div>
          </div>
        </div>

        <!-- 右侧预览区 -->
        <div class="preview-panel">
          <h3>已提取信息预览</h3>
          <div v-if="previewFields.length > 0" class="preview-list">
            <div v-for="item in previewFields" :key="item.label" class="preview-item">
              <span class="preview-label">{{ item.label }}：</span>
              <span class="preview-value">{{ item.value }}</span>
            </div>
            <el-button type="primary" style="margin-top:16px" @click="navigateTo('#/review/' + projectId)">
              查看完整表单 →
            </el-button>
          </div>
          <div v-else class="preview-empty">
            上传文件并提取后，信息将显示在这里
          </div>
        </div>
      </div>
    </div>
  `
});

// ============================================
// 复核表单页组件（ReviewPage）
// ============================================

/** 标段特有字段：这些字段按标段独立编辑，其余为共享字段 */
const SEGMENT_FIELDS = ['projectName', 'winAmount', 'winUnit', 'winNoticeDate', 'sealUnit', 'publicDate'];

/**
 * 复核表单页组件（ReviewPage）
 * 展示项目提取的字段数据，支持用户复核、编辑、冲突解决、保存草稿及导出Excel
 * 支持多标段项目：标段特有字段按标段独立编辑，共享字段全局编辑
 */
app.component('review-page', {
  props: ['projectId'],
  emits: ['open-settings'],
  data() {
    return {
      loading: true,
      project: null,
      formData: {},         // { fieldKey: value } — 共享字段 + 单标段时的全部字段
      fieldMeta: {},        // { fieldKey: { source, conflict, sources } } — 元数据
      activeGroups: [],     // 展开的折叠面板
      saving: false,
      submitting: false,    // 提交归档中状态
      segments: [],           // 标段列表 [{name: '第一标段'}, ...]
      currentSegment: 0,      // 当前编辑的标段索引（0-based）
      segmentFormData: {},    // { 0: {...formData}, 1: {...formData} } 按标段
      isMultiSegment: false,  // 是否多标段项目
      procurementType: 'F',   // 采购内容类型
    };
  },
  computed: {
    /**
     * 字段分组列表
     */
    fieldGroups() {
      return Utils.FIELD_GROUPS;
    },
    /**
     * 所有字段定义
     */
    allFields() {
      return Utils.FIELDS;
    },
    /**
     * 按 group 分组后的字段
     */
    groupedFields() {
      const groups = {};
      Utils.FIELD_GROUPS.forEach(g => { groups[g.key] = []; });
      Utils.FIELDS.forEach(f => {
        if (groups[f.group]) groups[f.group].push(f);
      });
      return groups;
    },
    /**
     * 当前标段的特有字段数据（多标段时使用）
     */
    currentSegmentData() {
      if (!this.isMultiSegment) return {};
      return this.segmentFormData[this.currentSegment] || {};
    },
    /**
     * 标段特有字段的字段定义列表（多标段时用于渲染各标段卡片）
     */
    segmentFieldDefs() {
      return Utils.FIELDS.filter(f => SEGMENT_FIELDS.includes(f.key));
    }
  },
  async mounted() {
    await this.loadData();
  },
  methods: {
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 加载项目数据并初始化表单
     * 支持单标段和多标段项目
     */
    async loadData() {
      this.loading = true;
      try {
        this.project = await DB.getProject(this.projectId);

        // 加载采购类型
        if (this.project && this.project.procurementType) {
          this.procurementType = this.project.procurementType;
        }

        // 加载标段配置
        await this._loadSegments();

        // 获取合并数据（含冲突信息）
        // 返回格式：{ formData: {key: {value, source, conflict, sources}}, segmentData?: {segNo: {...}} }
        const mergedResult = await Extract.mergeExtractedData(this.projectId);
        const formDataMap = mergedResult.formData || mergedResult; // 兼容旧格式
        const segmentData = mergedResult.segmentData || {};

        // 初始化共享表单数据和元数据
        this.formData = {};
        this.fieldMeta = {};
        Utils.FIELDS.forEach(field => {
          if (formDataMap && formDataMap[field.key]) {
            this.formData[field.key] = formDataMap[field.key].value || '';
            this.fieldMeta[field.key] = {
              source: formDataMap[field.key].source,
              conflict: formDataMap[field.key].conflict || false,
              sources: formDataMap[field.key].sources || []
            };
          } else {
            this.formData[field.key] = '';
            this.fieldMeta[field.key] = { source: null, conflict: false, sources: [] };
          }
        });

        // 多标段初始化
        if (this.isMultiSegment) {
          this.segmentFormData = {};
          this.segments.forEach((seg, idx) => {
            // 每个标段初始化特有字段
            const segData = {};
            SEGMENT_FIELDS.forEach(key => {
              // 优先从 segmentData 中取值（按标段号，idx+1 对应 segmentNo）
              const fromSegment = segmentData[idx + 1] && segmentData[idx + 1][key];
              if (fromSegment !== undefined && fromSegment !== null) {
                segData[key] = fromSegment;
              } else if (SEGMENT_FIELDS.includes(key) && key !== 'projectName') {
                // 非 projectName 的标段字段，尝试从共享 formData 取值
                segData[key] = this.formData[key] || '';
              } else {
                segData[key] = '';
              }
            });
            // projectName 优先从 segmentData 取值（已在上方逻辑中处理）
            // 如果 segmentData 中没有（fallback），则用提取到的全局 projectName + 标段名
            if (!segData.projectName) {
              const baseName = this.formData.projectName || this.project.projectName || '';
              segData.projectName = baseName + (seg.name || '');
            }
            this.segmentFormData[idx] = segData;
          });
        }

        // 默认展开有数据的分组
        this.activeGroups = Utils.FIELD_GROUPS
          .filter(g => Utils.FIELDS.some(f => f.group === g.key && this.formData[f.key]))
          .map(g => g.key);
        if (this.activeGroups.length === 0) {
          this.activeGroups = ['basic']; // 至少展开基本信息
        }
        // 已归档项目显示只读提示
        if (this.project && this.project.status === 'archived') {
          ElementPlus.ElMessage.info('当前项目已归档，数据为只读状态');
        }
      } catch (error) {
        ElMessage.error('加载数据失败: ' + error.message);
      }
      this.loading = false;
    },

    /**
     * 加载标段配置
     * @private
     */
    async _loadSegments() {
      try {
        const res = await Http.get(`/projects/${this.projectId}/segments`);
        this.segments = res.segments || [];
        this.isMultiSegment = this.segments.length > 1;
      } catch {
        this.segments = [];
        this.isMultiSegment = false;
      }
    },

    /**
     * 获取枚举选项
     * @param {string} enumKey
     * @returns {string[]}
     */
    getEnumOptions(enumKey) {
      return Utils.ENUMS[enumKey] || [];
    },

    /**
     * 选择冲突来源的值
     * @param {string} fieldKey
     * @param {string} sourceValue
     */
    resolveConflict(fieldKey, sourceValue) {
      if (this.project && this.project.status === 'archived') {
        ElementPlus.ElMessage.warning('已归档项目无法修改');
        return;
      }
      this.setFieldValue(fieldKey, sourceValue);
      this.fieldMeta[fieldKey].conflict = false;
    },

    /**
     * 保留全部冲突值（带来源标注，用"；"分隔合并）
     * @param {string} fieldKey
     */
    resolveConflictKeepAll(fieldKey) {
      if (this.project && this.project.status === 'archived') {
        ElementPlus.ElMessage.warning('已归档项目无法修改');
        return;
      }
      const sources = this.fieldMeta[fieldKey].sources || [];
      const allValues = sources
        .filter(s => s.value)
        .map(s => `${s.value}（${this.getSourceLabel(s.docType)}）`);
      this.setFieldValue(fieldKey, allValues.join('；'));
      this.fieldMeta[fieldKey].conflict = false;
    },

    /**
     * 获取来源文档中文名
     * @param {string} docType
     * @returns {string}
     */
    getSourceLabel(docType) {
      return Utils.DOC_TYPES[docType]?.label || docType;
    },

    // ==================== 多标段字段读写 ====================

    /**
     * 获取字段值（根据是否为标段特有字段决定读取源）
     * @param {string} fieldKey
     * @returns {*}
     */
    getFieldValue(fieldKey) {
      if (this.isMultiSegment && SEGMENT_FIELDS.includes(fieldKey)) {
        const segData = this.segmentFormData[this.currentSegment];
        return segData ? segData[fieldKey] : '';
      }
      return this.formData[fieldKey];
    },

    /**
     * 设置字段值（根据是否为标段特有字段决定写入位置）
     * 共享字段编辑时自动同步到所有标段的 segmentFormData
     * @param {string} fieldKey
     * @param {*} value
     */
    setFieldValue(fieldKey, value) {
      if (this.isMultiSegment && SEGMENT_FIELDS.includes(fieldKey)) {
        // 标段特有字段：写入当前标段
        if (!this.segmentFormData[this.currentSegment]) {
          this.segmentFormData[this.currentSegment] = {};
        }
        this.segmentFormData[this.currentSegment][fieldKey] = value;
      } else {
        // 共享字段
        this.formData[fieldKey] = value;
        // 多标段时，同步共享字段到所有标段（仅非标段特有字段）
        if (this.isMultiSegment && !SEGMENT_FIELDS.includes(fieldKey)) {
          Object.keys(this.segmentFormData).forEach(idx => {
            this.segmentFormData[idx][fieldKey] = value;
          });
        }
      }
    },

    /**
     * 判断字段是否为标段特有字段
     * @param {string} fieldKey
     * @returns {boolean}
     */
    isSegmentField(fieldKey) {
      return this.isMultiSegment && SEGMENT_FIELDS.includes(fieldKey);
    },

    // onSegmentChange 已移除：不再使用 Tab 切换，改为列表式分区展示

    /**
     * 保存草稿
     */
    async saveDraft() {
      if (this.project && this.project.status === 'archived') {
        ElementPlus.ElMessage.warning('已归档项目无法修改');
        return;
      }
      this.saving = true;
      try {
        // 保存共享字段
        await DB.saveMergedData(this.projectId, { projectId: this.projectId, ...this.formData });
        await DB.updateProject(this.projectId, { updatedAt: new Date().toISOString() });
        ElMessage.success('草稿已保存');
      } catch (error) {
        ElMessage.error('保存失败: ' + error.message);
      }
      this.saving = false;
    },

    /**
     * 提交归档
     * 单标段和多标段分别处理
     */
    async submitToArchive() {
      if (this.submitting) return;
      this.submitting = true;
      try {
        // 1. 先保存草稿
        await DB.saveMergedData(this.projectId, { projectId: this.projectId, ...this.formData });
        await DB.updateProject(this.projectId, { updatedAt: new Date().toISOString() });

        // 2. 组装请求体
        let requestBody = {};
        if (this.isMultiSegment) {
          // 多标段：组装各标段的 formData
          const segmentFormData = this.segments.map((seg, idx) => {
            const data = { ...this.formData }; // 共享字段为基础
            // 覆盖标段特有字段
            const segSpecific = this.segmentFormData[idx] || {};
            SEGMENT_FIELDS.forEach(key => {
              if (segSpecific[key] !== undefined) {
                data[key] = segSpecific[key];
              }
            });
            // projectName 从标段表单数据中取（用户可能已编辑过）
            // 不再硬编码覆盖
            if (!data.projectName) {
              const baseName = this.formData.projectName || this.project.projectName || '';
              data.projectName = baseName + (seg.name || '');
            }
            return { name: seg.name, formData: data };
          });
          requestBody = { segmentFormData };
        }

        // 3. 调用后端提交归档
        await API.submitProject(this.projectId, requestBody);

        // 4. 更新本地状态
        await DB.updateProject(this.projectId, { status: 'archived', syncedAt: new Date().toISOString() });

        ElMessage.success('归档提交成功');

        // 5. 返回项目列表
        navigateTo('#/home');
      } catch (error) {
        ElMessage.error('归档提交失败: ' + error.message);
        this.submitting = false;
      }
    }
  },
  template: `
    <div class="page-container" v-loading="loading">
      <!-- 顶部栏 -->
      <header class="top-navbar">
        <div class="navbar-left">
          <el-button text @click="navigateTo('#/project/' + projectId)">← 返回详情</el-button>
          <span class="page-title">复核并确认信息</span>
          <el-tag v-if="project && project.status === 'archived'" type="info" size="small" style="margin-left: 8px;">只读</el-tag>
          <el-tag v-if="isMultiSegment" type="primary" size="small" style="margin-left: 8px;">
            多标段（{{ segments.length }}个）
          </el-tag>
        </div>
        <div class="navbar-right">
          <el-button text @click="$emit('open-settings')">⚙️</el-button>
        </div>
      </header>

      <!-- 采购类型显示（只读） -->
      <div v-if="!loading && project" style="padding: 8px 20px; display: flex; align-items: center; gap: 8px; background: #f5f7fa;">
        <span style="font-size: 13px; color: #606266;">采购类型：</span>
        <el-tag size="small">
          {{ procurementType === 'F' ? '服务(F)' : procurementType === 'G' ? '工程(G)' : '货物(H)' }}
        </el-tag>
      </div>

      <!-- 表单主体 -->
      <div class="review-form" v-if="!loading">

        <!-- ========== 多标段：共享字段 + 各标段卡片 ========== -->
        <div v-if="isMultiSegment">
          <!-- 共享信息区：仅展示非标段特有字段 -->
          <el-collapse v-model="activeGroups">
            <el-collapse-item v-for="group in fieldGroups" :key="group.key" :title="group.label" :name="group.key">
              <el-form label-position="left" label-width="140px" style="padding: 0 12px;">
                <template v-for="field in groupedFields[group.key]" :key="field.key">
                  <el-form-item v-if="!isSegmentField(field.key)">
                    <!-- Label -->
                    <template #label>
                      <span>{{ field.label }}</span>
                      <span v-if="field.required" style="color:red"> *</span>
                    </template>

                    <!-- 字段输入框，根据类型渲染 -->
                    <div class="field-wrapper" :class="{
                      'field-conflict': fieldMeta[field.key]?.conflict,
                      'field-missing': !formData[field.key] && !fieldMeta[field.key]?.conflict
                    }">
                      <!-- projectNo 字段：只读 -->
                      <template v-if="field.key === 'projectNo'">
                        <el-input
                          :model-value="project && project.status === 'archived' ? formData[field.key] : '提交后自动分配'"
                          disabled
                        />
                      </template>

                      <!-- 枚举下拉 -->
                      <el-select v-else-if="field.type === 'enum'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="project && project.status === 'archived'"
                        placeholder="请选择" clearable filterable style="width:100%">
                        <el-option v-for="opt in getEnumOptions(field.enumKey)" :key="opt" :label="opt" :value="opt" />
                      </el-select>

                      <!-- 日期选择 -->
                      <el-date-picker v-else-if="field.type === 'date'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="project && project.status === 'archived'"
                        type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />

                      <!-- 长文本 -->
                      <el-input v-else-if="field.type === 'textarea'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="project && project.status === 'archived'"
                        type="textarea" :rows="4" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <!-- 数字 -->
                      <el-input v-else-if="field.type === 'number'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="project && project.status === 'archived'"
                        type="number" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <!-- 普通文本 -->
                      <el-input v-else :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="project && project.status === 'archived'"
                        :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <!-- 来源标签 -->
                      <span v-if="fieldMeta[field.key]?.source" class="field-source">
                        来自：{{ getSourceLabel(fieldMeta[field.key].source) }}
                      </span>
                    </div>

                    <!-- 冲突提示条 -->
                    <div v-if="fieldMeta[field.key]?.conflict" class="conflict-bar">
                      <span>⚠️ 数据冲突：</span>
                      <span v-for="(src, cIdx) in fieldMeta[field.key].sources" :key="cIdx">
                        <el-button size="small" text type="primary" @click="resolveConflict(field.key, src.value)"
                          :disabled="project && project.status === 'archived'">
                          {{ getSourceLabel(src.docType) }}: {{ src.value }}
                        </el-button>
                        <span v-if="cIdx < fieldMeta[field.key].sources.length - 1"> / </span>
                      </span>
                      <el-button size="small" type="warning" plain @click="resolveConflictKeepAll(field.key)"
                        :disabled="project && project.status === 'archived'">
                        保留全部
                      </el-button>
                    </div>
                  </el-form-item>
                </template>
              </el-form>
            </el-collapse-item>
          </el-collapse>

          <!-- 标段特有信息区：每个标段一张卡片 -->
          <div style="padding: 16px 20px;">
            <h4 style="margin-bottom: 12px; color: #303133;">各标段信息</h4>
            <el-card v-for="(seg, idx) in segments" :key="idx" style="margin-bottom: 12px;" shadow="hover">
              <template #header>
                <span style="font-weight: bold;">{{ seg.name || ('标段' + (idx + 1)) }}</span>
              </template>
              <el-form label-position="left" label-width="140px">
                <el-form-item v-for="field in segmentFieldDefs" :key="field.key" :label="field.label">
                  <el-input
                    v-model="segmentFormData[idx][field.key]"
                    :placeholder="'请输入' + field.label"
                    :disabled="project && project.status === 'archived'"
                  />
                </el-form-item>
              </el-form>
            </el-card>
          </div>
        </div>

        <!-- ========== 单标段：保持原有逻辑，所有字段一起展示 ========== -->
        <div v-else>
          <el-collapse v-model="activeGroups">
            <el-collapse-item v-for="group in fieldGroups" :key="group.key" :title="group.label" :name="group.key">
              <el-form label-position="left" label-width="140px">
                <el-form-item v-for="field in groupedFields[group.key]" :key="field.key">
                  <!-- Label -->
                  <template #label>
                    <span>{{ field.label }}</span>
                    <span v-if="field.required" style="color:red"> *</span>
                  </template>

                  <!-- 字段输入框，根据类型渲染 -->
                  <div class="field-wrapper" :class="{
                    'field-conflict': fieldMeta[field.key]?.conflict,
                    'field-missing': !getFieldValue(field.key) && !fieldMeta[field.key]?.conflict
                  }">
                    <!-- projectNo 字段：只读 -->
                    <template v-if="field.key === 'projectNo'">
                      <el-input
                        :model-value="project && project.status === 'archived' ? getFieldValue(field.key) : '提交后自动分配'"
                        disabled
                      />
                    </template>

                    <!-- 枚举下拉 -->
                    <el-select v-else-if="field.type === 'enum'" :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event)"
                      :disabled="project && project.status === 'archived'"
                      placeholder="请选择" clearable filterable style="width:100%">
                      <el-option v-for="opt in getEnumOptions(field.enumKey)" :key="opt" :label="opt" :value="opt" />
                    </el-select>

                    <!-- 日期选择 -->
                    <el-date-picker v-else-if="field.type === 'date'" :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event)"
                      :disabled="project && project.status === 'archived'"
                      type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />

                    <!-- 长文本 -->
                    <el-input v-else-if="field.type === 'textarea'" :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event)"
                      :disabled="project && project.status === 'archived'"
                      type="textarea" :rows="4" :placeholder="getFieldValue(field.key) ? '' : '未找到，请手动填写'" />

                    <!-- 数字 -->
                    <el-input v-else-if="field.type === 'number'" :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event)"
                      :disabled="project && project.status === 'archived'"
                      type="number" :placeholder="getFieldValue(field.key) ? '' : '未找到，请手动填写'" />

                    <!-- 普通文本 -->
                    <el-input v-else :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event)"
                      :disabled="project && project.status === 'archived'"
                      :placeholder="getFieldValue(field.key) ? '' : '未找到，请手动填写'" />

                    <!-- 来源标签 -->
                    <span v-if="fieldMeta[field.key]?.source" class="field-source">
                      来自：{{ getSourceLabel(fieldMeta[field.key].source) }}
                    </span>
                  </div>

                  <!-- 冲突提示条 -->
                  <div v-if="fieldMeta[field.key]?.conflict" class="conflict-bar">
                    <span>⚠️ 数据冲突：</span>
                    <span v-for="(src, cIdx) in fieldMeta[field.key].sources" :key="cIdx">
                      <el-button size="small" text type="primary" @click="resolveConflict(field.key, src.value)"
                        :disabled="project && project.status === 'archived'">
                        {{ getSourceLabel(src.docType) }}: {{ src.value }}
                      </el-button>
                      <span v-if="cIdx < fieldMeta[field.key].sources.length - 1"> / </span>
                    </span>
                    <el-button size="small" type="warning" plain @click="resolveConflictKeepAll(field.key)"
                      :disabled="project && project.status === 'archived'">
                      保留全部
                    </el-button>
                  </div>
                </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- 底部按钮 -->
        <div class="form-actions">
          <el-button @click="saveDraft" :loading="saving" :disabled="project && project.status === 'archived'">保存草稿</el-button>
          <el-button type="primary" @click="submitToArchive" :loading="submitting"
            :disabled="project && project.status === 'archived'">
            {{ project && project.status === 'archived' ? '已归档' : '提交归档' }}
          </el-button>
        </div>
      </div>
    </div>
  `
});

// ============================================
// 管理员归档管理页面组件
// ============================================

/**
 * 管理员归档管理页面组件
 * 展示所有归档记录，支持分页和导出Excel
 * 仅管理员可访问
 */
app.component('admin-archive-page', {
  emits: ['open-settings'],
  data() {
    return {
      archives: [],       // 当前页归档记录
      total: 0,           // 归档记录总数
      currentPage: 1,     // 当前页码
      pageSize: 20,       // 每页条数
      loading: false,     // 数据加载状态
      exporting: false    // 导出Excel中状态
    };
  },
  computed: {
    /**
     * 当前用户是否为管理员
     * @returns {boolean}
     */
    isAdmin() {
      const app = window.app;
      return app && app.currentUser && app.currentUser.role === 'admin';
    }
  },
  async mounted() {
    // 非管理员跳转回首页
    if (!this.isAdmin) {
      window.navigateTo('#/home');
      return;
    }
    await this.loadArchives();
  },
  methods: {
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 返回首页
     */
    goHome() {
      this.navigateTo('#/home');
    },
    /**
     * 加载归档记录列表（分页）
     */
    async loadArchives() {
      this.loading = true;
      try {
        const res = await Http.get('/submit/archives?page=' + this.currentPage + '&pageSize=' + this.pageSize);
        this.archives = res.items || [];
        this.total = res.total || 0;
      } catch (error) {
        ElMessage.error('加载归档记录失败: ' + error.message);
      }
      this.loading = false;
    },
    /**
     * 分页切换回调
     * @param {number} page - 目标页码
     */
    handlePageChange(page) {
      this.currentPage = page;
      this.loadArchives();
    },
    /**
     * 下载全部归档表格（Excel）
     */
    async downloadExcel() {
      this.exporting = true;
      try {
        const data = await Http.get('/submit/export-excel');
        Export.exportArchivesToExcel(data.data);
        ElMessage.success('Excel 下载成功');
      } catch (error) {
        ElMessage.error('下载失败: ' + error.message);
      }
      this.exporting = false;
    }
  },
  template: `
    <div class="page-container">
      <!-- 顶部导航栏 -->
      <header class="top-navbar">
        <div class="navbar-left">
          <span class="app-logo">📁 归档管理</span>
        </div>
        <div class="navbar-right">
          <el-button type="success" @click="downloadExcel" :loading="exporting">下载全部归档表格</el-button>
          <el-button text @click="$emit('open-settings')">⚙️</el-button>
          <el-button @click="goHome">返回首页</el-button>
        </div>
      </header>

      <!-- 归档记录表格 -->
      <div style="padding: 20px;" v-loading="loading">
        <el-table :data="archives" stripe style="width: 100%;">
          <el-table-column prop="seq_no" label="序号" width="80" />
          <el-table-column prop="project_no" label="项目编号" width="160" />
          <el-table-column prop="project_name" label="项目名称" />
          <el-table-column prop="segment_name" label="标段" width="120" />
          <el-table-column prop="submitted_by_name" label="提交人" width="120" />
          <el-table-column prop="submitted_at" label="提交时间" width="180" />
        </el-table>

        <!-- 分页 -->
        <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="total"
            layout="total, prev, pager, next"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </div>
  `
});

// ============================================
// 注册 Element Plus 并挂载应用
// ============================================

app.use(ElementPlus, { locale: ElementPlus.lang?.zhCn });
app.mount('#app');
