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
     * @returns {'home' | 'project' | 'review'}
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
              ✅ 已完成
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
      files: {},
      mergedResult: null,
      loading: true,
      editingName: false,
      tempName: '',
      pollingTimer: null    // 文件状态轮询定时器
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
     * 已上传文件数量
     */
    uploadedCount() {
      return Object.values(this.files).filter(f => f && f.status !== 'pending' && f.status !== 'converting').length;
    },
    /**
     * 已成功提取的文件数量
     */
    extractedCount() {
      return Object.values(this.files).filter(f => f && (f.status === 'done' || f.status === 'success')).length;
    },
    /**
     * 预览用的前几个有值字段
     */
    previewFields() {
      if (!this.mergedResult) return [];
      return Utils.FIELDS
        .filter(f => this.mergedResult[f.key] && this.mergedResult[f.key].value)
        .slice(0, 8)
        .map(f => ({ label: f.label, value: this.mergedResult[f.key].value }));
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
        await this.loadFiles();
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        // 如果有 pending/converting 文件，启动轮询
        this._checkAndStartPolling();
      } catch (error) {
        ElMessage.error('加载项目失败: ' + error.message);
      }
      this.loading = false;
    },
    /**
     * 加载项目的所有文件并按 docType 索引
     */
    async loadFiles() {
      const fileList = await DB.getFiles(this.projectId);
      this.files = {};
      fileList.forEach(f => { this.files[f.docType] = f; });
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
     * 处理文件上传（PDF → 后端异步队列处理）
     * 上传后立即返回，不等待 MineRU 转换完成
     * @param {string} docType - 文档类型
     * @param {Event} event - 文件选择事件
     */
    async handleFileUpload(docType, event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        await DB.uploadFile(this.projectId, docType, file);
        ElMessage.success('文件已上传，正在排队处理');
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
     * @param {string} docType - 文档类型
     */
    async extractFile(docType) {
      const file = this.files[docType];
      if (!file) return;
      await DB.updateFileStatus(file.id, 'extracting');
      await this.loadFiles();
      try {
        const result = await Extract.extractFromDocument(docType, file.content);
        await DB.updateFileExtracted(file.id, result);
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        await this.loadFiles();
        ElMessage.success('提取完成');
      } catch (error) {
        await DB.updateFileStatus(file.id, 'error', error.message);
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
        // 更新文件列表
        this.files = {};
        (result.files || []).forEach(f => { this.files[f.docType] = f; });
        // 如果没有 pending/converting 的文件，停止轮询
        const processing = (result.files || []).filter(f => f.status === 'pending' || f.status === 'converting');
        if (processing.length === 0) {
          this.stopPolling();
          // 状态变更后刷新合并数据
          this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        }
      } catch (error) {
        console.error('[轮询] 检查文件状态失败:', error.message);
      }
    },
    /**
     * 检查是否有正在处理的文件，有则启动轮询
     */
    _checkAndStartPolling() {
      const processing = Object.values(this.files).filter(
        f => f && (f.status === 'pending' || f.status === 'converting')
      );
      if (processing.length > 0) {
        this.startPolling();
      }
    },
    /**
     * 重试转换失败的文件
     * @param {string} docType - 文档类型
     */
    async retryConvert(docType) {
      const file = this.files[docType];
      if (!file) return;
      try {
        await DB.retryFile(file.id);
        ElMessage.success('已重新加入处理队列');
        await this.loadFiles();
        this.startPolling();
      } catch (error) {
        ElMessage.error('重试失败: ' + error.message);
      }
    },
    /**
     * 重新上传：删除当前文件并清除提取结果
     * @param {string} docType - 文档类型
     */
    async reupload(docType) {
      await ElMessageBox.confirm('确定要重新上传吗？当前文件和提取结果将被清除。', '确认重新上传', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      });
      const file = this.files[docType];
      if (file && file.id) {
        await DB.deleteFile(file.id);
      }
      await this.loadFiles();
      this.mergedResult = await Extract.mergeExtractedData(this.projectId);
    },
    /**
     * 计算某文件已识别的字段数量
     * @param {string} docType - 文档类型
     * @returns {number}
     */
    extractedFieldCount(docType) {
      const file = this.files[docType];
      if (!file || !file.extracted) return 0;
      return Object.values(file.extracted).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
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
        <el-progress :percentage="(uploadedCount / 6) * 100" :format="() => uploadedCount + '/6 文件已上传'" />
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
            </div>

            <!-- 未上传 -->
            <div v-if="!files[docType]" class="file-card-body">
              <label class="upload-btn">
                选择文件
                <input type="file" accept=".pdf,.md,.markdown" hidden @change="handleFileUpload(docType, $event)" />
              </label>
            </div>

            <!-- 已上传，各状态 -->
            <div v-else class="file-card-body">
              <div class="file-name">📄 {{ files[docType].filename }}</div>

              <!-- 排队中 -->
              <template v-if="files[docType].status === 'pending'">
                <el-button size="small" loading>排队中...</el-button>
                <el-button size="small" @click="reupload(docType)">取消</el-button>
              </template>

              <!-- 转换中（MineRU处理中） -->
              <template v-else-if="files[docType].status === 'converting'">
                <el-button size="small" loading>转换中...</el-button>
              </template>

              <!-- 转换完成，待提取 -->
              <template v-else-if="files[docType].status === 'uploaded'">
                <el-button size="small" type="primary" @click="extractFile(docType)">提取</el-button>
                <el-button size="small" @click="reupload(docType)">重新上传</el-button>
              </template>

              <!-- MineRU 转换失败 -->
              <template v-else-if="files[docType].status === 'convert_failed'">
                <div class="extract-error">❌ 转换失败: {{ files[docType].errorMsg || '未知错误' }}</div>
                <el-button size="small" type="primary" @click="retryConvert(docType)">重试</el-button>
                <el-button size="small" @click="reupload(docType)">重新上传</el-button>
              </template>

              <!-- 提取中 -->
              <template v-else-if="files[docType].status === 'extracting'">
                <el-button size="small" loading>提取中...</el-button>
              </template>

              <!-- 提取完成 -->
              <template v-else-if="files[docType].status === 'done' || files[docType].status === 'success'">
                <div class="extract-success">✅ 提取完成（已识别 {{ extractedFieldCount(docType) }} 个字段）</div>
                <el-button size="small" @click="reupload(docType)">重新上传</el-button>
                <el-button size="small" @click="extractFile(docType)">重新提取</el-button>
              </template>

              <!-- 提取失败 -->
              <template v-else-if="files[docType].status === 'error'">
                <div class="extract-error">❌ {{ files[docType].errorMsg || '提取失败' }}</div>
                <el-button size="small" type="primary" @click="extractFile(docType)">重试</el-button>
                <el-button size="small" @click="reupload(docType)">重新上传</el-button>
              </template>
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

/**
 * 复核表单页组件（ReviewPage）
 * 展示项目提取的字段数据，支持用户复核、编辑、冲突解决、保存草稿及导出Excel
 */
app.component('review-page', {
  props: ['projectId'],
  emits: ['open-settings'],
  data() {
    return {
      loading: true,
      project: null,
      formData: {},         // { fieldKey: value } — 用户编辑的表单数据
      fieldMeta: {},        // { fieldKey: { source, conflict, sources } } — 元数据
      activeGroups: [],     // 展开的折叠面板
      saving: false
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
     */
    async loadData() {
      this.loading = true;
      try {
        this.project = await DB.getProject(this.projectId);

        // 获取合并数据（含冲突信息）
        const mergedResult = await Extract.mergeExtractedData(this.projectId);

        // 初始化表单数据和元数据
        this.formData = {};
        this.fieldMeta = {};
        Utils.FIELDS.forEach(field => {
          if (mergedResult && mergedResult[field.key]) {
            this.formData[field.key] = mergedResult[field.key].value || '';
            this.fieldMeta[field.key] = {
              source: mergedResult[field.key].source,
              conflict: mergedResult[field.key].conflict || false,
              sources: mergedResult[field.key].sources || []
            };
          } else {
            this.formData[field.key] = '';
            this.fieldMeta[field.key] = { source: null, conflict: false, sources: [] };
          }
        });

        // 默认展开有数据的分组
        this.activeGroups = Utils.FIELD_GROUPS
          .filter(g => Utils.FIELDS.some(f => f.group === g.key && this.formData[f.key]))
          .map(g => g.key);
        if (this.activeGroups.length === 0) {
          this.activeGroups = ['basic']; // 至少展开基本信息
        }
      } catch (error) {
        ElMessage.error('加载数据失败: ' + error.message);
      }
      this.loading = false;
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
      this.formData[fieldKey] = sourceValue;
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

    /**
     * 保存草稿
     */
    async saveDraft() {
      this.saving = true;
      try {
        await DB.saveMergedData(this.projectId, { projectId: this.projectId, ...this.formData });
        await DB.updateProject(this.projectId, { updatedAt: new Date().toISOString() });
        ElMessage.success('草稿已保存');
      } catch (error) {
        ElMessage.error('保存失败: ' + error.message);
      }
      this.saving = false;
    },

    /**
     * 导出 Excel
     */
    async exportExcel() {
      // 检查必填字段
      const missingRequired = Utils.FIELDS
        .filter(f => f.required && !this.formData[f.key])
        .map(f => f.label);

      if (missingRequired.length > 0) {
        try {
          await ElMessageBox.confirm(
            `以下必填字段为空：${missingRequired.join('、')}。确认继续导出吗？`,
            '提示',
            { confirmButtonText: '继续导出', cancelButtonText: '返回填写', type: 'warning' }
          );
        } catch {
          return; // 用户取消
        }
      }

      // 调用导出
      if (window.Export && window.Export.exportToExcel) {
        window.Export.exportToExcel(this.formData, this.project.projectName);
        // 更新项目状态
        await DB.updateProject(this.projectId, { status: 'submitted', syncedAt: new Date().toISOString() });
        ElMessage.success('Excel 已导出');
      } else {
        ElMessage.warning('导出功能尚未实现');
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
        </div>
        <div class="navbar-right">
          <el-button text @click="$emit('open-settings')">⚙️</el-button>
        </div>
      </header>

      <!-- 表单主体 -->
      <div class="review-form" v-if="!loading">
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
                  'field-missing': !formData[field.key] && !fieldMeta[field.key]?.conflict
                }">
                  <!-- 枚举下拉 -->
                  <el-select v-if="field.type === 'enum'" v-model="formData[field.key]"
                    placeholder="请选择" clearable filterable style="width:100%">
                    <el-option v-for="opt in getEnumOptions(field.enumKey)" :key="opt" :label="opt" :value="opt" />
                  </el-select>

                  <!-- 日期选择 -->
                  <el-date-picker v-else-if="field.type === 'date'" v-model="formData[field.key]"
                    type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />

                  <!-- 长文本 -->
                  <el-input v-else-if="field.type === 'textarea'" v-model="formData[field.key]"
                    type="textarea" :rows="4" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                  <!-- 数字 -->
                  <el-input v-else-if="field.type === 'number'" v-model="formData[field.key]"
                    type="number" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                  <!-- 普通文本 -->
                  <el-input v-else v-model="formData[field.key]"
                    :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                  <!-- 来源标签 -->
                  <span v-if="fieldMeta[field.key]?.source" class="field-source">
                    来自：{{ getSourceLabel(fieldMeta[field.key].source) }}
                  </span>
                </div>

                <!-- 冲突提示条 -->
                <div v-if="fieldMeta[field.key]?.conflict" class="conflict-bar">
                  <span>⚠️ 数据冲突：</span>
                  <span v-for="(src, idx) in fieldMeta[field.key].sources" :key="idx">
                    <el-button size="small" text type="primary" @click="resolveConflict(field.key, src.value)">
                      {{ getSourceLabel(src.docType) }}: {{ src.value }}
                    </el-button>
                    <span v-if="idx < fieldMeta[field.key].sources.length - 1"> / </span>
                  </span>
                </div>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <!-- 底部按钮 -->
        <div class="form-actions">
          <el-button @click="saveDraft" :loading="saving">保存草稿</el-button>
          <el-button type="primary" @click="exportExcel">导出Excel</el-button>
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
