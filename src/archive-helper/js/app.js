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
 *   #/workbench     → { name: 'workbench' }
 *   #/projects      → { name: 'home', params: { category: '' } }
 *   #/projects/:cat → { name: 'home', params: { category } }（tender|consult|cost，兼容旧链接）
 *   #/project/:id   → { name: 'project', params: { id } }
 *   #/review/:id    → { name: 'review', params: { id } }
 *   #/master-projects     → { name: 'master-projects' }
 *   #/master-projects/:id → { name: 'master-project', params: { id } }
 *   #/admin-archives → { name: 'admin-archives', params: {} }
 *   #/admin-contracts → { name: 'admin-contracts', params: {} }
 *   #/admin-users   → { name: 'admin-users', params: {} }
 * @returns {{path: string, name: string, params: Object}}
 */
function parseRoute() {
  const hash = window.location.hash || '#/projects';
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

  // 匹配 /master-projects/:id
  const masterMatch = path.match(/^\/master-projects\/([^/]+)$/);
  if (masterMatch) {
    return { path, name: 'master-project', params: { id: masterMatch[1] } };
  }

  // 匹配 /master-projects
  if (path === '/master-projects') {
    return { path, name: 'master-projects', params: {} };
  }

  // 匹配 /admin-archives
  if (path === '/admin-archives') {
    return { path, name: 'admin-archives', params: {} };
  }

  // 匹配 /admin-contracts
  if (path === '/admin-contracts') {
    return { path, name: 'admin-contracts', params: {} };
  }

  // 匹配 /admin-users
  if (path === '/admin-users') {
    return { path, name: 'admin-users', params: {} };
  }

  // 工作台（显式入口）
  if (path === '/workbench') {
    return { path, name: 'workbench', params: {} };
  }

  // 归档项目列表：/projects 或 /projects/:category（兼容旧链接）
  const listMatch = path.match(/^\/projects(?:\/(tender|consult|cost))?$/);
  if (listMatch) {
    return { path, name: 'home', params: { category: listMatch[1] || '' } };
  }

  // 兼容旧地址 /home、/；空路径与未知路径默认落到归档项目
  return { path, name: 'home', params: { category: '' } };
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

/**
 * 获取当前登录用户
 * @returns {Object|null}
 */
function getCurrentUser() {
  return window.app && window.app.currentUser;
}

/**
 * 判断当前用户是否为管理员
 * @returns {boolean}
 */
function isCurrentUserAdmin() {
  const user = getCurrentUser();
  return user && (user.role === 'admin' || user.roleCode === 'admin');
}

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
      // 已有 token 时先拉取用户信息，再渲染主界面，避免导航栏 isAdmin/用户信息首屏空白
      userLoading: Http.isLoggedIn(),
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
      if (window.HomeFilterStorage) {
        window.HomeFilterStorage.clear(user);
      }
      this.currentUser = user;
      this.userLoading = false;
      this.showLogin = false;
      if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
        window.location.hash = '#/projects';
      }
    },
    /**
     * 退出登录
     */
    logout() {
      Http.clearToken();
      this.currentUser = null;
      this.userLoading = false;
      this.showLogin = true;
    },
    /**
     * 顶栏全局搜索：跳到项目列表并带上关键词
     * @param {string} keyword
     */
    onShellSearch(keyword) {
      const text = String(keyword || '').trim();
      window.__pendingProjectSearch = text;
      if (this.currentRoute.name === 'home') {
        // 已在列表页，hash 不变不会重新解析，用事件通知列表页应用关键词
        window.dispatchEvent(new CustomEvent('shell-search', { detail: text }));
      } else {
        window.navigateTo('#/projects');
      }
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
        this.currentUser = null;
      } finally {
        this.userLoading = false;
      }
    }
  },
  // 根模板：根据登录态渲染登录页，或「全局外壳 + 当前页面」
  template: `
    <div class="app-container">
      <!-- 登录页 -->
      <login-page
        v-if="showLogin"
        @login-success="onLoginSuccess"
      />

      <div v-else-if="userLoading" class="page-container" style="padding: 48px; text-align: center; color: #666e7a;">
        加载用户信息...
      </div>

      <!-- 主应用：全局侧边导航 + 顶栏，内容随路由切换 -->
      <app-shell
        v-else
        :user="currentUser"
        :route="currentRoute"
        @open-settings="openSettings"
        @search="onShellSearch"
      >
        <workbench-page
          v-if="currentPage === 'workbench'"
          :current-user="currentUser"
        />
        <home-page
          v-else-if="currentPage === 'home'"
          :category="currentRoute.params.category || ''"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <project-page
          v-else-if="currentPage === 'project'"
          :project-id="currentRoute.params.id"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <review-page
          v-else-if="currentPage === 'review'"
          :project-id="currentRoute.params.id"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <master-project-list-page
          v-else-if="currentPage === 'master-projects'"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <master-project-detail-page
          v-else-if="currentPage === 'master-project'"
          :master-project-id="currentRoute.params.id"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <admin-archive-page
          v-else-if="currentPage === 'admin-archives'"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <admin-contract-ledger-page
          v-else-if="currentPage === 'admin-contracts'"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
        <admin-users-page
          v-else-if="currentPage === 'admin-users'"
          :current-user="currentUser"
          @open-settings="openSettings"
        />
      </app-shell>

      <settings-dialog v-if="!showLogin" v-model:visible="showSettings" :user="currentUser" @logout="logout" />
    </div>
  `
});

// ============================================
// 导航栏用户信息组件
// ============================================

app.component('navbar-user-info', {
  props: {
    user: {
      type: Object,
      default: null
    }
  },
  computed: {
    isAdmin() {
      const u = this.user;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    displayText() {
      if (!this.user) return '';
      const parts = [this.user.name || this.user.username];
      if (this.user.departmentName) parts.push(this.user.departmentName);
      if (this.isAdmin && this.user.roleName) parts.push(this.user.roleName);
      return parts.join(' · ');
    }
  },
  template: `
    <span v-if="user" class="navbar-user-info">{{ displayText }}</span>
  `
});

/**
 * 导航栏右侧统一布局：操作按钮 | 分隔线 | 用户信息 | 设置
 */
app.component('navbar-right-section', {
  props: {
    showDivider: {
      type: Boolean,
      default: false
    },
    user: {
      type: Object,
      default: null
    }
  },
  emits: ['open-settings'],
  template: `
    <div class="navbar-right">
      <slot name="actions"></slot>
      <span v-if="showDivider" class="navbar-divider" aria-hidden="true"></span>
      <navbar-user-info :user="user" />
      <el-button text @click="$emit('open-settings')">⚙️</el-button>
    </div>
  `
});

// ============================================
// 全局外壳组件（AppShell）：左侧导航 + 顶栏
// ============================================

/**
 * 全局外壳 - 承载所有登录后页面的侧边导航与顶栏（方向 A：事务工作台）
 */
app.component('app-shell', {
  props: {
    user: { type: Object, default: null },
    route: { type: Object, required: true }
  },
  emits: ['open-settings', 'search'],
  data() {
    return { searchText: '' };
  },
  computed: {
    isAdmin() {
      const u = this.user;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    pageTitle() {
      const name = this.route.name;
      if (name === 'home') return '归档项目';
      const map = {
        workbench: '工作台',
        project: '归档项目详情',
        review: '复核并确认信息',
        'master-projects': '工程项目',
        'master-project': '工程项目详情',
        'admin-archives': '归档记录',
        'admin-contracts': '合同台账',
        'admin-users': '用户管理'
      };
      return map[name] || '档案归档助手';
    },
    pageSub() {
      if (this.route.name !== 'workbench') return '';
      return Utils.formatDate(new Date()) + ' ' + this.weekdayText;
    },
    weekdayText() {
      const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      return names[new Date().getDay()];
    },
    userLine() {
      if (!this.user) return '';
      const parts = [this.user.name || this.user.username];
      if (this.user.departmentName) parts.push(this.user.departmentName);
      return parts.join(' · ');
    },
    roleLine() {
      if (!this.user) return '';
      const parts = [];
      if (this.user.departmentName) parts.push(this.user.departmentName);
      if (this.isAdmin && this.user.roleName) parts.push(this.user.roleName);
      return parts.join(' · ');
    },
    avatarText() {
      const n = (this.user && (this.user.name || this.user.username)) || '?';
      return String(n).slice(0, 1);
    }
  },
  methods: {
    go(path) {
      window.navigateTo(path);
    },
    /**
     * 导航项是否选中；home 需再比对分类
     * @param {string} name
     * @param {string} [cat]
     * @returns {boolean}
     */
    navActive(name, cat) {
      if (this.route.name !== name) return false;
      if (name !== 'home') return true;
      return ((this.route.params && this.route.params.category) || '') === (cat || '');
    },
    submitSearch() {
      this.$emit('search', this.searchText);
    }
  },
  template: `
    <div class="shell">
      <aside class="shell-side">
        <div class="shell-brand"><span class="mark"></span>档案归档助手</div>
        <nav class="shell-nav">
          <div class="shell-nav-item" :class="{ 'is-active': navActive('workbench') }" role="button" tabindex="0"
               @click="go('#/workbench')" @keydown.enter="go('#/workbench')">工作台</div>

          <div class="shell-nav-group">业务</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('home') }" role="button" tabindex="0"
               @click="go('#/projects')" @keydown.enter="go('#/projects')">归档项目</div>
          <div v-if="isAdmin" class="shell-nav-item" :class="{ 'is-active': navActive('admin-archives') }" role="button" tabindex="0"
               @click="go('#/admin-archives')" @keydown.enter="go('#/admin-archives')">归档记录</div>

          <div class="shell-nav-group">管理</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('master-projects') || navActive('master-project') }" role="button" tabindex="0"
               @click="go('#/master-projects')" @keydown.enter="go('#/master-projects')">工程项目</div>
          <template v-if="isAdmin">
            <div class="shell-nav-item" :class="{ 'is-active': navActive('admin-contracts') }" role="button" tabindex="0"
                 @click="go('#/admin-contracts')" @keydown.enter="go('#/admin-contracts')">合同台账</div>
            <div class="shell-nav-item" :class="{ 'is-active': navActive('admin-users') }" role="button" tabindex="0"
                 @click="go('#/admin-users')" @keydown.enter="go('#/admin-users')">用户管理</div>
          </template>
        </nav>
        <div class="shell-side-foot">
          <span class="avatar">{{ avatarText }}</span>
          <div style="min-width:0;">
            <div class="who">{{ user && (user.name || user.username) }}</div>
            <div class="role">{{ roleLine }}</div>
          </div>
        </div>
      </aside>

      <div class="shell-main">
        <header class="shell-top">
          <div style="display:flex;align-items:baseline;min-width:0;">
            <span class="shell-top-title">{{ pageTitle }}</span>
            <span class="shell-top-sub" v-if="pageSub">{{ pageSub }}</span>
          </div>
          <div class="shell-top-right">
            <form class="shell-search" @submit.prevent="submitSearch">
              <span class="lens" aria-hidden="true"></span>
              <input v-model="searchText" type="search" placeholder="搜索归档项目名称 / 编号 / 建设单位" aria-label="搜索归档项目" />
            </form>
            <span class="shell-top-user">{{ userLine }}</span>
            <el-button text @click="$emit('open-settings')">设置</el-button>
          </div>
        </header>
        <div class="shell-body">
          <slot></slot>
        </div>
      </div>
    </div>
  `
});

// ============================================
// 工程项目选择器（输入即搜 + 就地新建）
// ============================================

app.component('master-project-picker', {
  props: {
    modelValue: { type: Object, default: null },
    placeholder: { type: String, default: '搜索工程项目名称 / 建设单位 / 编号' },
    allowNone: { type: Boolean, default: true },
    noneText: { type: String, default: '暂不归属' }
  },
  emits: ['update:modelValue'],
  data() {
    return {
      keyword: '',
      open: false,
      loading: false,
      results: [],
      creating: false,
      creatingSaving: false,
      newForm: { name: '', ownerName: '', projectNo: '' },
      searchTimer: null
    };
  },
  computed: {
    selected() {
      return this.modelValue || null;
    }
  },
  watch: {
    modelValue: {
      immediate: true,
      handler(val) {
        this.keyword = val ? (val.name || '') : '';
      }
    }
  },
  mounted() {
    this._onDocClick = (event) => {
      if (!this.$refs.root) return;
      if (!this.$refs.root.contains(event.target)) {
        this.open = false;
      }
    };
    document.addEventListener('mousedown', this._onDocClick);
  },
  beforeUnmount() {
    if (this._onDocClick) document.removeEventListener('mousedown', this._onDocClick);
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },
  methods: {
    onFocus() {
      this.open = true;
      this.doSearch();
    },
    openPicker() {
      this.open = true;
      this.$nextTick(() => this.doSearch());
    },
    onInput() {
      this.open = true;
      if (this.selected) this.$emit('update:modelValue', null);
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.doSearch(), 300);
    },
    async doSearch() {
      const q = String(this.keyword || '').trim();
      if (!q) {
        this.results = [];
        return;
      }
      this.loading = true;
      try {
        const res = await API.searchMasterProjects(q, 5);
        this.results = res.items || [];
      } catch (error) {
        this.results = [];
      }
      this.loading = false;
    },
    select(item) {
      this.keyword = item.name || '';
      this.results = [];
      this.open = false;
      this.creating = false;
      this.$emit('update:modelValue', {
        id: item.id,
        name: item.name,
        ownerName: item.ownerName || '',
        projectNo: item.projectNo || '',
        archiveCount: item.archiveCount || 0
      });
    },
    clearSelection() {
      this.keyword = '';
      this.results = [];
      this.open = false;
      this.creating = false;
      this.$emit('update:modelValue', null);
    },
    startCreate() {
      this.newForm = {
        name: String(this.keyword || '').trim(),
        ownerName: '',
        projectNo: ''
      };
      this.creating = true;
      this.open = false;
    },
    backToSearch() {
      this.creating = false;
      this.open = true;
      this.doSearch();
    },
    async submitCreate() {
      const name = String(this.newForm.name || '').trim();
      if (!name) {
        ElMessage.warning('请输入工程项目名称');
        return;
      }
      this.creatingSaving = true;
      try {
        const created = await API.createMasterProject({
          name,
          ownerName: String(this.newForm.ownerName || '').trim(),
          projectNo: String(this.newForm.projectNo || '').trim()
        });
        ElMessage.success('工程项目已创建并选中');
        this.select(created);
      } catch (error) {
        ElMessage.error(error.message || '创建工程项目失败');
      }
      this.creatingSaving = false;
    }
  },
  template: `
    <div class="mp-picker" ref="root">
      <div v-if="selected && !open" class="mp-selected">
        <span class="mp-selected-name">{{ selected.name }}</span>
        <span v-if="selected.ownerName" class="mp-selected-owner">{{ selected.ownerName }}</span>
        <button type="button" class="mp-link" @click="openPicker">更换</button>
        <button type="button" class="mp-link" @click="clearSelection">暂不归属</button>
      </div>

      <el-input
        v-else
        v-model="keyword"
        :placeholder="placeholder"
        clearable
        @focus="onFocus"
        @input="onInput"
        @clear="clearSelection"
      />

      <div v-if="open && !creating" class="mp-panel">
        <div class="mp-panel-hd">
          <span v-if="loading">搜索中...</span>
          <span v-else-if="keyword && results.length">匹配到 {{ results.length }} 个工程项目</span>
          <span v-else-if="keyword">未匹配到工程项目</span>
          <span v-else>输入关键词搜索工程项目</span>
        </div>
        <div v-if="loading" class="mp-loading">正在搜索...</div>
        <template v-else>
          <div
            v-for="item in results"
            :key="item.id"
            class="mp-hit"
            @click="select(item)"
          >
            <div class="mp-hit-info">
              <div class="mp-hit-name">{{ item.name }}</div>
              <div class="mp-hit-meta">
                <span>{{ item.ownerName || '未填建设单位' }}</span>
                <span>已有归档 {{ item.archiveCount || 0 }}</span>
                <span v-if="item.projectNo">编号 {{ item.projectNo }}</span>
              </div>
            </div>
            <el-button size="small">选择</el-button>
          </div>
          <div class="mp-new" @click="startCreate">
            <span class="mp-plus">+</span>
            新建工程项目「{{ keyword || '未命名' }}」
          </div>
          <div v-if="allowNone" class="mp-none">
            <a href="javascript:;" @click="clearSelection">{{ noneText }}</a>
            <span>不归属的归档不计入工程汇总，之后可在列表里补</span>
          </div>
        </template>
      </div>

      <div v-if="creating" class="mp-inline-new">
        <div class="mp-inline-hd">
          <b>新建工程项目</b>
          <span>业主的立项工程，仅用于归档分组</span>
        </div>
        <div class="mp-inline-bd">
          <div class="mp-field">
            <label>工程项目名称 <i>*</i></label>
            <el-input v-model="newForm.name" placeholder="如 G8517 屏山至兴义国家高速公路" />
          </div>
          <div class="mp-field-row">
            <div class="mp-field">
              <label>建设单位</label>
              <el-input v-model="newForm.ownerName" placeholder="选填" />
            </div>
            <div class="mp-field">
              <label>工程项目编号</label>
              <el-input v-model="newForm.projectNo" placeholder="留空自动生成" />
            </div>
          </div>
        </div>
        <div class="mp-inline-ft">
          <span class="mp-inline-hint">保存后自动选中，无需返回搜索</span>
          <el-button size="small" @click="backToSearch">返回搜索</el-button>
          <el-button size="small" type="primary" :loading="creatingSaving" @click="submitCreate">创建并选中</el-button>
        </div>
      </div>
    </div>
  `
});

// ============================================
// 新建归档项目弹窗（服务类型 + 名称 + 所属工程项目）
// ============================================

app.component('archive-project-create-dialog', {
  props: {
    visible: { type: Boolean, default: false },
    defaultCategory: { type: String, default: 'tender' },
    presetMasterProject: { type: Object, default: null },
    title: { type: String, default: '新建归档项目' }
  },
  emits: ['update:visible', 'created'],
  data() {
    return {
      categoryCode: 'tender',
      projectName: '',
      masterProject: null,
      submitting: false,
      categoryOptions: [
        { code: 'tender', label: '招标代理', desc: '招标文件、中标通知书' },
        { code: 'cost', label: '造价咨询', desc: '清单、限价、结算' },
        { code: 'consult', label: '咨询', desc: '工可、PPP、专项' }
      ]
    };
  },
  watch: {
    visible(val) {
      if (val) this.resetForm();
    }
  },
  methods: {
    resetForm() {
      this.categoryCode = this.defaultCategory || 'tender';
      this.projectName = '';
      this.masterProject = this.presetMasterProject ? { ...this.presetMasterProject } : null;
      this.submitting = false;
    },
    close() {
      if (this.submitting) return;
      this.$emit('update:visible', false);
    },
    async submit() {
      const name = String(this.projectName || '').trim();
      if (!name) {
        ElMessage.warning('请输入归档项目名称');
        return;
      }
      this.submitting = true;
      try {
        const projectId = await DB.createProject(name, this.categoryCode, {
          masterProjectId: this.masterProject ? this.masterProject.id : ''
        });
        this.$emit('created', projectId);
        this.$emit('update:visible', false);
        ElMessage.success('归档项目已创建');
      } catch (error) {
        ElMessage.error(error.message || '创建归档项目失败');
      }
      this.submitting = false;
    }
  },
  template: `
    <el-dialog
      :model-value="visible"
      :title="title"
      width="560px"
      :close-on-click-modal="false"
      @update:model-value="$emit('update:visible', $event)"
    >
      <div class="create-dialog">
        <div class="create-field">
          <div class="create-label"><i>*</i>服务类型</div>
          <div class="create-service-cards">
            <button
              v-for="opt in categoryOptions"
              :key="opt.code"
              type="button"
              class="create-service-card"
              :class="{ on: categoryCode === opt.code }"
              @click="categoryCode = opt.code"
            >
              <b>{{ opt.label }}</b>
              <span>{{ opt.desc }}</span>
            </button>
          </div>
        </div>

        <div class="create-field">
          <div class="create-label"><i>*</i>归档项目名称</div>
          <el-input v-model="projectName" placeholder="如 施工监理招标" maxlength="200" show-word-limit />
        </div>

        <div class="create-field">
          <div class="create-label">所属工程项目 <span class="create-optional">选填</span></div>
          <master-project-picker v-model="masterProject" />
          <div class="create-hint">
            归属后可在工程项目页汇总查看；暂不归属也可以正常归档，之后能在列表里补。
          </div>
        </div>
      </div>

      <template #footer>
        <span class="create-foot-hint">创建后直接进入该归档项目的归档流程</span>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">创建并开始归档</el-button>
      </template>
    </el-dialog>
  `
});

// ============================================
// 工作台页面组件（WorkbenchPage）
// ============================================

/**
 * 工作台 - 登录后首页：待我处理 + 状态 + 快捷新建 + 最近归档/更新
 */
app.component('workbench-page', {
  props: {
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      loading: true,
      entered: false,
      projects: [],
      stats: { inProgress: 0, pendingReview: 0, reviewRejected: 0, pendingPaper: 0, archived: 0 },
      showCreate: false,
      createCategory: 'tender',
      newName: '',
      newRegion: '',
      newProcurement: 'G',
      creating: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    provinceOptions() {
      return Utils.PROVINCES;
    },
    createTitle() {
      const map = { tender: '新建招标项目', consult: '新建咨询项目', cost: '新建造价项目' };
      return map[this.createCategory] || '新建项目';
    },
    taskList() {
      const wanted = this.isAdmin
        ? ['pending_review', 'pending_paper']
        : ['review_rejected', 'draft'];
      return this.projects
        .filter((p) => wanted.indexOf(p.status) !== -1)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 6);
    },
    recentArchived() {
      return this.projects
        .filter((p) => p.status === 'archived')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 4);
    },
    recentUpdates() {
      return this.projects
        .slice()
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 6);
    }
  },
  methods: {
    go(path) {
      window.navigateTo(path);
    },
    statusLabel(status) {
      return {
        draft: '草稿',
        pending_review: '待审核',
        review_rejected: '审核驳回',
        pending_paper: '待纸质核对',
        archived: '已归档'
      }[status] || status;
    },
    statusBadge(status) {
      return {
        draft: 'wb-badge--draft',
        pending_review: 'wb-badge--pending',
        review_rejected: 'wb-badge--reject',
        pending_paper: 'wb-badge--paper',
        archived: 'wb-badge--done'
      }[status] || 'wb-badge--draft';
    },
    rowActionLabel(project) {
      if (this.isAdmin) {
        return project.status === 'pending_paper' ? '纸质核对' : '去审核';
      }
      return project.status === 'review_rejected' ? '重新提交' : '继续填写';
    },
    rowPath(project) {
      return this.isAdmin ? '#/review/' + project.projectId : '#/project/' + project.projectId;
    },
    updateLine(project) {
      const who = project.updatedByName || project.createdByName || '';
      const time = this.relativeTime(project.updatedAt);
      return [who, time].filter(Boolean).join(' · ');
    },
    relativeTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (isNaN(date.getTime())) return '';
      const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
      if (diffDays <= 0) return '今天';
      if (diffDays === 1) return '昨天';
      if (diffDays < 30) return diffDays + ' 天前';
      return Utils.formatDate(date);
    },
    dateShort(value) {
      if (!value) return '';
      const date = new Date(value);
      if (isNaN(date.getTime())) return '';
      return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    },
    openCreate(category) {
      this.createCategory = category || 'tender';
      this.showCreate = true;
    },
    onProjectCreated(projectId) {
      window.navigateTo('#/project/' + projectId);
    },
    async load() {
      this.loading = true;
      try {
        const result = await DB.getProjects({ pageSize: 200 });
        this.projects = result.projects || [];
        this.stats = result.stats || this.stats;
      } catch (error) {
        ElMessage.error('加载工作台失败：' + error.message);
      }
      this.loading = false;
    }
  },
  async mounted() {
    await this.load();
    this.$nextTick(() => {
      this.entered = true;
    });
  },
  template: `
    <div class="page-container" v-loading="loading">
      <div class="wb">
        <div class="wb-panel stagger" :class="{ 'is-in': entered }">
          <div class="wb-panel-head">
            <h2>待我处理</h2>
            <span class="wb-count">{{ taskList.length }}</span>
            <span class="wb-link" role="button" tabindex="0" @click="go('#/projects')" @keydown.enter="go('#/projects')">全部项目 →</span>
          </div>
          <transition-group name="list" tag="div">
            <div v-for="project in taskList" :key="project.projectId" class="wb-row">
              <span class="wb-badge" :class="statusBadge(project.status)">{{ statusLabel(project.status) }}</span>
              <div class="wb-row-main">
                <div class="wb-row-title" :title="project.projectName">{{ project.projectName }}</div>
                <div class="wb-row-meta">{{ updateLine(project) }}</div>
              </div>
              <span
                class="wb-row-btn"
                :class="isAdmin ? 'wb-row-btn--solid' : 'wb-row-btn--ghost'"
                role="button"
                tabindex="0"
                @click="go(rowPath(project))"
                @keydown.enter="go(rowPath(project))"
              >{{ rowActionLabel(project) }}</span>
            </div>
          </transition-group>
          <div v-if="!loading && taskList.length === 0" class="wb-empty">暂无待处理事项</div>
        </div>

        <div class="wb-lower">
          <div class="wb-panel stagger" :class="{ 'is-in': entered }">
            <div class="wb-panel-head"><h2>最近更新</h2></div>
            <div class="wb-feed">
              <div v-for="project in recentUpdates" :key="project.projectId" class="wb-feed-row">
                <span class="who">{{ project.updatedByName || project.createdByName || '系统' }}</span>
                <span class="what">{{ statusLabel(project.status) }}「<b>{{ project.projectName }}</b>」</span>
                <span class="when">{{ dateShort(project.updatedAt) }}</span>
              </div>
              <div v-if="!loading && recentUpdates.length === 0" class="wb-empty">还没有项目</div>
            </div>
          </div>

          <div class="wb-col">
            <div class="wb-panel stagger" :class="{ 'is-in': entered }">
              <div class="wb-panel-head"><h2>项目状态</h2></div>
              <div class="wb-stats">
                <div class="wb-stat"><div class="n is-pending">{{ stats.pendingReview }}</div><div class="l">待审核</div></div>
                <div class="wb-stat"><div class="n is-paper">{{ stats.pendingPaper }}</div><div class="l">待纸质核对</div></div>
                <div class="wb-stat"><div class="n">{{ stats.inProgress }}</div><div class="l">待提交</div></div>
                <div class="wb-stat"><div class="n is-reject">{{ stats.reviewRejected }}</div><div class="l">审核驳回</div></div>
                <div class="wb-stat"><div class="n is-done">{{ stats.archived }}</div><div class="l">已归档</div></div>
              </div>
            </div>

            <div class="wb-panel stagger" :class="{ 'is-in': entered }">
              <div class="wb-panel-head"><h2>快捷新建</h2></div>
              <div class="wb-quick">
                <button class="primary" @click="openCreate('tender')"><span class="plus"></span>新建归档项目</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <archive-project-create-dialog
        v-model:visible="showCreate"
        :default-category="createCategory"
        @created="onProjectCreated"
      />
    </div>
  `
});

// ============================================
// 登录页组件（LoginPage）
// ============================================

/**
 * 登录页组件 - 账号密码登录（用户名或手机号）
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
        ElMessage.warning('请输入用户名/手机号和密码');
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
            <el-input v-model="form.username" placeholder="用户名 / 手机号" prefix-icon="User" size="large" />
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
      rebuildingSearchIndex: false,
      passwordForm: {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      showPasswordForm: false  // 是否显示修改密码表单
    };
  },
  computed: {
    isAdmin() {
      const u = this.user;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    }
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
     * 管理员：清空并全量重建查询辅助表
     */
    async rebuildSearchIndex() {
      try {
        await ElMessageBox.confirm(
          '将清空查询辅助表并按当前数据库全量重新生成，期间可能短暂影响搜索。是否继续？',
          '重建查询',
          { confirmButtonText: '重建查询', cancelButtonText: '取消', type: 'warning' }
        );
      } catch {
        return;
      }
      this.rebuildingSearchIndex = true;
      try {
        const res = await API.rebuildSearchIndex();
        ElMessage.success(res.message || `已重建 ${res.projectCount || 0} 个项目索引`);
      } catch (error) {
        ElMessage.error(error.message || '重建查询失败');
      } finally {
        this.rebuildingSearchIndex = false;
      }
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
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-input :value="user ? user.name : '未登录'" disabled style="flex: 1;" />
              <el-tag v-if="user && (user.role === 'admin' || user.roleCode === 'admin')" type="danger" size="small">{{ user.roleName || '管理员' }}</el-tag>
              <el-tag v-else-if="user" size="small">{{ user.roleName || '普通用户' }}</el-tag>
            </div>
            <el-input v-if="user && user.departmentName" :value="'部门：' + user.departmentName" disabled />
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

        <template v-if="isAdmin">
          <!-- AI 服务状态（仅管理员可见） -->
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

          <el-form-item label="查询辅助表">
            <el-button
              type="warning"
              plain
              size="small"
              :loading="rebuildingSearchIndex"
              @click="rebuildSearchIndex"
            >重建查询</el-button>
            <div style="margin-top: 8px; font-size: 12px; color: #909399; line-height: 1.5;">
              清空后按当前库全量生成项目/标段查询索引，用于首页高级筛选。
            </div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button v-if="isAdmin" @click="testConn" :loading="testing">测试连接</el-button>
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
  props: {
    currentUser: { type: Object, default: null },
    /** 兼容旧链接 #/projects/:category */
    category: { type: String, default: '' }
  },
  data() {
    return {
      loading: true,
      projects: [],
      projectTotal: 0,
      projectPage: 1,
      projectPageSize: 20,
      projectStats: { inProgress: 0, pendingReview: 0, reviewRejected: 0, pendingPaper: 0, archived: 0 },
      categoryCounts: { all: 0, tender: 0, cost: 0, consult: 0 },
      unassignedCount: 0,
      categoryTab: '',

      searchText: '',
      searchField: 'name_overview',
      filterStatusList: [],
      filterYearList: [],
      filterOwnerList: [],
      filterMasterProjectId: '',
      knownOwners: [],

      showAdvancedFilters: false,
      filterRegionList: [],
      filterTenderTypeList: [],
      filterProjectTypeList: [],
      filterRoadLevelList: [],
      filterIndustryList: [],
      dateField: 'winNoticeDate',
      dateFrom: '',
      dateTo: '',
      amountField: 'totalInvestment',
      amountMin: '',
      amountMax: '',
      mileageMin: '',
      mileageMax: '',

      masterProjectOptions: [],
      searchDebounceTimer: null,
      _homeMounted: false,

      showCreateDialog: false,
      createCategoryCode: 'tender',

      showAssignDialog: false,
      assignTarget: null,
      assignMasterProject: null,
      assigning: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    categoryTabs() {
      return [
        { code: '', label: '全部', count: this.categoryCounts.all },
        { code: 'tender', label: '招标代理', count: this.categoryCounts.tender },
        { code: 'cost', label: '造价咨询', count: this.categoryCounts.cost },
        { code: 'consult', label: '咨询', count: this.categoryCounts.consult }
      ];
    },
    statusOptions() {
      return [
        { value: 'draft', label: '草稿' },
        { value: 'pending_review', label: '待审核' },
        { value: 'review_rejected', label: '审核不通过' },
        { value: 'pending_paper', label: '待纸质核对' },
        { value: 'archived', label: '已归档' }
      ];
    },
    yearOptions() {
      const current = new Date().getFullYear();
      const years = [];
      for (let i = 0; i < 8; i++) years.push(String(current - i));
      return years;
    },
    ownerOptions() {
      return this.knownOwners;
    },
    advancedFilterCount() {
      let n = 0;
      if (this.filterRegionList.length > 0) n += 1;
      if (this.filterTenderTypeList.length > 0) n += 1;
      if (this.filterProjectTypeList.length > 0) n += 1;
      if (this.filterRoadLevelList.length > 0) n += 1;
      if (this.filterIndustryList.length > 0) n += 1;
      if (this.dateFrom || this.dateTo) n += 1;
      if (this.amountMin !== '' || this.amountMax !== '') n += 1;
      if (this.mileageMin !== '' || this.mileageMax !== '') n += 1;
      return n;
    },
    hasNarrowingFilters() {
      return !!(this.searchText
        || this.filterStatusList.length > 0
        || this.filterYearList.length > 0
        || this.filterOwnerList.length > 0
        || this.filterMasterProjectId
        || this.advancedFilterCount > 0);
    },
    tenderTypeFilterOptions() { return Utils.ENUMS.tenderType || []; },
    projectTypeFilterOptions() { return Utils.ENUMS.projectType || []; },
    roadLevelFilterOptions() { return Utils.ENUMS.roadLevel || []; },
    industryFilterOptions() { return Utils.ENUMS.industry || []; },
    provinceOptions() { return Utils.PROVINCES; }
  },
  watch: {
    category(val) {
      this.categoryTab = val || '';
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.loadProjects();
    }
  },
  async mounted() {
    this.categoryTab = this.category || '';
    await Promise.all([this.loadProjects(), this.loadMasterProjectOptions()]);
    this._homeMounted = true;
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    statusLabel(status) {
      const map = {
        draft: '草稿',
        pending_review: '待审核',
        review_rejected: '审核不通过',
        review_approved: '审核通过',
        pending_paper: '待纸质核对',
        archived: '已归档'
      };
      return map[status] || status || '—';
    },
    statusClass(status) {
      return 'ap-chip ap-chip--' + (status || 'draft');
    },
    shortDate(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (isNaN(date.getTime())) return '—';
      return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    },
    projectSub(row) {
      const parts = [];
      let segments = [];
      try {
        segments = typeof row.segments === 'string' ? JSON.parse(row.segments || '[]') : (row.segments || []);
      } catch (e) { segments = []; }
      if (Array.isArray(segments) && segments.length > 1) parts.push(segments.length + ' 个标段');
      if (row.region) parts.push(row.region);
      return parts.join(' · ');
    },
    canChangeMaster(project) {
      if (!project || !this.currentUser) return false;
      if (this.isAdmin) return true;
      return project.createdBy === this.currentUser.id;
    },
    canDeleteProject(project) {
      if (!project) return false;
      if (project.status === 'pending_review' || project.status === 'pending_paper') return false;
      if (project.status === 'archived') return this.isAdmin;
      return true;
    },
    goDetail(project) {
      this.navigateTo('#/project/' + project.projectId);
    },
    async loadMasterProjectOptions() {
      try {
        const res = await API.listMasterProjects({ page: 1, pageSize: 500 });
        this.masterProjectOptions = res.items || [];
      } catch (error) {
        this.masterProjectOptions = [];
      }
    },
    async loadProjects() {
      this.loading = true;
      try {
        const result = await DB.getProjects({
          search: this.searchText,
          searchField: this.searchField,
          categoryCodes: this.categoryTab ? [this.categoryTab] : [],
          statuses: this.filterStatusList,
          regions: this.filterRegionList,
          tenderTypes: this.filterTenderTypeList,
          projectTypes: this.filterProjectTypeList,
          roadLevels: this.filterRoadLevelList,
          industries: this.filterIndustryList,
          years: this.filterYearList,
          ownerNames: this.filterOwnerList,
          masterProjectId: this.filterMasterProjectId,
          page: this.projectPage,
          pageSize: this.projectPageSize,
          dateField: this.dateField,
          dateFrom: this.dateFrom,
          dateTo: this.dateTo,
          amountField: this.amountField,
          amountMin: this.amountMin,
          amountMax: this.amountMax,
          mileageMin: this.mileageMin,
          mileageMax: this.mileageMax
        });
        this.projects = result.projects || [];
        this.projectTotal = result.total || 0;
        this.projectPage = result.page || this.projectPage;
        this.projectStats = result.stats || this.projectStats;
        this.categoryCounts = result.categoryCounts || this.categoryCounts;
        this.unassignedCount = result.unassignedCount || 0;
        const owners = new Set(this.knownOwners);
        for (const p of this.projects) {
          if (p.createdByName) owners.add(p.createdByName);
        }
        this.knownOwners = Array.from(owners).sort((a, b) => String(a).localeCompare(String(b), 'zh'));
      } catch (error) {
        ElMessage.error('加载归档项目失败: ' + error.message);
      }
      this.loading = false;
    },
    switchCategory(code) {
      if (this.categoryTab === code) return;
      this.categoryTab = code;
      this.projectPage = 1;
      this.loadProjects();
    },
    onFilterChange() {
      this.projectPage = 1;
      this.loadProjects();
    },
    onSearchInput() {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.projectPage = 1;
        this.loadProjects();
      }, 300);
    },
    showUnassigned() {
      this.filterMasterProjectId = 'unassigned';
      this.projectPage = 1;
      this.loadProjects();
    },
    resetFilters() {
      this.searchText = '';
      this.filterStatusList = [];
      this.filterYearList = [];
      this.filterOwnerList = [];
      this.filterMasterProjectId = '';
      this.filterRegionList = [];
      this.filterTenderTypeList = [];
      this.filterProjectTypeList = [];
      this.filterRoadLevelList = [];
      this.filterIndustryList = [];
      this.dateFrom = '';
      this.dateTo = '';
      this.amountMin = '';
      this.amountMax = '';
      this.mileageMin = '';
      this.mileageMax = '';
      this.projectPage = 1;
      this.loadProjects();
    },
    onProjectPageChange(page) {
      this.projectPage = page;
      this.loadProjects();
    },
    openCreateDialog(categoryCode) {
      this.createCategoryCode = categoryCode || 'tender';
      this.showCreateDialog = true;
    },
    async onProjectCreated(projectId) {
      await this.loadMasterProjectOptions();
      this.navigateTo('#/project/' + projectId);
    },
    openAssignDialog(project) {
      if (!this.canChangeMaster(project)) {
        ElMessage.warning('仅创建人或管理员可修改工程归属');
        return;
      }
      this.assignTarget = project;
      this.assignMasterProject = project.masterProjectId
        ? {
            id: project.masterProjectId,
            name: project.masterProjectName,
            ownerName: project.masterProjectOwnerName || project.ownerNameSnapshot || '',
            projectNo: project.masterProjectNo || ''
          }
        : null;
      this.showAssignDialog = true;
    },
    async submitAssign() {
      if (!this.assignTarget) return;
      this.assigning = true;
      try {
        await DB.changeProjectMasterProject(
          this.assignTarget.projectId,
          this.assignMasterProject ? this.assignMasterProject.id : null,
          this.assignMasterProject ? (this.assignMasterProject.ownerName || '') : ''
        );
        this.showAssignDialog = false;
        ElMessage.success('工程归属已更新');
        await this.loadProjects();
      } catch (error) {
        ElMessage.error(error.message || '更新归属失败');
      }
      this.assigning = false;
    },
    async deleteProject(project) {
      try {
        await ElMessageBox.confirm('确定要删除此归档项目吗？删除后不可恢复。', '确认删除', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        });
      } catch (e) {
        return;
      }
      try {
        await DB.deleteProject(project.projectId);
        ElMessage.success('归档项目已删除');
        await this.loadProjects();
      } catch (error) {
        ElMessage.error('删除失败: ' + error.message);
      }
    }
  },
  template: `
    <div class="page-container ap-page" v-loading="loading">
      <div v-if="unassignedCount > 0" class="ap-banner">
        <span>有 <b>{{ unassignedCount }} 个归档项目</b>未归属工程项目，不计入任何工程汇总。</span>
        <el-button size="small" @click="showUnassigned">去归属</el-button>
      </div>

      <div class="ap-tabs">
        <button
          v-for="tab in categoryTabs"
          :key="tab.code || 'all'"
          type="button"
          class="ap-tab"
          :class="{ on: categoryTab === tab.code }"
          @click="switchCategory(tab.code)"
        >
          {{ tab.label }} <span class="ap-tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <div class="ap-toolbar">
        <div class="ap-filters">
          <el-input
            v-model="searchText"
            class="ap-search"
            placeholder="搜索归档项目名称、编号、建设单位"
            clearable
            @input="onSearchInput"
            @clear="onSearchInput"
          />
          <el-select v-model="filterStatusList" multiple collapse-tags collapse-tags-tooltip clearable placeholder="归档状态" style="width: 150px;" @change="onFilterChange">
            <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-select v-model="filterYearList" multiple collapse-tags collapse-tags-tooltip clearable placeholder="年份" style="width: 130px;" @change="onFilterChange">
            <el-option v-for="y in yearOptions" :key="y" :label="y + ' 年'" :value="y" />
          </el-select>
          <el-select v-model="filterOwnerList" multiple collapse-tags collapse-tags-tooltip clearable filterable placeholder="负责人" style="width: 150px;" @change="onFilterChange">
            <el-option v-for="o in ownerOptions" :key="o" :label="o" :value="o" />
          </el-select>
          <el-select v-model="filterMasterProjectId" clearable filterable placeholder="所属工程项目" style="width: 220px;" @change="onFilterChange">
            <el-option label="未归属" value="unassigned" />
            <el-option v-for="m in masterProjectOptions" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </div>
        <div class="ap-actions">
          <el-button @click="showAdvancedFilters = !showAdvancedFilters">
            更多筛选
            <span v-if="advancedFilterCount > 0" class="ap-filter-badge">{{ advancedFilterCount }}</span>
          </el-button>
          <el-button type="primary" @click="openCreateDialog(categoryTab)">+ 新建归档</el-button>
        </div>
      </div>

      <div v-if="showAdvancedFilters" class="ap-advanced">
        <div class="ap-advanced-hd">
          更多筛选
          <span>改动即时生效</span>
          <el-button text size="small" style="margin-left:auto;" @click="resetFilters">清空全部</el-button>
        </div>
        <div class="ap-advanced-bd">
          <el-select v-model="filterRegionList" multiple collapse-tags collapse-tags-tooltip filterable placeholder="所属地域" style="width: 180px;" @change="onFilterChange">
            <el-option v-for="p in provinceOptions" :key="p" :label="p" :value="p" />
          </el-select>
          <el-select v-model="filterTenderTypeList" multiple collapse-tags collapse-tags-tooltip filterable placeholder="招标类型/内容" style="width: 180px;" @change="onFilterChange">
            <el-option v-for="opt in tenderTypeFilterOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <el-select v-model="filterProjectTypeList" multiple collapse-tags collapse-tags-tooltip placeholder="项目类型" style="width: 160px;" @change="onFilterChange">
            <el-option v-for="opt in projectTypeFilterOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <el-select v-model="filterRoadLevelList" multiple collapse-tags collapse-tags-tooltip placeholder="道路等级" style="width: 160px;" @change="onFilterChange">
            <el-option v-for="opt in roadLevelFilterOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <el-select v-model="filterIndustryList" multiple collapse-tags collapse-tags-tooltip filterable placeholder="行业" style="width: 150px;" @change="onFilterChange">
            <el-option v-for="opt in industryFilterOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <div class="ap-range">
            <el-select v-model="dateField" style="width: 140px;" @change="onFilterChange">
              <el-option label="中标通知书时间" value="winNoticeDate" />
              <el-option label="委托时间" value="entrustDate" />
            </el-select>
            <el-date-picker v-model="dateFrom" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 140px;" @change="onFilterChange" />
            <span>至</span>
            <el-date-picker v-model="dateTo" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 140px;" @change="onFilterChange" />
          </div>
          <div class="ap-range">
            <el-select v-model="amountField" style="width: 130px;" @change="onFilterChange">
              <el-option label="项目总投资" value="totalInvestment" />
              <el-option label="中标金额" value="winAmount" />
            </el-select>
            <el-input v-model="amountMin" placeholder="金额最小（万元）" style="width: 150px;" clearable @change="onFilterChange" />
            <span>至</span>
            <el-input v-model="amountMax" placeholder="金额最大（万元）" style="width: 150px;" clearable @change="onFilterChange" />
          </div>
          <div class="ap-range">
            <span class="ap-range-label">里程（公里）</span>
            <el-input v-model="mileageMin" placeholder="最小" style="width: 110px;" clearable @change="onFilterChange" />
            <span>至</span>
            <el-input v-model="mileageMax" placeholder="最大" style="width: 110px;" clearable @change="onFilterChange" />
          </div>
        </div>
      </div>

      <div class="ap-table-card">
        <el-table :data="projects" style="width: 100%;" row-key="projectId">
          <el-table-column label="归档项目" min-width="230">
            <template #default="{ row }">
              <div class="ap-name" @click="goDetail(row)">{{ row.projectName }}</div>
              <div v-if="projectSub(row)" class="ap-sub">{{ projectSub(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="编号" width="132">
            <template #default="{ row }"><span class="ap-mono">{{ row.projectNo || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="类型" width="105">
            <template #default="{ row }"><span class="ap-chip ap-chip--cat">{{ row.categoryName || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="所属工程项目" min-width="210">
            <template #default="{ row }">
              <span v-if="row.masterProjectName" class="ap-master-name">{{ row.masterProjectName }}</span>
              <span v-else class="ap-unassigned">未归属</span>
            </template>
          </el-table-column>
          <el-table-column label="归档状态" width="112">
            <template #default="{ row }"><span :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span></template>
          </el-table-column>
          <el-table-column label="负责人" width="96">
            <template #default="{ row }">{{ row.createdByName || '—' }}</template>
          </el-table-column>
          <el-table-column label="更新" width="82">
            <template #default="{ row }"><span class="ap-time">{{ shortDate(row.updatedAt) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="goDetail(row)">进入归档</el-button>
              <el-button v-if="!row.masterProjectId && canChangeMaster(row)" text @click="openAssignDialog(row)">归入工程</el-button>
              <el-button v-if="canDeleteProject(row)" text type="danger" @click="deleteProject(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="!loading && projects.length === 0" class="ap-empty">
          {{ hasNarrowingFilters ? '没有符合筛选条件的归档项目' : '还没有归档项目，点击右上角新建开始' }}
        </div>

        <div v-if="projectTotal > projectPageSize" class="ap-pager">
          <el-pagination
            v-model:current-page="projectPage"
            :page-size="projectPageSize"
            :total="projectTotal"
            layout="total, prev, pager, next"
            @current-change="onProjectPageChange"
          />
        </div>
      </div>

      <archive-project-create-dialog
        v-model:visible="showCreateDialog"
        :default-category="createCategoryCode"
        @created="onProjectCreated"
      />

      <el-dialog v-model="showAssignDialog" title="归入工程项目" width="520px" destroy-on-close>
        <div v-if="assignTarget" class="ap-assign-target">{{ assignTarget.projectName }}</div>
        <master-project-picker v-model="assignMasterProject" />
        <template #footer>
          <el-button @click="showAssignDialog = false">取消</el-button>
          <el-button type="primary" :loading="assigning" @click="submitAssign">确定</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

app.component('project-page', {
  props: {
    projectId: { type: String, required: true },
    currentUser: { type: Object, default: null }
  },
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
      segmentDirty: false,      // 标段配置是否有未保存修改
      segmentSaving: false,     // 标段配置保存中
      segmentSaveTimer: null,
      _segmentSaveQueued: null,
      _segmentsReady: false,    // 初始加载完成后才允许标记脏状态
      archiveTemplates: [],     // 归档目录模板
      archiveTemplate: '',      // 当前项目指定模板，空=自动
      archiveTemplateSaving: false,
      procurementType: 'G',   // 采购内容类型：G=工程, H=货物, F=服务（默认工程）
      region: '',             // 所属地域（省份）
      selectedDocTypes: {},   // { docType: boolean } 一键提取勾选状态
      batchExtracting: false,  // 一键提取进行中
      showMasterDialog: false,
      masterSelection: null,
      masterSaving: false,
      // ---- 导入方式选择 / 从文件夹导入 ----
      importMethodVisible: false, // 导入方式选择弹窗
      folderImportVisible: false,
      folderScanning: false,
      folderItems: [],            // 候选文件行
      folderJunkCount: 0,
      folderUnsupportedCount: 0,
      folderTruncated: false,
      folderAiRunning: false,
      folderAiProgress: 0,
      folderImporting: false,
      folderRunIndex: 0,          // 本轮上传到第几个（1-based）
      folderRunTotal: 0,          // 本轮需上传的文件总数
      folderCurrentLoaded: 0,     // 当前文件已上传字节
      folderCurrentTotal: 0,      // 当前文件总字节
      folderOverwriteAll: null,   // 重复文件统一策略：true 覆盖 / false 跳过 / null 未决定
      folderResultVisible: false,
      folderResultDismissed: false
    };
  },
  computed: {
    /**
     * 中国省份列表（所属地域）
     */
    provinces() {
      return Utils.PROVINCES;
    },
    /**
     * 文档类型定义
     */
    docTypes() {
      return Utils.DOC_TYPES;
    },
    /**
     * 页面展示的文档类型：非招标项目隐藏资格预审/批复等招标专用类型
     */
    displayDocTypes() {
      if (this.isTenderProject) return this.docTypes;
      const exclude = new Set(Utils.TENDER_ONLY_DOC_TYPES || []);
      const out = {};
      Object.keys(this.docTypes).forEach(code => {
        if (!exclude.has(code)) out[code] = this.docTypes[code];
      });
      return out;
    },
    /**
     * 可勾选一键提取的文档类型（按 DOC_TYPES 顺序）
     */
    eligibleDocTypes() {
      return Object.keys(this.docTypes).filter(dt => this.isDocTypeSelectable(dt));
    },
    /**
     * 已勾选且当前仍可提取的分类数量
     */
    selectedCount() {
      return this.eligibleDocTypes.filter(dt => !!this.selectedDocTypes[dt]).length;
    },
    /**
     * 可勾选分类是否全部选中
     */
    isAllSelected() {
      const eligible = this.eligibleDocTypes;
      if (eligible.length === 0) return false;
      return eligible.every(dt => !!this.selectedDocTypes[dt]);
    },
    /**
     * 全选半选状态
     */
    isSelectIndeterminate() {
      const n = this.selectedCount;
      return n > 0 && n < this.eligibleDocTypes.length;
    },
    /**
     * 可提取文件列表（pdf / md / txt）
     */
    extractableFiles() {
      return Object.values(this.files).reduce((list, arr) => {
        if (!Array.isArray(arr)) return list;
        return list.concat(arr.filter(f => f && Utils.isExtractableFile(f.filename, f.docType)));
      }, []);
    },
    /**
     * 可提取文件总数（进度分母，不含仅存类型）
     */
    extractableTotalCount() {
      return this.extractableFiles.length;
    },
    /**
     * 已成功提取的文件数量（仅可提取类型）
     */
    extractedCount() {
      return this.extractableFiles.filter(f => f && (f.status === 'done' || f.status === 'success')).length;
    },
    /**
     * 仅存类型且已处理完成的数量（单独展示「已上传」）
     */
    storeOnlyUploadedCount() {
      return Object.values(this.files).reduce((sum, arr) => {
        if (!Array.isArray(arr)) return sum;
        return sum + arr.filter(f =>
          f && Utils.isStoreOnlyUpload(f.filename, f.docType) && f.status === 'uploaded'
        ).length;
      }, 0);
    },
    /**
     * 进度条文案：提取进度 + 仅存已上传数
     */
    progressFormatText() {
      const extractPart = `${this.extractedCount}/${this.extractableTotalCount} 文件已提取`;
      if (this.storeOnlyUploadedCount > 0) {
        return `${extractPart}　|　已上传 ${this.storeOnlyUploadedCount}`;
      }
      return extractPart;
    },
    /**
     * 上传 input accept 属性
     */
    fileAcceptAttr() {
      return Utils.FILE_TYPES.ACCEPT_ATTR;
    },
    /**
     * 允许上传的文件后缀提示
     */
    allowedUploadExtHint() {
      return Utils.getAllowedExtHintText();
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
        .filter(f => {
          const cell = formData[f.key];
          if (!cell) return false;
          return typeof cell === 'object' ? !!cell.value : !!cell;
        })
        .slice(0, 8)
        .map(f => {
          const cell = formData[f.key];
          return { label: f.label, value: typeof cell === 'object' ? cell.value : cell };
        });
    },
    /**
     * 是否已分配系统项目编号（非历史占位文案）
     */
    hasAssignedProjectNo() {
      const no = this.project && this.project.projectNo;
      return !!(no && String(no).trim());
    },
    /**
     * 当前项目是否已归档
     */
    isArchived() {
      return !!(this.project && this.project.status === 'archived');
    },
    /**
     * 当前项目是否待审核
     */
    isPendingReview() {
      return !!(this.project && this.project.status === 'pending_review');
    },
    /**
     * 当前项目是否待纸质核对
     */
    isPendingPaper() {
      return !!(this.project && this.project.status === 'pending_paper');
    },
    projectStatusLabel() {
      const map = {
        draft: '草稿',
        pending_review: '待审核',
        review_rejected: '审核不通过',
        review_approved: '审核通过',
        pending_paper: '待纸质核对',
        archived: '已归档'
      };
      return this.project ? (map[this.project.status] || this.project.status || '—') : '—';
    },
    headUpdatedAt() {
      const value = this.project && this.project.updatedAt;
      if (!value) return '—';
      const date = new Date(value);
      if (isNaN(date.getTime())) return '—';
      return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    },
    /**
     * 当前项目是否锁定不可编辑（待审核 / 待纸质核对 / 已归档）
     */
    isLocked() {
      return this.isArchived || this.isPendingReview || this.isPendingPaper;
    },
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    /**
     * 所属地域/采购类型是否可编辑（创建后仅管理员，且非锁定状态）
     */
    canEditRegionProcurement() {
      return this.isAdmin && !this.isLocked;
    },
    /**
     * 审核状态中文
     */
    reviewStatusLabel() {
      const status = this.project && this.project.status;
      const map = {
        draft: '草稿',
        pending_review: '待审核',
        review_rejected: '审核不通过',
        review_approved: '审核通过',
        pending_paper: '待纸质核对',
        archived: '已归档'
      };
      return map[status] || status || '—';
    },
    /**
     * 审核状态标签颜色
     */
    reviewStatusTagType() {
      const status = this.project && this.project.status;
      if (status === 'pending_review' || status === 'pending_paper') return 'warning';
      if (status === 'review_rejected') return 'danger';
      if (status === 'archived' || status === 'review_approved') return 'success';
      return 'info';
    },
    /**
     * 审核备注展示文案
     */
    reviewCommentText() {
      const comment = this.project && this.project.reviewComment;
      if (comment && String(comment).trim()) return String(comment).trim();
      return '无';
    },
    /**
     * 含纸质文件列表（审核信息只读展示）
     */
    paperFilesForDisplay() {
      const list = Object.values(this.files).flat().filter((f) => f && f.hasPaper);
      return list.map((f) => ({
        ...f,
        categoryLabel: Utils.formatFileDocCategory(f.docType, f.segmentNo, this.segments)
      }));
    },
    /**
     * 是否招标类项目（「从文件夹导入」仅对招标类开放）
     */
    isTenderProject() {
      return !this.project || (this.project.categoryCode || 'tender') === 'tender';
    },
    /**
     * 归档模板下拉选项
     */
    archiveTemplateOptions() {
      return this.archiveTemplates.map((t) => ({ value: t.code, label: t.label }));
    },
    /**
     * 下拉展示值：空值用 __auto__ 表示自动
     */
    archiveTemplateSelect: {
      get() {
        return this.archiveTemplate || '__auto__';
      },
      set(value) {
        this.onArchiveTemplateChange(value === '__auto__' ? '' : value);
      }
    },
    /**
     * 实际生效的归档模板编码
     */
    resolvedArchiveTemplateCode() {
      if (this.archiveTemplate) return this.archiveTemplate;
      const category = this.project && (this.project.categoryCode || 'tender');
      if (category === 'consult') return 'ppp_consult';
      if (category === 'cost') return 'cost_consult';
      const cell = this.mergedResult && this.mergedResult.formData && this.mergedResult.formData.projectType;
      const projectType = String(cell && cell.value !== undefined ? cell.value : (cell || '')).trim();
      if (projectType === '政府采购') return 'gov_procurement';
      return 'tender_agency';
    },
    /**
     * 实际生效的归档模板名称
     */
    resolvedArchiveTemplateLabel() {
      const code = this.resolvedArchiveTemplateCode;
      const found = this.archiveTemplates.find((t) => t.code === code);
      return found ? found.label : (code || '自动');
    },
    /**
     * 归档模板是否可编辑（管理员且项目未锁定）
     */
    canEditArchiveTemplate() {
      return this.isAdmin && !this.isLocked;
    },
    /**
     * 文档类型下拉选项（含必传标记）
     */
    folderDocTypeOptions() {
      return Object.keys(this.docTypes).map(code => ({
        value: code,
        label: this.docTypes[code].label,
        required: !!this.docTypes[code].required,
        storeOnly: !!this.docTypes[code].storeOnly
      }));
    },
    /**
     * 文件中待确认数量（尚未指定类型）
     */
    folderPendingCount() {
      return this.folderItems.filter(it => !it.docType).length;
    },
    /**
     * 本次导入 + 已有文件综合后，仍缺失的核心必传类型
     */
    folderMissingRequired() {
      const existing = new Set(Object.keys(this.files).filter(k => (this.files[k] || []).length > 0));
      const assigned = new Set();
      this.folderItems.forEach((it) => {
        if (it.docType) assigned.add(it.docType);
        (it.folderDocTypes || []).forEach((dt) => assigned.add(dt));
      });
      return Utils.FOLDER_IMPORT_REQUIRED.filter(dt => !existing.has(dt) && !assigned.has(dt));
    },
    /**
     * 缺失核心必传类型的中文标签
     */
    folderMissingLabels() {
      return this.folderMissingRequired.map(dt => (this.docTypes[dt] && this.docTypes[dt].label) || dt);
    },
    /**
     * 问题文件：转换失败 / 提取失败
     */
    folderProblemFiles() {
      return Object.values(this.files).flat()
        .filter(f => f && (f.status === 'convert_failed' || f.status === 'error'))
        .map(f => ({
          id: f.id,
          filename: f.filename,
          docType: f.docType,
          label: Utils.formatFileDocCategory(f.docType, f.segmentNo, this.segments),
          status: f.status,
          statusText: f.status === 'convert_failed'
            ? this.getFileProcessFailLabel(f.filename, f.docType)
            : '提取失败',
          errorMsg: f.errorMsg || ''
        }));
    },
    /**
     * 本次导入文件总字节数
     */
    folderTotalBytes() {
      return this.folderItems.reduce((sum, it) => sum + ((it.file && it.file.size) || 0), 0);
    },
    /**
     * 已完成（成功/覆盖/跳过）文件字节数
     */
    folderFinishedBytes() {
      return this.folderItems
        .filter(it => ['uploaded', 'overwritten', 'skipped'].includes(it.uploadStatus))
        .reduce((sum, it) => sum + ((it.file && it.file.size) || 0), 0);
    },
    /**
     * 累计已上传字节（已完成 + 当前文件进度）
     */
    folderLoadedBytes() {
      return this.folderFinishedBytes + this.folderCurrentLoaded;
    },
    /**
     * 上传百分比（真实字节）
     */
    folderUploadPercent() {
      const total = this.folderTotalBytes;
      if (!total) return 0;
      return Math.min(100, Math.round((this.folderLoadedBytes / total) * 100));
    },
    /**
     * 进度文案：已上传 大小 / 总大小 MB
     */
    folderUploadSizeText() {
      return `${this._formatSize(this.folderLoadedBytes)} / ${this._formatSize(this.folderTotalBytes)}`;
    },
    /**
     * 上传失败且可重试的文件
     */
    folderFailedItems() {
      return this.folderItems.filter(it => it.uploadStatus === 'failed');
    }
  },
  async mounted() {
    await this.loadProject();
  },
  beforeUnmount() {
    this.stopPolling();
    if (this.segmentSaveTimer) {
      clearTimeout(this.segmentSaveTimer);
      this.segmentSaveTimer = null;
    }
    if (this.segmentDirty && !this.isLocked) {
      this.saveSegments({ silent: true });
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
     * 采购类型展示文案
     * @param {string} code
     * @returns {string}
     */
    procurementTypeLabel(code) {
      const map = { G: '工程(G)', H: '货物(H)', F: '服务(F)' };
      return map[code] || code || '';
    },
    /**
     * 是否可 AI 提取（模板用；其它附件等整类仅存永远否）
     * @param {string} fileName
     * @param {string} [docType]
     */
    isExtractableFile(fileName, docType) {
      return Utils.isExtractableFile(fileName, docType);
    },
    /**
     * 文件浏览器内查看 URL（带 token，供新标签页打开）
     * @param {string} fileId
     * @returns {string}
     */
    getFileViewUrl(fileId) {
      const token = Http.getToken() || '';
      return `/api/files/${fileId}/view?token=${encodeURIComponent(token)}`;
    },
    /**
     * 本地或 NAS 任一有路径即可尝试查看
     */
    canViewStoredFile(fileItem) {
      return !!(fileItem && (fileItem.localPath || fileItem.nasPath));
    },
    /**
     * 是否为有效错误文案（过滤 null / "null" / 空串）
     * 用于 NAS 失败提示等，成功上传时不展示
     */
    isRealErrorMsg(msg) {
      return typeof msg === 'string' && msg.trim() !== '' && msg.trim() !== 'null';
    },
    /**
     * 加载项目信息、文件列表及合并数据
     */
    async loadArchiveTemplates() {
      try {
        const res = await API.getArchiveTemplates();
        this.archiveTemplates = res.templates || [];
        window.Classify.setTemplates(this.archiveTemplates);
        this.syncClassifyTemplate();
      } catch (error) {
        console.warn('[归档模板] 加载失败:', error.message);
        this.archiveTemplates = [];
      }
    },

    /**
     * 将当前项目模板同步给文件夹导入分类器
     */
    syncClassifyTemplate() {
      if (!window.Classify) return;
      window.Classify.setTemplateCode(this.resolvedArchiveTemplateCode);
    },

    /**
     * 手工切换归档模板
     * @param {string} value
     */
    async onArchiveTemplateChange(value) {
      if (!this.canEditArchiveTemplate) return;
      this.archiveTemplateSaving = true;
      try {
        const updated = await DB.updateArchiveTemplate(this.projectId, value || '');
        this.archiveTemplate = updated.archiveTemplate || '';
        if (this.project) this.project.archiveTemplate = this.archiveTemplate;
        this.syncClassifyTemplate();
        ElMessage.success('归档模板已保存');
      } catch (error) {
        ElMessage.error('保存归档模板失败: ' + error.message);
      }
      this.archiveTemplateSaving = false;
    },

    async loadProject() {
      this.loading = true;
      try {
        this.project = await DB.getProject(this.projectId);
        this.archiveTemplate = (this.project && this.project.archiveTemplate) || '';
        await Promise.all([
          this.loadFiles(),
          this.loadSegments(),
          this.loadArchiveTemplates()
        ]);
        // 从项目信息中加载采购类型与所属地域
        if (this.project && this.project.procurementType) {
          this.procurementType = this.project.procurementType;
        }
        if (this.project) {
          this.region = this.project.region || '';
        }
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        this.syncClassifyTemplate();
        if (this.isLocked) {
          if (this.isPendingReview) {
            ElementPlus.ElMessage.info('当前项目待审核，仅可查看');
          } else if (this.isPendingPaper) {
            ElementPlus.ElMessage.info('当前项目待纸质核对，仅可查看');
          } else {
            ElementPlus.ElMessage.info('当前项目已归档，仅可查看');
          }
        } else {
          // 如果已有提取完成的文件且当前 segments 为空/单个，尝试自动识别标段
          if (this.segments.length <= 1) {
            await this.autoDetectSegments();
          }
          // 如果有 pending/converting 文件，启动轮询
          this._checkAndStartPolling();
        }
        if (this.project && this.project.status === 'review_rejected' && this.project.reviewComment) {
          try {
            await ElementPlus.ElMessageBox.alert(this.project.reviewComment, '审核未通过', {
              confirmButtonText: '关闭',
              type: 'warning'
            });
          } catch (e) { /* 用户关闭弹框 */ }
        }
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
     * 跳转到所属工程项目详情
     */
    goMasterProject() {
      if (this.project && this.project.masterProjectId) {
        this.navigateTo('#/master-projects/' + this.project.masterProjectId);
      }
    },
    /**
     * 是否可修改工程归属（创建人或管理员）
     */
    canChangeMasterAssignment() {
      if (!this.project || !this.currentUser) return false;
      const isAdmin = this.currentUser.role === 'admin' || this.currentUser.roleCode === 'admin';
      return isAdmin || this.project.createdBy === this.currentUser.id;
    },
    openMasterDialog() {
      if (!this.canChangeMasterAssignment()) {
        ElMessage.warning('仅创建人或管理员可修改工程归属');
        return;
      }
      this.masterSelection = this.project && this.project.masterProjectId
        ? {
            id: this.project.masterProjectId,
            name: this.project.masterProjectName,
            ownerName: this.project.masterProjectOwnerName || this.project.ownerNameSnapshot || '',
            projectNo: this.project.masterProjectNo || ''
          }
        : null;
      this.showMasterDialog = true;
    },
    async submitMasterAssignment() {
      if (!this.project) return;
      this.masterSaving = true;
      try {
        const updated = await DB.changeProjectMasterProject(
          this.project.projectId,
          this.masterSelection ? this.masterSelection.id : null,
          this.masterSelection ? (this.masterSelection.ownerName || '') : ''
        );
        this.project = { ...this.project, ...updated };
        this.showMasterDialog = false;
        ElMessage.success('工程归属已更新');
      } catch (error) {
        ElMessage.error(error.message || '更新归属失败');
      }
      this.masterSaving = false;
    },
    /**
     * 开始编辑项目名称
     */
    startEditName() {
      if (this.isLocked) return;
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
      const invalid = selectedFiles.filter(f => !Utils.isAllowedFile(f.name));
      if (invalid.length > 0) {
        ElMessage.error(`不支持的文件类型：${invalid.map(f => f.name).join('、')}。允许：${Utils.FILE_TYPES.ACCEPT_ATTR}`);
        event.target.value = '';
        return;
      }
      try {
        let uploaded = 0;
        let overwritten = 0;
        for (const file of selectedFiles) {
          const ok = await this.uploadOneFile(docType, file, 0);
          if (ok === 'overwritten') overwritten += 1;
          else if (ok === 'uploaded') uploaded += 1;
        }
        const parts = [];
        if (uploaded > 0) parts.push(`${uploaded} 个已上传`);
        if (overwritten > 0) parts.push(`${overwritten} 个已覆盖`);
        if (parts.length > 0) {
          ElMessage.success(parts.join('，') + '，正在排队处理');
          await this.loadFiles();
          this.startPolling();
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('文件上传失败: ' + error.message);
        }
      }
      // 重置 input 以允许重复选择同一文件
      event.target.value = '';
    },
    /**
     * 上传单个文件；遇 409 时确认是否覆盖
     * @returns {Promise<'uploaded'|'overwritten'|'skipped'>}
     */
    async uploadOneFile(docType, file, segmentNo = 0) {
      try {
        const result = await DB.uploadFile(this.projectId, docType, file, segmentNo);
        return result.overwritten ? 'overwritten' : 'uploaded';
      } catch (error) {
        if (error.status !== 409) throw error;
        const tip = (error.data && error.data.tip) || error.message || '文件已存在';
        const needConvert = Utils.needsMineruFile(file.name, docType);
        const confirmMsg = `${tip}。\n继续上传将覆盖原文件` +
          (needConvert ? '，并重新解析转换 Markdown。' : '。') +
          '\n是否继续？';
        try {
          await ElMessageBox.confirm(confirmMsg, '文件已存在', {
            confirmButtonText: '覆盖上传',
            cancelButtonText: '取消',
            type: 'warning'
          });
        } catch {
          return 'skipped';
        }
        const result = await DB.uploadFile(this.projectId, docType, file, segmentNo, { overwrite: true });
        return result.overwritten ? 'overwritten' : 'uploaded';
      }
    },
    /**
     * 删除已上传文件（本地及 NAS 副本各自尽力删除）
     */
    async deleteUploadedFile(fileId) {
      const allFiles = Object.values(this.files).flat();
      const file = allFiles.find(f => f.id === fileId);
      const name = file ? file.filename : '该文件';
      try {
        await ElMessageBox.confirm(
          `确定删除「${name}」吗？将尽力删除本地及 NAS 上的对应文件，且不可恢复。`,
          '确认删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        await DB.deleteFile(fileId);
        await this.loadFiles();
        this.mergedResult = await Extract.mergeExtractedData(this.projectId);
        ElMessage.success('文件已删除');
      } catch (error) {
        ElMessage.error('删除失败: ' + error.message);
      }
    },
    /**
     * 某分类下的文件列表（保持接口返回顺序）
     * @param {string} docType
     * @returns {Array}
     */
    getDocTypeFiles(docType) {
      const list = this.files[docType];
      return Array.isArray(list) ? list : [];
    },
    /**
     * 是否可显示「含纸质」勾选
     * @param {Object} fileItem
     */
    canMarkPaperFile(fileItem) {
      return Utils.canMarkPaperFile(fileItem);
    },
    /**
     * 含纸质勾选变更（即时保存）
     * @param {Object} fileItem
     * @param {boolean} checked
     */
    async onFileHasPaperChange(fileItem, checked) {
      if (!fileItem || this.isLocked) return;
      const prev = !!fileItem.hasPaper;
      fileItem.hasPaper = !!checked;
      try {
        await DB.updateFile(fileItem.id, { hasPaper: !!checked });
      } catch (error) {
        fileItem.hasPaper = prev;
        ElMessage.error('保存含纸质标记失败: ' + error.message);
      }
    },
    /**
     * 是否为 PDF
     * @param {string} fileName
     */
    isPdfFile(fileName) {
      return Utils.FILE_TYPES.PDF_EXTS.includes(Utils.getFileExt(fileName));
    },
    /**
     * 是否为需 MineRU 转换的文件（pdf/image/docx/pptx/xlsx）
     * @param {string} fileName
     * @param {string} [docType]
     */
    isMineruConvertFile(fileName, docType) {
      return Utils.needsMineruFile(fileName, docType);
    },
    /**
     * 队列处理失败文案：需 MineRU 转换的为转换失败，其余为上传失败
     * @param {string} fileName
     * @param {string} [docType]
     * @returns {string}
     */
    getFileProcessFailLabel(fileName, docType) {
      return this.isMineruConvertFile(fileName, docType) ? '转换失败' : '上传失败';
    },
    /**
     * 是否为直接上传的 md/txt
     * @param {string} fileName
     */
    isTextExtractFile(fileName) {
      return Utils.FILE_TYPES.TEXT_EXTS.includes(Utils.getFileExt(fileName));
    },
    /**
     * 文件是否已有可用于提取的正文（md_content）
     * @param {Object} file
     */
    hasFileContent(file) {
      return !!(file && file.content && String(file.content).trim());
    },
    /**
     * 就绪的 MineRU 转换文件：可提取状态且已有转换后 MD
     * @param {Object} file
     */
    isReadyConvertFile(file) {
      if (!file || !this.isMineruConvertFile(file.filename, file.docType)) return false;
      const ready = ['uploaded', 'success', 'done', 'error', 'extracting'];
      return ready.includes(file.status) && this.hasFileContent(file);
    },
    /**
     * MineRU 文件排队/转换中
     * @param {Object} file
     */
    isBusyConvertFile(file) {
      return !!(file && this.isMineruConvertFile(file.filename, file.docType)
        && (file.status === 'pending' || file.status === 'converting'));
    },
    /**
     * MineRU 转换失败
     * @param {Object} file
     */
    isFailedConvertFile(file) {
      return !!(file && this.isMineruConvertFile(file.filename, file.docType)
        && file.status === 'convert_failed');
    },
    /** @deprecated 兼容旧调用，等同 isReadyConvertFile */
    isReadyPdf(file) {
      return this.isReadyConvertFile(file);
    },
    /** @deprecated 兼容旧调用 */
    isBusyPdf(file) {
      return this.isBusyConvertFile(file);
    },
    /** @deprecated 兼容旧调用 */
    isFailedPdf(file) {
      return this.isFailedConvertFile(file);
    },
    /**
     * 可用的 md/txt 源文件
     * @param {Object} file
     */
    isUsableTextFile(file) {
      if (!file || !this.isTextExtractFile(file.filename)) return false;
      const ready = ['uploaded', 'success', 'done', 'error', 'extracting'];
      return ready.includes(file.status) && this.hasFileContent(file);
    },
    /**
     * 解析某分类一键提取的源文件
     * 优先首个就绪的 MineRU 转换文件；否则（无忙等转换）用首个 md/txt，并标记需确认
     * @param {string} docType
     * @returns {{ file: Object, needConfirm: boolean, reason: string }|null}
     */
    resolveExtractSource(docType) {
      const list = this.getDocTypeFiles(docType);
      const readyConverted = list.find(f => this.isReadyConvertFile(f));
      if (readyConverted) {
        return { file: readyConverted, needConfirm: false, reason: 'converted' };
      }
      if (list.some(f => this.isBusyConvertFile(f))) {
        return null;
      }
      const firstText = list.find(f => this.isUsableTextFile(f));
      if (!firstText) return null;
      if (list.some(f => this.isFailedConvertFile(f))) {
        return { file: firstText, needConfirm: true, reason: 'convert_failed' };
      }
      if (list.some(f => this.isMineruConvertFile(f.filename, f.docType || docType))) {
        // 有待转换类型但既非就绪、忙等、也非失败（异常状态）→ 不可选
        return null;
      }
      return { file: firstText, needConfirm: true, reason: 'no_converted' };
    },
    /**
     * 分类是否可勾选一键提取
     * @param {string} docType
     */
    isDocTypeSelectable(docType) {
      const info = this.docTypes[docType];
      if (info && info.batchSelectable === false) return false;
      return !!this.resolveExtractSource(docType);
    },
    /**
     * 设置单个分类勾选
     * @param {string} docType
     * @param {boolean} checked
     */
    setDocTypeSelected(docType, checked) {
      if (checked && !this.isDocTypeSelectable(docType)) return;
      this.selectedDocTypes = { ...this.selectedDocTypes, [docType]: !!checked };
    },
    /**
     * 全选 / 取消全选（仅可勾选分类）
     * @param {boolean} checked
     */
    toggleSelectAll(checked) {
      const next = { ...this.selectedDocTypes };
      this.eligibleDocTypes.forEach(dt => {
        next[dt] = !!checked;
      });
      // 不可选的分类一律取消勾选，避免残留
      Object.keys(this.docTypes).forEach(dt => {
        if (!this.eligibleDocTypes.includes(dt)) next[dt] = false;
      });
      this.selectedDocTypes = next;
    },
    /**
     * 一键提取：按 DOC_TYPES 顺序串行，复用 extractFile
     */
    async batchExtract() {
      if (this.batchExtracting || this.isLocked) return;
      const ordered = Object.keys(this.docTypes).filter(
        dt => !!this.selectedDocTypes[dt] && this.isDocTypeSelectable(dt)
      );
      if (ordered.length === 0) {
        ElMessage.warning('请先勾选要提取的文档类型');
        return;
      }
      this.batchExtracting = true;
      let success = 0;
      let skipped = 0;
      let failed = 0;
      let extractN = 0;
      let reextractN = 0;
      try {
        for (const docType of ordered) {
          const source = this.resolveExtractSource(docType);
          if (!source || !source.file) {
            skipped += 1;
            continue;
          }
          if (source.needConfirm) {
            const label = (this.docTypes[docType] && this.docTypes[docType].label) || docType;
            try {
              await ElMessageBox.confirm(
                `「${label}」未找到转换后的 MD，是否使用已上传的 md/txt（${source.file.filename}）提取？`,
                '未找到转换后 MD',
                {
                  confirmButtonText: '使用 md/txt 提取',
                  cancelButtonText: '跳过',
                  type: 'warning'
                }
              );
            } catch (_) {
              skipped += 1;
              continue;
            }
          }
          const isReextract = source.file.status === 'success' || source.file.status === 'done';
          await this.extractFile(source.file.id, docType);
          const updated = Object.values(this.files).flat().find(f => f && f.id === source.file.id);
          if (updated && (updated.status === 'success' || updated.status === 'done')) {
            success += 1;
            if (isReextract) reextractN += 1;
            else extractN += 1;
          } else {
            failed += 1;
          }
        }
        const parts = [`成功 ${success}`, `跳过 ${skipped}`, `失败 ${failed}`];
        if (extractN || reextractN) {
          parts.push(`（提取 ${extractN} / 重新提取 ${reextractN}）`);
        }
        if (failed > 0) {
          ElMessage.warning(`一键提取结束：${parts.join('，')}`);
        } else {
          ElMessage.success(`一键提取结束：${parts.join('，')}`);
        }
      } finally {
        this.batchExtracting = false;
      }
    },
    /**
     * 是否显示「提取」按钮（可提取类型 + 已就绪状态）
     * @param {Object} fileItem
     * @param {string} docType
     * @returns {boolean}
     */
    canShowExtractButton(fileItem, docType) {
      if (!fileItem || this.isLocked) return false;
      if (!this.isExtractableFile(fileItem.filename, docType)) return false;
      const ok = ['uploaded', 'done', 'success', 'error'];
      return ok.includes(fileItem.status);
    },
    /**
     * 等待文件出现 md 正文（转换完成后）
     * @param {string} fileId
     * @param {number} [timeoutMs]
     * @returns {Promise<Object>}
     */
    async waitFileHasContent(fileId, timeoutMs = 600000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        await this.loadFiles();
        const allFiles = Object.values(this.files).flat();
        const file = allFiles.find(f => f && f.id === fileId);
        if (!file) throw new Error('文件不存在');
        if (file.status === 'convert_failed') {
          throw new Error(file.errorMsg || '转换失败');
        }
        if (this.hasFileContent(file)
          && ['uploaded', 'done', 'success', 'error'].includes(file.status)) {
          return file;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      throw new Error('等待转换超时，请稍后重试');
    },
    /**
     * 提取单个文件的信息；若尚无 MD（如历史图片仅存），先触发 MineRU 转换
     * @param {number|string} fileId - 文件ID
     * @param {string} docType - 文档类型
     */
    async extractFile(fileId, docType) {
      // 从文件列表中查找该文件
      const allFiles = Object.values(this.files).flat();
      let file = allFiles.find(f => f.id === fileId);
      if (!file) return;

      try {
        if (!this.hasFileContent(file) && Utils.needsMineruFile(file.filename, docType)) {
          ElMessage.info('尚未转换 Markdown，正在提交转换…');
          await DB.retryFile(fileId);
          this.startPolling();
          file = await this.waitFileHasContent(fileId);
        }
        if (!this.hasFileContent(file)) {
          throw new Error('文件无可用正文，请重新上传后再提取');
        }

        await DB.updateFileStatus(fileId, 'extracting');
        await this.loadFiles();
        const result = await Extract.extractFromDocument(docType, file.content);
        await DB.updateFileExtracted(fileId, result);
        this.mergedResult = await Extract.mergeExtractedData(this.projectId, { preferExtracted: true });
        await this.loadFiles();
        ElMessage.success('提取完成');
        // 按文档类型控制标段检测时机：
        // tender_doc 提取完成后重新检测标段（权威来源）
        // win_notice/win_public 提取完成后只做分配标段号
        if (docType === 'tender_doc') {
          await this.autoDetectSegments();
        } else if (docType === 'win_notice' || docType === 'win_public' || docType === 'evaluation') {
          if (this.segments.length > 1) {
            await this.autoAssignFileSegments(fileId);
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
          // 状态变更后刷新合并数据（新提取完成，优先采用提取结果）
          this.mergedResult = await Extract.mergeExtractedData(this.projectId, { preferExtracted: true });
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
     * 重新上传：删除当前文件并清除提取结果（本地及 NAS 副本各自尽力删除），随后可再选文件
     * @param {number|string} fileId - 文件ID
     */
    async reupload(fileId) {
      await ElMessageBox.confirm('确定要重新上传吗？当前文件、本地/NAS 副本和提取结果将被清除。', '确认重新上传', {
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

    // ==================== 导入方式 / 从文件夹导入 ====================

    /**
     * 打开「导入方式」选择弹窗
     */
    openImportMethod() {
      if (this.isLocked) return;
      this.importMethodVisible = true;
    },

    /**
     * 选择导入方式
     * @param {'cards'|'folder'} method
     */
    chooseImportMethod(method) {
      this.importMethodVisible = false;
      if (method === 'folder') {
        this.$nextTick(() => this.triggerFolderImport());
        return;
      }
      // 逐个上传：滚动到文件卡片区域，由用户按类别选择文件
      const anchor = this.$refs.fileListAnchor;
      if (anchor && anchor.scrollIntoView) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      ElMessage.info('请在下方对应文档类型的卡片中点击「选择文件」（可精确指定类型，支持随时补传/覆盖）');
    },

    /**
     * 打开文件夹选择（触发隐藏 input）
     */
    triggerFolderImport() {
      if (this.isLocked) return;
      const input = this.$refs.folderInput;
      if (input) {
        input.value = '';
        input.click();
      }
    },

    /**
     * 文件夹选择后：扫描 + 规则归类
     * @param {Event} event
     */
    async handleFolderScan(event) {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (files.length === 0) return;

      this.folderScanning = true;
      try {
        if (!this.archiveTemplates.length) {
          await this.loadArchiveTemplates();
        }
        this.syncClassifyTemplate();
        const result = Classify.scan(files);
        this.folderItems = result.items;
        this.folderJunkCount = result.junkCount;
        this.folderUnsupportedCount = result.unsupportedCount;
        this.folderTruncated = result.truncated;
        this.folderOverwriteAll = null;
        this.folderCurrentLoaded = 0;
        this.folderCurrentTotal = 0;
        this.folderRunIndex = 0;
        this.folderRunTotal = 0;
        this.folderImportVisible = true;
        if (result.items.length === 0) {
          ElMessage.warning('所选文件夹中没有可导入的文件');
        } else {
          const pending = this.folderPendingCount;
          ElMessage.success(`已识别 ${result.items.length - pending} / ${result.items.length} 个文件` +
            (pending > 0 ? `，${pending} 个待确认或可 AI 识别` : ''));
        }
      } catch (error) {
        ElMessage.error('扫描文件夹失败: ' + error.message);
      } finally {
        this.folderScanning = false;
      }
    },

    /**
     * AI 识别未分类文件（兜底）
     */
    async runFolderAiClassify() {
      if (this.folderAiRunning) return;
      const pending = this.folderItems.filter(it => !it.docType);
      if (pending.length === 0) {
        ElMessage.info('没有需要 AI 识别的文件');
        return;
      }
      this.folderAiRunning = true;
      this.folderAiProgress = 0;
      let ok = 0;
      let failed = 0;
      for (const item of pending) {
        item.aiLoading = true;
        try {
          const result = await Classify.aiClassify(item.file);
          item.docType = result.docType;
          item.confidence = result.confidence;
          item.reason = result.reason;
          item.source = 'ai';
          ok += 1;
        } catch (error) {
          item.reason = 'AI 识别失败：' + error.message;
          failed += 1;
        } finally {
          item.aiLoading = false;
          this.folderAiProgress += 1;
        }
      }
      this.folderAiRunning = false;
      if (failed > 0) {
        ElMessage.warning(`AI 识别完成：成功 ${ok}，失败 ${failed}（可手动指定类型）`);
      } else {
        ElMessage.success(`AI 识别完成：${ok} 个文件`);
      }
    },

    /**
     * 确认导入：上传尚未完成的文件（成功后自动查看结果）
     */
    async confirmFolderImport() {
      if (this.folderImporting) return;
      if (this.folderPendingCount > 0) {
        ElMessage.warning('仍有文件未指定类型，请先补全');
        return;
      }
      const targets = this.folderItems.filter(
        it => !['uploaded', 'overwritten', 'skipped'].includes(it.uploadStatus)
      );
      if (targets.length === 0) {
        ElMessage.info('没有待上传的文件');
        return;
      }
      await this.runFolderUpload(targets);
    },

    /**
     * 重试失败文件
     */
    async retryFolderFailed() {
      if (this.folderImporting) return;
      const targets = this.folderFailedItems;
      if (targets.length === 0) {
        ElMessage.info('没有需要重试的文件');
        return;
      }
      await this.runFolderUpload(targets);
    },

    /**
     * 批量上传：逐文件串行，按真实字节更新进度；失败项保留可重试状态
     * @param {Array} targets
     */
    async runFolderUpload(targets) {
      if (this.folderImporting || !Array.isArray(targets) || targets.length === 0) return;
      this.folderImporting = true;
      this.folderOverwriteAll = null;
      this.folderCurrentLoaded = 0;
      this.folderCurrentTotal = 0;
      this.folderRunTotal = targets.length;

      let uploaded = 0;
      let overwritten = 0;
      let skipped = 0;
      let failed = 0;

      try {
        for (let i = 0; i < targets.length; i++) {
          const item = targets[i];
          item.uploadStatus = 'uploading';
          item.errorMsg = '';
          item.retryable = false;
          this.folderCurrentLoaded = 0;
          this.folderCurrentTotal = (item.file && item.file.size) || 0;
          this.folderRunIndex = i + 1;
          try {
            const outcome = await this._uploadFolderItem(item);
            item.uploadStatus = outcome;
            if (outcome === 'uploaded') uploaded += 1;
            else if (outcome === 'overwritten') overwritten += 1;
            else skipped += 1;
          } catch (error) {
            failed += 1;
            item.uploadStatus = 'failed';
            item.errorMsg = error.message;
            // 网络中断/超时/服务端 5xx → 可重试，界面保留失败态而非完成
            item.retryable = !!(error.retryable || error.network
              || error.status === undefined || error.status >= 500);
          } finally {
            this.folderCurrentLoaded = 0;
            this.folderCurrentTotal = 0;
          }
        }
      } finally {
        this.folderImporting = false;
      }

      await this.loadFiles();
      if (uploaded + overwritten + skipped > 0) {
        this.startPolling();
      }

      const parts = [];
      if (uploaded > 0) parts.push(`上传 ${uploaded}`);
      if (overwritten > 0) parts.push(`覆盖 ${overwritten}`);
      if (skipped > 0) parts.push(`跳过 ${skipped}`);
      if (failed > 0) parts.push(`失败 ${failed}`);

      if (failed > 0) {
        ElMessage.warning('导入未全部完成：' + parts.join('，') + '，可对失败文件重试');
      } else {
        ElMessage.success('导入完成：' + parts.join('，'));
        this.finishFolderImport();
      }
    },

    /**
     * 结束导入：关闭导入弹窗并打开结果汇总
     */
    finishFolderImport() {
      this.folderImportVisible = false;
      this.folderResultDismissed = false;
      this.folderResultVisible = true;
    },

    /**
     * 上传单个文件夹项（含重复文件统一策略 + 真实进度回调）
     * @param {Object} item
     * @returns {Promise<'uploaded'|'overwritten'|'skipped'>}
     */
    async _uploadFolderItem(item) {
      const segNo = (this.isMultiSegment && (
        item.docType === 'win_notice' || item.docType === 'win_public' || item.docType === 'evaluation'
      ))
        ? (item.segmentNo || 0)
        : 0;

      const onProgress = (loaded, total) => {
        this.folderCurrentLoaded = loaded;
        this.folderCurrentTotal = total;
      };

      const doUpload = async (overwrite) => {
        const result = await DB.uploadFile(this.projectId, item.docType, item.file, segNo, {
          overwrite,
          onProgress,
          folderKey: item.folderKey || ''
        });
        return result.overwritten ? 'overwritten' : 'uploaded';
      };

      try {
        return await doUpload(false);
      } catch (error) {
        if (error.status !== 409) throw error;
        // 统一询问一次覆盖策略
        if (this.folderOverwriteAll === null) {
          let decision = false;
          try {
            await ElMessageBox.confirm(
              '检测到与已有文件重名的文件。是否全部覆盖（否则跳过所有重复文件）？',
              '存在重复文件',
              { confirmButtonText: '全部覆盖', cancelButtonText: '全部跳过', type: 'warning' }
            );
            decision = true;
          } catch {
            decision = false;
          }
          this.folderOverwriteAll = decision;
        }
        if (!this.folderOverwriteAll) return 'skipped';
        return await doUpload(true);
      }
    },

    /**
     * 字节数格式化（自适应 KB / MB）
     * @param {number} bytes
     * @returns {string}
     */
    _formatSize(bytes) {
      const b = Number(bytes) || 0;
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / (1024 * 1024)).toFixed(2) + ' MB';
    },

    /**
     * 关闭导入结果面板
     */
    closeFolderResult() {
      this.folderResultVisible = false;
      this.folderResultDismissed = true;
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
        this.segmentDirty = false;
      } catch {
        this.segments = [];
      } finally {
        this._segmentsReady = true;
      }
    },

    /**
     * 保存标段配置
     * @param {{ removedIndex?: number, silent?: boolean }} [options]
     * @returns {Promise<boolean>}
     */
    async saveSegments(options = {}) {
      if (this.segmentSaving) {
        this._segmentSaveQueued = options;
        return true;
      }
      this.segmentSaving = true;
      try {
        const body = { segments: this.segments };
        if (Number.isInteger(options.removedIndex)) {
          body.removedIndex = options.removedIndex;
        }
        await Http.put(`/projects/${this.projectId}/segments`, body);
        this.segmentDirty = false;
        if (!options.silent) ElMessage.success('标段配置已保存');
        return true;
      } catch (error) {
        ElMessage.error('保存标段失败: ' + error.message);
        return false;
      } finally {
        this.segmentSaving = false;
        if (this._segmentSaveQueued) {
          const queued = this._segmentSaveQueued;
          this._segmentSaveQueued = null;
          this.saveSegments(queued);
        }
      }
    },

    /**
     * 标段名称编辑：标记未保存，并防抖自动保存
     */
    markSegmentDirty() {
      if (!this._segmentsReady || this.isLocked) return;
      this.segmentDirty = true;
      if (this.segmentSaveTimer) clearTimeout(this.segmentSaveTimer);
      this.segmentSaveTimer = setTimeout(() => {
        this.segmentSaveTimer = null;
        if (this.segmentDirty && !this.isLocked) {
          this.saveSegments({ silent: true });
        }
      }, 600);
    },

    /**
     * 名称输入框失焦/回车时立即保存，避免切页丢数据
     */
    saveSegmentNameNow() {
      if (!this._segmentsReady || this.isLocked || !this.segmentDirty) return;
      if (this.segmentSaveTimer) {
        clearTimeout(this.segmentSaveTimer);
        this.segmentSaveTimer = null;
      }
      this.saveSegments({ silent: true });
    },

    /**
     * 添加标段：结构变化后立即保存，避免切页丢失
     */
    addSegment() {
      if (this.isLocked) return;
      this.segments.push({ name: '' });
      this.segmentDirty = true;
      if (this.segmentSaveTimer) {
        clearTimeout(this.segmentSaveTimer);
        this.segmentSaveTimer = null;
      }
      this.saveSegments({ silent: true });
    },

    /**
     * 删除标段：有文件归属（含后续标段）时阻止，避免标段号错位
     * @param {number} index - 标段索引
     */
    async removeSegment(index) {
      if (this.isLocked) return;
      const affected = Object.values(this.files)
        .flat()
        .filter((f) => f && (Number(f.segmentNo) || 0) >= index + 1);
      if (affected.length > 0) {
        ElMessage.warning(
          `该标段或其后续标段下已有 ${affected.length} 个文件，删除会导致标段错位，请先调整或删除相关文件`
        );
        return;
      }

      this.segments.splice(index, 1);
      this.segmentDirty = true;
      if (this.segmentSaveTimer) {
        clearTimeout(this.segmentSaveTimer);
        this.segmentSaveTimer = null;
      }
      const ok = await this.saveSegments({ removedIndex: index, silent: true });
      if (!ok) {
        await this.loadSegments();
        this.segmentDirty = false;
      }
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
     * 保存所属地域（省份）
     */
    async saveRegion() {
      try {
        await Http.put(`/projects/${this.projectId}/region`, { region: this.region || '' });
        ElMessage.success('所属地域已保存');
      } catch (error) {
        ElMessage.error('保存所属地域失败: ' + error.message);
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
        ...(this.files['win_public'] || []),
        ...(this.files['evaluation'] || [])
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
     * 手动选择文件所属标段并实时保存（1-based）
     * @param {Object} fileItem
     * @param {number} segmentNo
     */
    async onFileSegmentChange(fileItem, segmentNo) {
      if (!fileItem || this.isLocked) return;
      const prev = Number(fileItem.segmentNo) || 0;
      const segNo = parseInt(segmentNo, 10) || 0;
      if (segNo === prev) return;
      try {
        await DB.updateFileSegmentNo(fileItem.id, segNo);
        fileItem.segmentNo = segNo;
      } catch (error) {
        fileItem.segmentNo = prev;
        ElMessage.error('保存标段失败: ' + (error.message || '未知错误'));
      }
    },

    /**
     * 自动为中标通知书和中标公示文件分配标段号（1-based）
     * 优先级：提取结果中的 segmentName > 手动已保存的标段
     * - 能匹配到标段名称时覆盖手动选择
     * - 无 segmentName 或未匹配时保留手动选择
     * @param {string} [onlyFileId] - 仅处理指定文件（单文件提取后）
     */
    async autoAssignFileSegments(onlyFileId) {
      if (this.segments.length <= 1) return;

      const winFiles = [
        ...(this.files['win_notice'] || []),
        ...(this.files['win_public'] || []),
        ...(this.files['evaluation'] || [])
      ].filter(f => {
        if (!f || (f.status !== 'done' && f.status !== 'success')) return false;
        if (onlyFileId && f.id !== onlyFileId) return false;
        return true;
      });

      for (const file of winFiles) {
        let data = file.extracted;
        if (!data) continue;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) { continue; }
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
     * @param {string} name - 待匹配的标段名称
     * @returns {number} 标段号（1-based）或 0
     */
    _fuzzyMatchSegment(name) {
      return Utils.fuzzyMatchSegmentName(name, this.segments);
    }
  },
  template: `
    <div class="page-container" v-loading="loading">
      <div class="page-crumb">
        <a href="javascript:;" @click="navigateTo('#/projects')">归档项目</a>
        <span>/</span>
        <template v-if="project && project.masterProjectName">
          <a href="javascript:;" @click="goMasterProject">{{ project.masterProjectName }}</a>
          <span>/</span>
          <b>{{ project.projectName }}</b>
        </template>
        <template v-else>
          <span class="ap-unassigned">未归属</span>
          <span>/</span>
          <b>{{ project ? project.projectName : '' }}</b>
        </template>
      </div>
      <!-- 页头：返回 + 可编辑标题 + 状态 -->
      <div class="page-head">
        <el-button text @click="navigateTo('#/projects')">← 返回列表</el-button>
        <span v-if="!editingName" class="head-title" @click="startEditName" title="点击重命名">
          {{ project ? project.projectName : '' }}
        </span>
        <template v-else>
          <el-input v-model="tempName" size="small" style="width: 240px;" @keyup.enter="saveName" />
          <el-button text size="small" @click="saveName">保存</el-button>
          <el-button text size="small" @click="editingName = false">取消</el-button>
        </template>
        <el-tag v-if="isPendingReview" type="warning" size="small">待审核</el-tag>
        <el-tag v-else-if="isPendingPaper" type="warning" size="small">待纸质核对</el-tag>
        <el-tag v-else-if="isArchived" type="info" size="small">只读</el-tag>
      </div>

      <div v-if="project" class="project-head-meta">
        <span>服务类型<b>{{ project.categoryName || '—' }}</b></span>
        <span>归档状态<b>{{ projectStatusLabel }}</b></span>
        <span>负责人<b>{{ project.createdByName || '—' }}</b></span>
        <span>更新于<b>{{ headUpdatedAt }}</b></span>
      </div>

      <div
        v-if="isArchived && project && project.reviewComment"
        class="review-comment-display"
      >
        <strong>审核意见：</strong>{{ project.reviewComment }}
      </div>

      <!-- 进度条：仅统计可提取类型；仅存类型单独显示「已上传」 -->
      <div class="progress-section">
        <el-progress
          :percentage="(extractedCount / Math.max(extractableTotalCount, 1)) * 100"
          :format="() => progressFormatText"
        />
      </div>

      <!-- 主体区域 -->
      <div class="project-content">
        <!-- 左侧文件列表（配置区置于列表顶部试排） -->
        <div class="file-list" ref="fileListAnchor">
          <!-- 项目编号 / 地域 / 采购类型 / 标段配置 -->
          <div class="config-section">
            <div style="width: 100%; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; color: #606266; white-space: nowrap;">项目编号：</span>
              <el-tag
                :size="hasAssignedProjectNo ? 'default' : 'small'"
                :type="hasAssignedProjectNo ? undefined : 'success'"
                :class="{ 'project-no-tag--assigned': hasAssignedProjectNo }"
              >{{ hasAssignedProjectNo ? project.projectNo : '（历史项目，归档时分配）' }}</el-tag>
            </div>

            <div style="width: 100%; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; color: #606266; white-space: nowrap;">所属地域：</span>
              <el-select
                v-model="region"
                size="small"
                style="width: 200px;"
                filterable
                placeholder="请选择省份"
                @change="saveRegion"
                :disabled="!canEditRegionProcurement"
              >
                <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
              </el-select>
              <el-tag v-if="!canEditRegionProcurement" size="small" type="info">只读</el-tag>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; color: #606266; white-space: nowrap;">采购类型：</span>
              <el-select
                v-model="procurementType"
                size="small"
                style="width: 140px;"
                @change="saveProcurementType"
                :disabled="!canEditRegionProcurement"
              >
                <el-option label="工程(G)" value="G" />
                <el-option label="货物(H)" value="H" />
                <el-option label="服务(F)" value="F" />
              </el-select>
              <el-tag v-if="!canEditRegionProcurement" size="small" type="info">只读</el-tag>
            </div>

            <div style="width: 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 13px; color: #606266; white-space: nowrap;">归档模板：</span>
              <el-select
                v-model="archiveTemplateSelect"
                size="small"
                style="width: 220px;"
                :disabled="!canEditArchiveTemplate"
                :loading="archiveTemplateSaving"
              >
                <el-option :label="'自动（' + resolvedArchiveTemplateLabel + '）'" value="__auto__" />
                <el-option
                  v-for="t in archiveTemplateOptions"
                  :key="t.value"
                  :label="t.label"
                  :value="t.value"
                />
              </el-select>
              <el-tag v-if="!archiveTemplate" size="small" type="info">自动：{{ resolvedArchiveTemplateLabel }}</el-tag>
              <el-tag v-if="!canEditArchiveTemplate" size="small" type="info">只读</el-tag>
            </div>

            <el-button size="small" @click="showSegmentConfig = !showSegmentConfig">
              {{ showSegmentConfig ? '收起标段配置' : (isLocked ? '查看标段' : '配置多标段') }}
            </el-button>

            <div v-if="showSegmentConfig" style="width: 100%; background: #fff; border-radius: 8px; padding: 12px 16px; border: 1px solid #e4e7ed;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 13px; font-weight: 500;">标段列表（共 {{ segments.length }} 个）</span>
                <el-button v-if="!isLocked" size="small" type="primary" plain @click="addSegment">+ 添加标段</el-button>
              </div>
              <div v-for="(seg, idx) in segments" :key="idx" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 13px; color: #909399; min-width: 50px;">标段{{ idx + 1 }}</span>
                <el-input v-model="seg.name" size="small" placeholder="标段名称（如：一标段）" style="flex: 1;" :disabled="isLocked" @input="markSegmentDirty" @change="saveSegmentNameNow" />
                <el-button v-if="!isLocked" size="small" text type="danger" @click="removeSegment(idx)" :disabled="segments.length <= 1 || segmentSaving">删除</el-button>
              </div>
              <div v-if="segmentDirty && !isLocked" class="segment-dirty-bar">
                标段配置已修改，请保存
              </div>
              <el-button
                v-if="!isLocked"
                size="small"
                type="primary"
                @click="saveSegments()"
                :loading="segmentSaving"
                style="margin-top: 8px; width: 100%;"
              >保存标段配置</el-button>
            </div>

            <div class="project-master-inline">
              <span class="project-master-label">所属工程项目：</span>
              <template v-if="project && project.masterProjectName">
                <span class="project-master-name">{{ project.masterProjectName }}</span>
                <el-button v-if="canChangeMasterAssignment()" text size="small" @click="openMasterDialog">更换</el-button>
              </template>
              <template v-else>
                <span class="ap-unassigned">未归属</span>
                <el-button v-if="canChangeMasterAssignment()" text size="small" @click="openMasterDialog">归入工程</el-button>
              </template>
              <span v-if="project && !project.region" class="project-region-warning">未设置地域，归档前需在下方补充</span>
            </div>
          </div>

          <!-- 顶部：全选 + 一键提取 + 从文件夹导入 -->
          <div v-if="!isLocked" class="file-list-toolbar">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="isSelectIndeterminate"
              :disabled="eligibleDocTypes.length === 0 || batchExtracting"
              @change="toggleSelectAll"
            >全选</el-checkbox>
            <el-button
              type="primary"
              size="small"
              :loading="batchExtracting"
              :disabled="selectedCount === 0"
              @click="batchExtract"
            >一键提取</el-button>
            <el-button
              v-if="isTenderProject"
              size="small"
              :loading="folderScanning"
              @click="openImportMethod"
            >导入文件</el-button>
            <el-button
              v-if="folderResultDismissed && (folderMissingRequired.length || folderProblemFiles.length)"
              size="small"
              type="warning"
              plain
              @click="folderResultDismissed = false; folderResultVisible = true"
            >导入结果</el-button>
            <input
              ref="folderInput"
              type="file"
              webkitdirectory
              directory
              multiple
              hidden
              @change="handleFolderScan"
            />
          </div>
          <div class="file-card-wrap file-list-format-hint-wrap">
            <div v-if="!isLocked" class="file-list-format-hint-spacer" aria-hidden="true"></div>
            <div class="file-list-format-hint">以下允许上传的文件格式：{{ allowedUploadExtHint }}</div>
          </div>

          <div v-for="(info, docType) in displayDocTypes" :key="docType" class="file-card-wrap">
            <el-checkbox
              v-if="!isLocked"
              class="file-card-check"
              :model-value="!!selectedDocTypes[docType]"
              :disabled="!isDocTypeSelectable(docType) || batchExtracting"
              @change="setDocTypeSelected(docType, $event)"
            />
            <div class="file-card">
            <div class="file-card-header">
              <span>{{ info.label }}</span>
              <el-tag v-if="info.required" size="small" type="danger">必传</el-tag>
              <el-tag v-else size="small" type="info">可选</el-tag>
              <el-tag size="small" type="info" style="margin-left: 4px;">{{ (files[docType] || []).length }} 个文件</el-tag>
            </div>

            <div class="file-card-body">
              <!-- 已上传文件：每文件一行；操作区靠右对齐 -->
              <div class="file-rows">
                <div v-for="fileItem in (files[docType] || [])" :key="fileItem.id" class="file-row">
                  <div class="file-row-name">
                    <span class="file-name-text" :title="fileItem.filename">{{ fileItem.filename }}</span>
                    <el-select
                      v-if="isMultiSegment && (docType === 'win_notice' || docType === 'evaluation')"
                      :model-value="fileItem.segmentNo"
                      size="small"
                      placeholder="选择标段"
                      class="file-segment-select"
                      :disabled="isLocked"
                      @change="(val) => onFileSegmentChange(fileItem, val)"
                    >
                      <el-option v-for="(seg, si) in segments" :key="si" :label="seg.name || ('标段'+(si+1))" :value="si + 1" />
                    </el-select>
                  </div>

                  <div class="file-row-actions">
                    <!-- 已归档：仅展示状态 + 查看链接 -->
                    <template v-if="isLocked">
                      <span v-if="fileItem.status === 'done' || fileItem.status === 'success'" class="extract-success">提取完成</span>
                      <span v-else-if="fileItem.status === 'uploaded' && !isExtractableFile(fileItem.filename, docType)" class="extract-success">已上传</span>
                      <span v-else-if="fileItem.status === 'error'" class="extract-error"> {{ fileItem.errorMsg || '提取失败' }}</span>
                      <span v-else-if="fileItem.status === 'convert_failed'" class="extract-error"> {{ getFileProcessFailLabel(fileItem.filename, docType) }}</span>
                      <a
                        v-if="canViewStoredFile(fileItem)"
                        class="file-view-link"
                        :href="getFileViewUrl(fileItem.id)"
                        target="_blank"
                        rel="noopener"
                      >查看</a>
                      <span v-else class="extract-error" title="文件尚未上传至存储">暂无链接</span>
                    </template>

                    <!-- 排队中 -->
                    <template v-else-if="fileItem.status === 'pending'">
                      <el-button size="small" loading>排队中...</el-button>
                      <el-button size="small" @click="reupload(fileItem.id)">取消</el-button>
                    </template>

                    <!-- 转换/处理中 -->
                    <template v-else-if="fileItem.status === 'converting'">
                      <el-button size="small" loading>{{ isExtractableFile(fileItem.filename, docType) ? '转换中...' : '处理中...' }}</el-button>
                    </template>

                    <!-- 处理完成：可提取类型显示「提取」；仅存类型显示「已上传」 -->
                    <template v-else-if="fileItem.status === 'uploaded'">
                      <span v-if="!canShowExtractButton(fileItem, docType)" class="extract-success">已上传</span>
                      <span v-if="isRealErrorMsg(fileItem.errorMsg)" class="extract-error" :title="fileItem.errorMsg"> {{ fileItem.errorMsg }}</span>
                      <a
                        v-if="canViewStoredFile(fileItem)"
                        class="file-view-link"
                        :href="getFileViewUrl(fileItem.id)"
                        target="_blank"
                        rel="noopener"
                      >查看</a>
                      <el-button
                        v-if="canShowExtractButton(fileItem, docType)"
                        size="small"
                        type="primary"
                        @click="extractFile(fileItem.id, docType)"
                      >提取</el-button>
                      <el-button
                        v-if="isMineruConvertFile(fileItem.filename, docType) && !hasFileContent(fileItem)"
                        size="small"
                        @click="retryConvert(fileItem.id)"
                      >转换</el-button>
                      <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                    </template>

                    <!-- 队列处理失败：需 MineRU 转换显示转换失败，其余显示上传失败 -->
                    <template v-else-if="fileItem.status === 'convert_failed'">
                      <span class="extract-error" :title="fileItem.errorMsg || '未知错误'"> {{ getFileProcessFailLabel(fileItem.filename, docType) }}</span>
                      <el-button size="small" type="primary" @click="retryConvert(fileItem.id)">重试</el-button>
                      <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                    </template>

                    <!-- 提取中 -->
                    <template v-else-if="fileItem.status === 'extracting'">
                      <el-button size="small" loading>提取中...</el-button>
                    </template>

                    <!-- 提取完成 -->
                    <template v-else-if="fileItem.status === 'done' || fileItem.status === 'success'">
                      <span class="extract-success">提取完成（{{ extractedFieldCount(fileItem.id) }} 字段）</span>
                      <a
                        v-if="canViewStoredFile(fileItem)"
                        class="file-view-link"
                        :href="getFileViewUrl(fileItem.id)"
                        target="_blank"
                        rel="noopener"
                      >查看</a>
                      <el-button v-if="canShowExtractButton(fileItem, docType)" size="small" @click="extractFile(fileItem.id, docType)">重新提取</el-button>
                      <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                    </template>

                    <!-- 提取失败 -->
                    <template v-else-if="fileItem.status === 'error'">
                      <span class="extract-error" :title="fileItem.errorMsg || '提取失败'"> {{ fileItem.errorMsg || '提取失败' }}</span>
                      <el-button v-if="canShowExtractButton(fileItem, docType)" size="small" type="primary" @click="extractFile(fileItem.id, docType)">重试</el-button>
                      <el-button size="small" @click="reupload(fileItem.id)">重新上传</el-button>
                    </template>

                    <el-button v-if="!isLocked" size="small" type="danger" plain @click="deleteUploadedFile(fileItem.id)">删除</el-button>
                    <el-checkbox
                      v-if="canMarkPaperFile(fileItem)"
                      :model-value="!!fileItem.hasPaper"
                      :disabled="isLocked"
                      class="paper-checkbox"
                      @change="(val) => onFileHasPaperChange(fileItem, val)"
                    >含纸质</el-checkbox>
                  </div>
                </div>
              </div>

              <!-- 上传按钮始终在列表最后一行（已归档隐藏） -->
              <label v-if="!isLocked" class="upload-btn">
                {{ (files[docType] || []).length > 0 ? '继续添加' : '选择文件' }}
                <input type="file" :accept="fileAcceptAttr" multiple hidden @change="handleFileUpload(docType, $event)" />
              </label>
            </div>
            </div>
          </div>

          <!-- 底部：全选 + 一键提取（与顶部同步） -->
          <div v-if="!isLocked" class="file-list-toolbar">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="isSelectIndeterminate"
              :disabled="eligibleDocTypes.length === 0 || batchExtracting"
              @change="toggleSelectAll"
            >全选</el-checkbox>
            <el-button
              type="primary"
              size="small"
              :loading="batchExtracting"
              :disabled="selectedCount === 0"
              @click="batchExtract"
            >一键提取</el-button>
          </div>
        </div>

        <!-- 右侧：已提取预览 + 审核信息 -->
        <div class="preview-side">
          <div class="preview-panel">
            <h3>已提取信息预览</h3>
            <div v-if="previewFields.length > 0" class="preview-list">
              <div v-for="item in previewFields" :key="item.label" class="preview-item">
                <span class="preview-label">{{ item.label }}：</span>
                <span class="preview-value">{{ item.value }}</span>
              </div>
              <el-button
                type="primary"
                style="margin-top:16px"
                :disabled="batchExtracting"
                @click="navigateTo('#/review/' + projectId)"
              >
                {{ batchExtracting ? '提取中…' : '查看完整表单 →' }}
              </el-button>
            </div>
            <div v-else class="preview-empty">
              上传文件并提取后，信息将显示在这里
            </div>
          </div>

          <!-- 2026-08-27: 审核信息（状态 + 备注） -->
          <div class="review-info-panel">
            <h3>审核信息</h3>
            <div class="review-info-list">
              <div class="review-info-item">
                <span class="preview-label">审核状态：</span>
                <el-tag size="small" :type="reviewStatusTagType">{{ reviewStatusLabel }}</el-tag>
              </div>
              <div class="review-info-item">
                <span class="preview-label">审核备注：</span>
                <span class="preview-value review-info-comment">{{ reviewCommentText }}</span>
              </div>
              <div v-if="project && project.reviewedByName" class="review-info-item">
                <span class="preview-label">审核人：</span>
                <span class="preview-value">{{ project.reviewedByName }}</span>
              </div>
              <div v-if="project && project.reviewedAt" class="review-info-item">
                <span class="preview-label">审核时间：</span>
                <span class="preview-value">{{ project.reviewedAt }}</span>
              </div>
              <div v-if="project && project.paperReviewedByName" class="review-info-item">
                <span class="preview-label">纸质核对人：</span>
                <span class="preview-value">{{ project.paperReviewedByName }}</span>
              </div>
              <div v-if="project && project.paperReviewedAt" class="review-info-item">
                <span class="preview-label">纸质核对时间：</span>
                <span class="preview-value">{{ project.paperReviewedAt }}</span>
              </div>
              <div v-if="project && project.paperReviewComment" class="review-info-item">
                <span class="preview-label">纸质核对备注：</span>
                <span class="preview-value">{{ project.paperReviewComment }}</span>
              </div>
            </div>
            <div v-if="paperFilesForDisplay.length > 0" class="review-info-paper-section">
              <h4 class="review-info-paper-heading">含纸质文件</h4>
              <table class="paper-files-table">
                <thead>
                  <tr>
                    <th class="paper-file-category">所属分类</th>
                    <th class="paper-file-name">文件名</th>
                    <th class="paper-file-check">含纸质</th>
                    <th class="paper-file-check">确认收到</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pf in paperFilesForDisplay" :key="pf.id">
                    <td class="paper-file-category">{{ pf.categoryLabel }}</td>
                    <td class="paper-file-name" :title="pf.filename">{{ pf.filename }}</td>
                    <td class="paper-file-check">
                      <el-checkbox :model-value="true" disabled />
                    </td>
                    <td class="paper-file-check">
                      <el-checkbox :model-value="!!pf.paperReviewed" disabled />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 导入方式选择弹窗 -->
      <el-dialog
        v-model="importMethodVisible"
        title="选择导入方式"
        width="560px"
      >
        <div class="import-method-list">
          <div class="import-method-card" role="button" tabindex="0" @click="chooseImportMethod('cards')" @keydown.enter="chooseImportMethod('cards')">
            <div class="import-method-title">按类别逐个上传</div>
            <div class="import-method-desc">
              在下方各类别卡片中分别选择文件，可精确指定文档类型，适合文件较少或仅需补传、覆盖部分材料。
            </div>
          </div>
          <div class="import-method-card import-method-card--primary" role="button" tabindex="0" @click="chooseImportMethod('folder')" @keydown.enter="chooseImportMethod('folder')">
            <div class="import-method-title">从文件夹导入</div>
            <div class="import-method-desc">
              选择整个项目文件夹，系统按文件夹结构自动归类并批量上传，适合首次整体归档。文件较多或含大文件时耗时较长，可离开页面稍后回来查看进度。
            </div>
          </div>
        </div>
        <template #footer>
          <el-button @click="importMethodVisible = false">取消</el-button>
        </template>
      </el-dialog>

      <!-- 从文件夹导入：归类确认弹窗 -->
      <el-dialog
        v-model="folderImportVisible"
        title="从文件夹导入"
        width="880px"
        :close-on-click-modal="false"
      >
        <div class="folder-import-tip">
          共发现 <b>{{ folderItems.length }}</b> 个可导入文件
          <span v-if="folderUnsupportedCount > 0">，跳过 {{ folderUnsupportedCount }} 个不支持的格式</span>
          <span v-if="folderJunkCount > 0">，忽略 {{ folderJunkCount }} 个系统/临时文件</span>
          <span v-if="folderTruncated" style="color: #e6a23c;">，超出单次上限，仅保留部分文件</span>
        </div>

        <el-alert
          v-if="folderMissingRequired.length > 0"
          type="warning"
          :closable="false"
          show-icon
          :title="'缺失核心必传文件：' + folderMissingLabels.join('、')"
          style="margin-bottom: 12px;"
        />

        <div class="folder-import-actions">
          <el-button
            size="small"
            :loading="folderAiRunning"
            :disabled="folderPendingCount === 0 || folderAiRunning"
            @click="runFolderAiClassify"
          >AI 识别未分类（{{ folderPendingCount }}）</el-button>
          <span v-if="folderPendingCount > 0" class="folder-import-warn">
            仍有 {{ folderPendingCount }} 个文件未指定类型，请补全后再确认导入
          </span>
          <span v-else class="folder-import-ok">全部文件已归类</span>
        </div>

        <div v-if="folderImporting || folderLoadedBytes > 0" class="folder-upload-progress">
          <el-progress :percentage="folderUploadPercent" :stroke-width="14" />
          <div class="folder-upload-progress-text">
            <span v-if="folderImporting">
              正在上传第 {{ folderRunIndex }}/{{ folderRunTotal }} 个文件
            </span>
            <span>已上传 {{ folderUploadSizeText }}（{{ folderUploadPercent }}%）</span>
          </div>
        </div>

        <el-table :data="folderItems" size="small" max-height="420" style="width: 100%;">
          <el-table-column label="文件" min-width="260">
            <template #default="{ row }">
              <div class="folder-row-file" :title="row.relativePath">{{ row.relativePath }}</div>
              <div class="folder-row-reason">{{ row.reason }}</div>
            </template>
          </el-table-column>
          <el-table-column label="归类" width="210">
            <template #default="{ row }">
              <el-select v-model="row.docType" size="small" placeholder="请选择类型" filterable style="width: 100%;">
                <el-option
                  v-for="opt in folderDocTypeOptions"
                  :key="opt.value"
                  :label="opt.label + (opt.required ? '（必传）' : '')"
                  :value="opt.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="归档目录" width="180">
            <template #default="{ row }">
              <el-tag v-if="row.folderLabel" size="small" type="success">{{ row.folderLabel }}</el-tag>
              <span v-else class="folder-row-reason">按文档类型归位</span>
            </template>
          </el-table-column>
          <el-table-column v-if="isMultiSegment" label="标段" width="150">
            <template #default="{ row }">
              <el-select
                v-if="row.docType === 'win_notice' || row.docType === 'win_public' || row.docType === 'evaluation'"
                v-model="row.segmentNo"
                size="small"
                placeholder="标段"
                style="width: 100%;"
              >
                <el-option v-for="(seg, si) in segments" :key="si" :label="seg.name || ('标段' + (si + 1))" :value="si + 1" />
              </el-select>
              <span v-else style="color: #c0c4cc;">—</span>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="90">
            <template #default="{ row }">
<el-tag v-if="row.source === 'rule'" size="small" type="success">规则</el-tag>
                <el-tag v-else-if="row.source === 'folder'" size="small" type="success">目录</el-tag>
                <el-tag v-else-if="row.source === 'ai'" size="small" type="warning">AI</el-tag>
              <el-tag v-else-if="row.aiLoading" size="small" type="info">识别中</el-tag>
              <el-tag v-else size="small" type="danger">待定</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="上传状态" width="140">
            <template #default="{ row }">
              <span v-if="row.uploadStatus === 'uploaded'" class="folder-status-ok">已上传</span>
              <span v-else-if="row.uploadStatus === 'overwritten'" class="folder-status-ok">已覆盖</span>
              <span v-else-if="row.uploadStatus === 'skipped'" class="folder-status-muted">已跳过</span>
              <span v-else-if="row.uploadStatus === 'failed'" class="folder-status-err" :title="row.errorMsg">上传失败</span>
              <span v-else-if="row.uploadStatus === 'uploading'" class="folder-status-muted">上传中…</span>
              <span v-else class="folder-status-muted">待上传</span>
            </template>
          </el-table-column>
        </el-table>

        <template #footer>
          <div class="folder-import-footer">
            <span v-if="folderFailedItems.length > 0" class="folder-import-warn">
              {{ folderFailedItems.length }} 个文件上传失败，可重试
            </span>
            <span v-else-if="folderImporting" class="folder-import-progress">
              上传中 {{ folderRunIndex }}/{{ folderRunTotal }}
            </span>
            <span v-else></span>
            <div>
              <el-button
                v-if="folderFailedItems.length > 0 && !folderImporting"
                @click="retryFolderFailed"
              >重试失败项（{{ folderFailedItems.length }}）</el-button>
              <el-button
                v-if="folderFailedItems.length > 0 && !folderImporting"
                type="primary"
                @click="finishFolderImport"
              >完成并查看结果</el-button>
              <template v-else>
                <el-button @click="folderImportVisible = false" :disabled="folderImporting">取消</el-button>
                <el-button
                  type="primary"
                  :loading="folderImporting"
                  :disabled="folderPendingCount > 0 || folderItems.length === 0"
                  @click="confirmFolderImport"
                >确认导入（{{ folderItems.length }}）</el-button>
              </template>
            </div>
          </div>
        </template>
      </el-dialog>

      <!-- 从文件夹导入：结果汇总弹窗 -->
      <el-dialog
        v-model="folderResultVisible"
        title="导入结果"
        width="680px"
        @close="closeFolderResult"
      >
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px;">核心必传文件</h4>
          <template v-if="folderMissingRequired.length > 0">
            <el-tag
              v-for="label in folderMissingLabels"
              :key="label"
              type="warning"
              style="margin: 0 8px 8px 0;"
            >缺失：{{ label }}</el-tag>
            <div class="folder-result-hint">请通过逐类上传补充上述文件后再提交归档。</div>
          </template>
          <div v-else class="folder-result-ok">核心必传文件已齐全</div>
        </div>

        <div>
          <h4 style="margin: 0 0 8px;">问题文件（{{ folderProblemFiles.length }}）</h4>
          <el-table v-if="folderProblemFiles.length" :data="folderProblemFiles" size="small" max-height="260">
            <el-table-column label="分类" width="170">
              <template #default="{ row }">{{ row.label }}</template>
            </el-table-column>
            <el-table-column label="文件名" min-width="160">
              <template #default="{ row }"><span :title="row.filename">{{ row.filename }}</span></template>
            </el-table-column>
            <el-table-column label="问题" width="220">
              <template #default="{ row }">
                <span style="color: #f56c6c;">{{ row.statusText }}</span>
                <span v-if="row.errorMsg" :title="row.errorMsg" class="folder-row-reason"> {{ row.errorMsg }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button v-if="row.status === 'convert_failed'" size="small" @click="retryConvert(row.id)">重试</el-button>
                <el-button v-else size="small" @click="extractFile(row.id, row.docType)">重试</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="folder-result-hint">暂无转换/提取问题文件</div>
          <div class="folder-result-hint" style="margin-top: 12px;">
            文件转换完成后，可点击页面上的「一键提取」开始信息提取。
          </div>
        </div>

        <template #footer>
          <el-button type="primary" @click="closeFolderResult">关闭</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="showMasterDialog" title="所属工程项目" width="520px" destroy-on-close>
        <master-project-picker v-model="masterSelection" />
        <template #footer>
          <el-button @click="showMasterDialog = false">取消</el-button>
          <el-button type="primary" :loading="masterSaving" @click="submitMasterAssignment">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

// ============================================
// 复核表单页组件（ReviewPage）
// ============================================

/** 标段特有字段：这些字段按标段独立编辑，其余为共享字段 */
const SEGMENT_FIELDS = [
  'projectName',
  'entrustAmount',
  'winAmount',
  'winUnit',
  'winNoticeDate',
  'sealUnit',
  'publicDate',
  // 2026-10-25: 履约评价按标段填写
  'evalDate',
  'tenderUnit',
  'contactInfo'
];

/** 履约评价区块字段（按标段渲染） */
const EVALUATION_FIELDS = ['evalDate', 'tenderUnit', 'contactInfo'];

/**
 * 复核表单页组件（ReviewPage）
 * 展示项目提取的字段数据，支持用户复核、编辑、冲突解决、保存草稿及导出Excel
 * 支持单/多标段项目：标段特有字段在各标段卡片独立编辑，共享字段全局编辑
 */
app.component('review-page', {
  props: {
    projectId: { type: String, required: true },
    currentUser: { type: Object, default: null }
  },
  emits: ['open-settings'],
  data() {
    return {
      loading: true,
      project: null,
      formData: {},         // { fieldKey: value } — 共享字段 + 单标段时的全部字段
      fieldMeta: {},        // { fieldKey: { source, conflict, sources } } — 元数据
      activeGroups: [],     // 展开的折叠面板
      saving: false,
      submitting: false,
      rejecting: false,
      adminReviewComment: '',
      segments: [],           // 标段列表 [{name: '第一标段'}, ...]
      currentSegment: 0,      // 当前编辑的标段索引（0-based）
      segmentFormData: {},    // { 0: {...formData}, 1: {...formData} } 按标段
      isMultiSegment: false,  // 是否多标段项目
      procurementType: 'G',   // 采购内容类型：默认工程
      region: '',             // 所属地域（省份）
      projectFiles: [],       // 项目文件列表（含纸质审核）
      // ---- 自动保存 ----
      autoSaveTimer: null,
      autoSaveState: 'idle',  // idle | pending | saving | saved | error
      lastAutoSavedAt: null,
      _autoSaveReady: false,
      _savingAuto: false,
      _pendingAutoSave: false,
      _dirty: false,
      _pageHideHandler: null,
    };
  },
  computed: {
    /**
     * 字段分组列表
     */
    fieldGroups() {
      return Utils.FIELD_GROUPS.filter((g) =>
        Utils.FIELDS.some((f) => f.group === g.key && !SEGMENT_FIELDS.includes(f.key))
      );
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
     * 当前标段的特有字段数据
     */
    currentSegmentData() {
      return this.segmentFormData[this.currentSegment] || {};
    },
    /**
     * 复核页展示的标段列表（单标段时保证至少 1 项）
     */
    displaySegments() {
      if (this.segments.length > 0) return this.segments;
      return [{ name: '' }];
    },
    /**
     * 标段特有字段的字段定义列表（多标段时用于渲染各标段卡片）
     */
    segmentFieldDefs() {
      return Utils.FIELDS.filter(f => SEGMENT_FIELDS.includes(f.key) && !EVALUATION_FIELDS.includes(f.key));
    },
    /**
     * 履约评价字段定义（按标段渲染）
     */
    evaluationFieldDefs() {
      return Utils.FIELDS.filter(f => EVALUATION_FIELDS.includes(f.key));
    },
    /**
     * 底部自动保存状态文案
     */
    autoSaveLabel() {
      if (this.isFormLocked) return '';
      if (this.hasInvalidDates()) return '请先修正日期格式';
      if (this.autoSaveState === 'saving') return '自动保存中…';
      if (this.autoSaveState === 'error') return '自动保存失败，点击重试';
      if (this.lastAutoSavedAt) {
        const d = this.lastAutoSavedAt;
        return `已自动保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return this._dirty ? '有未保存修改' : '';
    },
    isFormLocked() {
      const status = this.project && this.project.status;
      return status === 'archived' || status === 'pending_review' || status === 'pending_paper';
    },
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    showAdminReviewPanel() {
      return this.isAdmin && this.project && this.project.status === 'pending_review';
    },
    /**
     * 是否需要展示纸质档核对面板
     */
    showPaperReviewPanel() {
      return this.isAdmin && this.project && this.project.status === 'pending_paper';
    },
    /**
     * 纸质档确认进度
     */
    paperReviewProgress() {
      const list = this.paperFilesForReview || [];
      const confirmed = list.filter((f) => f.paperReviewed).length;
      return { total: list.length, confirmed };
    },
    canEditForm() {
      return this.project && !this.isFormLocked;
    },
    /**
     * 系统项目编号展示（创建时已发号；历史草稿归档前显示提示）
     */
    displayProjectNo() {
      if (this.project && this.project.projectNo) return this.project.projectNo;
      if (this.formData && this.formData.projectNo && String(this.formData.projectNo).startsWith('ZEC-Z')) {
        return this.formData.projectNo;
      }
      if (this.project && this.project.status === 'archived' && this.formData && this.formData.projectNo) {
        return this.formData.projectNo;
      }
      return '提交归档后自动分配';
    },
    /**
     * 含纸质文件列表（管理员审核，直接引用 projectFiles 以保持响应式）
     */
    paperFilesForReview() {
      return (this.projectFiles || []).filter((f) => f && f.hasPaper);
    }
  },
  watch: {
    formData: {
      deep: true,
      handler() {
        this._scheduleAutoSave();
      }
    },
    segmentFormData: {
      deep: true,
      handler() {
        this._scheduleAutoSave();
      }
    }
  },
  async mounted() {
    this._pageHideHandler = () => this._saveOnPageHide();
    window.addEventListener('pagehide', this._pageHideHandler);
    await this.loadData();
  },
  beforeUnmount() {
    this._autoSaveReady = false;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    if (this._pageHideHandler) {
      window.removeEventListener('pagehide', this._pageHideHandler);
      this._pageHideHandler = null;
    }
    // 离开页面时再兜底保存一次（不阻塞路由切换）
    if (this._dirty && !this.isFormLocked && !this.hasInvalidDates()) {
      this._persistFormData().catch(() => {});
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
     * 加载项目数据并初始化表单
     * 支持单标段和多标段项目
     */
    async loadData() {
      this.loading = true;
      this._autoSaveReady = false;
      try {
        this.project = await DB.getProject(this.projectId);

        // 加载采购类型与所属地域
        if (this.project && this.project.procurementType) {
          this.procurementType = this.project.procurementType;
        }
        if (this.project) {
          this.region = this.project.region || '';
        }

        // 加载标段配置
        await this._loadSegments();

        // 加载文件（含纸质审核）
        this.projectFiles = await DB.getFiles(this.projectId);

        // 获取合并数据（含冲突信息）
        // 返回格式：{ formData: {key: {value, source, conflict, sources}}, segmentData?: {segNo: {...}} }
        const mergedResult = await Extract.mergeExtractedData(this.projectId);
        const formDataMap = mergedResult.formData || mergedResult; // 兼容旧格式
        const segmentData = mergedResult.segmentData || {};

        // 初始化共享表单数据和元数据
        this.formData = {};
        this.fieldMeta = {};
        Utils.FIELDS.forEach(field => {
          const cell = formDataMap && formDataMap[field.key];
          if (cell !== undefined && cell !== null && cell !== '') {
            // 兼容富结构 { value } 与归档落库纯值
            const isRich = typeof cell === 'object' && cell !== null && 'value' in cell;
            this.formData[field.key] = isRich ? (cell.value || '') : cell;
            this.fieldMeta[field.key] = {
              source: isRich ? cell.source : null,
              conflict: isRich ? (cell.conflict || false) : false,
              sources: isRich ? (cell.sources || []) : []
            };
          } else {
            this.formData[field.key] = '';
            this.fieldMeta[field.key] = { source: null, conflict: false, sources: [] };
          }
        });

        // 系统号与招标文件编号分离：系统号取自 projects.project_no
        // 历史草稿若把招标文件编号误存在 projectNo，迁移到 tenderDocNo
        const sysNo = (this.project && this.project.projectNo) || '';
        const curNo = String(this.formData.projectNo || '').trim();
        if (sysNo) {
          this.formData.projectNo = sysNo;
        } else if (curNo && !curNo.startsWith('ZEC-Z')) {
          if (!String(this.formData.tenderDocNo || '').trim()) {
            this.formData.tenderDocNo = curNo;
          }
          this.formData.projectNo = '';
        }

        // 初始化各标段表单数据（单/多标段统一）
        this.segmentFormData = {};
        this.displaySegments.forEach((seg, idx) => {
          const segData = {};
          SEGMENT_FIELDS.forEach(key => {
            const fromSegment = segmentData[idx + 1] && segmentData[idx + 1][key];
            if (fromSegment !== undefined && fromSegment !== null && String(fromSegment).trim() !== '') {
              segData[key] = fromSegment;
            } else if (key !== 'projectName') {
              // 多标段时委托金额仅来自分标段提取，不回落全局 entrustAmount
              if (key === 'entrustAmount' && this.isMultiSegment) {
                segData[key] = '';
              } else {
                segData[key] = this.formData[key] || '';
              }
            } else {
              segData[key] = '';
            }
          });
          if (!segData.projectName) {
            const baseName = this.formData.projectName || this.project.projectName || '';
            segData.projectName = this.isMultiSegment
              ? baseName + (seg.name || '')
              : baseName;
          }
          this.segmentFormData[idx] = segData;
        });

        // 草稿仅填补提取结果中缺失的字段（重新提取优先于旧草稿）
        const savedMerged = await DB.getMergedData(this.projectId);
        const savedSegmentFormData = savedMerged?.segmentFormData || [];
        if (Array.isArray(savedSegmentFormData) && savedSegmentFormData.length > 0) {
          savedSegmentFormData.forEach((item, idx) => {
            if (!this.segmentFormData[idx]) this.segmentFormData[idx] = {};
            const fd = item?.formData || item || {};
            SEGMENT_FIELDS.forEach((key) => {
              const val = fd[key];
              if (val === undefined || val === null || String(val).trim() === '') return;
              const current = this.segmentFormData[idx][key];
              const hasCurrent = current !== undefined && current !== null && String(current).trim() !== '';
              if (!hasCurrent) {
                this.segmentFormData[idx][key] = val;
              }
            });
          });
        }

        // 默认展开有数据的分组
        this.activeGroups = this.fieldGroups
          .filter(g => Utils.FIELDS.some(
            f => f.group === g.key && !SEGMENT_FIELDS.includes(f.key) && this.formData[f.key]
          ))
          .map(g => g.key);
        if (this.activeGroups.length === 0) {
          this.activeGroups = ['basic']; // 至少展开基本信息
        }
        if (this.project && this.project.status === 'archived') {
          ElementPlus.ElMessage.info('当前项目已归档，仅可查看');
        } else if (this.project && this.project.status === 'pending_review') {
          ElementPlus.ElMessage.info('当前项目待审核，仅可查看');
        } else if (this.project && this.project.status === 'pending_paper') {
          ElementPlus.ElMessage.info('当前项目待纸质核对，请核对纸质文件是否收到');
        }
      } catch (error) {
        ElMessage.error('加载数据失败: ' + error.message);
      }
      this.loading = false;
      this.$nextTick(() => {
        this._autoSaveReady = true;
      });
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
     * 防抖自动保存
     * @private
     */
    _scheduleAutoSave() {
      if (!this._autoSaveReady || this.loading || this.isFormLocked || this.saving || this.submitting) return;
      if (this.hasInvalidDates()) {
        this.autoSaveState = 'error';
        return;
      }
      this._dirty = true;
      this.autoSaveState = 'pending';
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        this.autoSaveTimer = null;
        this._autoSave();
      }, 800);
    },

    /**
     * 执行自动保存（避免并发请求）
     * @private
     */
    async _autoSave() {
      if (!this._dirty || this.isFormLocked || this.loading || this.saving || this.submitting) return;
      if (this._savingAuto) {
        this._pendingAutoSave = true;
        return;
      }
      this._savingAuto = true;
      this.autoSaveState = 'saving';
      try {
        await this._persistFormData();
        this._dirty = false;
        this.autoSaveState = 'saved';
        this.lastAutoSavedAt = new Date();
      } catch (error) {
        console.warn('[复核页] 自动保存失败:', error.message);
        this.autoSaveState = 'error';
      } finally {
        this._savingAuto = false;
        if (this._pendingAutoSave) {
          this._pendingAutoSave = false;
          if (this._dirty) this._scheduleAutoSave();
        }
      }
    },

    /**
     * 自动保存失败后点击重试
     */
    retryAutoSave() {
      if (this.autoSaveState === 'error' && !this.hasInvalidDates()) {
        this._dirty = true;
        this._autoSave();
      }
    },

    /**
     * 是否存在格式非法的日期
     * @returns {boolean}
     */
    hasInvalidDates() {
      if (this.formData.entrustDate && !Utils.isValidPartialDate(this.formData.entrustDate)) {
        return true;
      }
      const segments = Object.values(this.segmentFormData || {});
      return segments.some((seg) => seg && seg.evalDate && !Utils.isValidPartialDate(seg.evalDate));
    },

    /**
     * 部分日期字段错误文案（空串表示合法）
     * @param {*} value
     * @returns {string}
     */
    getPartialDateError(value) {
      const raw = value == null ? '' : String(value).trim();
      if (!raw) return '';
      const parsed = Utils.parsePartialDate(raw);
      return parsed.ok ? '' : (parsed.error || '日期格式不正确');
    },

    /**
     * 部分日期失焦：合法则规范化，非法则提示并保留原文
     * @param {number|null} idx - 标段索引；null 表示共享字段
     * @param {string} fieldKey
     * @param {*} value
     */
    onPartialDateBlur(idx, fieldKey, value) {
      const raw = value == null ? '' : String(value).trim();
      if (!raw) return;
      const parsed = Utils.parsePartialDate(raw);
      if (!parsed.ok) {
        ElMessage.warning(parsed.error || '日期格式不正确');
        return;
      }
      const normalized = parsed.normalized || '';
      if (idx === null || idx === undefined) {
        this.setFieldValue(fieldKey, normalized);
      } else {
        this.setSegmentFieldValue(idx, fieldKey, normalized);
      }
    },

    /**
     * 评价时间早于中标通知书时间的提示（仅精确到日时比较）
     * @param {number} idx
     * @returns {string}
     */
    getEvalDateWarning(idx) {
      const seg = this.segmentFormData[idx] || {};
      if (!seg.evalDate || !seg.winNoticeDate) return '';
      const parsed = Utils.parsePartialDate(seg.evalDate);
      if (!parsed.ok || parsed.empty || parsed.precision !== 'day') return '';
      const evalTime = new Date(parsed.start).getTime();
      const winTime = new Date(seg.winNoticeDate).getTime();
      if (Number.isNaN(evalTime) || Number.isNaN(winTime)) return '';
      return evalTime < winTime ? '评价时间不应早于中标通知书时间' : '';
    },

    /**
     * 获取枚举选项；若当前值不在列表中则前置插入，便于展示/保留手输值
     * @param {string} enumKey
     * @param {*} [currentValue]
     * @returns {string[]}
     */
    getEnumOptions(enumKey, currentValue) {
      const opts = Utils.ENUMS[enumKey] || [];
      const val = currentValue != null ? String(currentValue).trim() : '';
      if (val && !opts.includes(val)) {
        return [val, ...opts];
      }
      return opts;
    },

    /**
     * 可手输枚举字段（el-autocomplete）的建议列表；失焦即保留输入值
     * @param {string} enumKey
     * @param {string} queryString
     * @param {(items: Array<{ value: string }>) => void} cb
     */
    queryEnumSuggestions(enumKey, queryString, cb) {
      const opts = Utils.ENUMS[enumKey] || [];
      const q = (queryString || '').trim().toLowerCase();
      const matched = q
        ? opts.filter((o) => String(o).toLowerCase().includes(q))
        : opts.slice();
      cb(matched.map((value) => ({ value })));
    },

    /**
     * 选择冲突来源的值
     * @param {string} fieldKey
     * @param {string} sourceValue
     */
    resolveConflict(fieldKey, sourceValue) {
      if (this.isFormLocked) {
        ElementPlus.ElMessage.warning('当前项目无法修改');
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
      if (this.isFormLocked) {
        ElementPlus.ElMessage.warning('当前项目无法修改');
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

    /**
     * 含纸质列表：所属分类（含标段名）
     * @param {string} docType
     * @param {number} segmentNo
     * @returns {string}
     */
    formatFileDocCategory(docType, segmentNo) {
      return Utils.formatFileDocCategory(docType, segmentNo, this.segments);
    },

    // ==================== 多标段字段读写 ====================

    /**
     * 获取字段值（根据是否为标段特有字段决定读取源）
     * @param {string} fieldKey
     * @returns {*}
     */
    getFieldValue(fieldKey) {
      if (SEGMENT_FIELDS.includes(fieldKey)) {
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
      if (SEGMENT_FIELDS.includes(fieldKey)) {
        if (!this.segmentFormData[this.currentSegment]) {
          this.segmentFormData[this.currentSegment] = {};
        }
        this.segmentFormData[this.currentSegment][fieldKey] = value;
      } else {
        this.formData[fieldKey] = value;
        if (!SEGMENT_FIELDS.includes(fieldKey)) {
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
      return SEGMENT_FIELDS.includes(fieldKey);
    },

    // onSegmentChange 已移除：不再使用 Tab 切换，改为列表式分区展示

    setSegmentFieldValue(idx, fieldKey, value) {
      if (!this.segmentFormData[idx]) {
        this.segmentFormData[idx] = {};
      }
      this.segmentFormData[idx][fieldKey] = value;
    },

    /**
     * 判断中标通知书日期是否有效
     * @param {*} val
     * @returns {boolean}
     * @private
     */
    _isValidWinNoticeDate(val) {
      return !!(val && !Number.isNaN(new Date(val).getTime()));
    },

    /**
     * 保存前同步标段字段与 formData（单标段回写，多标段清除全局标段字段）
     * @private
     */
    _syncSegmentFieldsToFormData() {
      if (this.displaySegments.length === 1) {
        const segData = this.segmentFormData[0] || {};
        SEGMENT_FIELDS.forEach((key) => {
          if (segData[key] !== undefined) {
            this.formData[key] = segData[key];
          }
        });
      } else {
        // 多标段：保留履约评价字段作为全局兜底，其余标段字段从共享表单移除
        SEGMENT_FIELDS
          .filter((key) => !EVALUATION_FIELDS.includes(key))
          .forEach((key) => {
            delete this.formData[key];
          });
      }
    },

    /**
     * 保存共享字段与多标段字段到 merged_data
     * @private
     */
    async _persistFormData() {
      const payload = this._buildMergedPayload();
      await DB.saveMergedData(this.projectId, payload.formData, null, payload.segmentFormData);
    },

    /**
     * 构造合并数据保存载荷
     * @returns {{ formData: Object, segmentFormData: Array }}
     * @private
     */
    _buildMergedPayload() {
      this._syncSegmentFieldsToFormData();
      // 落库时写入系统项目编号，避免与招标文件编号混淆
      if (this.project && this.project.projectNo) {
        this.formData.projectNo = this.project.projectNo;
      }
      const segmentPayload = this._buildSubmitBody().segmentFormData;
      return {
        formData: { projectId: this.projectId, ...this.formData },
        segmentFormData: segmentPayload
      };
    },

    /**
     * 页面关闭/刷新时用 keepalive 兜底保存
     * @private
     */
    _saveOnPageHide() {
      if (!this._dirty || this.isFormLocked || this.loading || this.hasInvalidDates()) return;
      try {
        const payload = this._buildMergedPayload();
        const body = JSON.stringify({
          formData: payload.formData,
          conflicts: null,
          segmentFormData: payload.segmentFormData
        });
        // keepalive 请求体有大小限制，超限时放弃（正常防抖保存已覆盖）
        if (body.length > 60000) return;
        fetch(`${Http.BASE_URL}/projects/${this.projectId}/merged-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Http.getToken() || ''}`
          },
          body,
          keepalive: true
        }).catch(() => {});
      } catch (e) {
        /* 忽略页面关闭时的保存失败 */
      }
    },

    /**
     * 保存草稿
     */
    async saveDraft() {
      if (!this.canEditForm) {
        ElementPlus.ElMessage.warning('当前项目无法修改');
        return;
      }
      this.saving = true;
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      try {
        await this._persistFormData();
        await DB.updateProject(this.projectId, { updatedAt: new Date().toISOString() });
        this._dirty = false;
        this.autoSaveState = 'saved';
        this.lastAutoSavedAt = new Date();
        ElMessage.success('草稿已保存');
      } catch (error) {
        ElMessage.error('保存失败: ' + error.message);
      }
      this.saving = false;
    },

    /**
     * 组装多标段提交数据
     * @returns {Object}
     */
    _buildSubmitBody() {
      const baseForm = { ...this.formData };
      SEGMENT_FIELDS.forEach((key) => { delete baseForm[key]; });
      const segmentFormData = this.displaySegments.map((seg, idx) => {
        const data = { ...baseForm };
        const segSpecific = this.segmentFormData[idx] || {};
        SEGMENT_FIELDS.forEach(key => {
          if (segSpecific[key] !== undefined) {
            data[key] = segSpecific[key];
          }
        });
        if (!data.projectName) {
          const baseName = this.formData.projectName || this.project.projectName || '';
          data.projectName = this.isMultiSegment
            ? baseName + (seg.name || '')
            : baseName;
        }
        return { name: seg.name, formData: data };
      });
      return { segmentFormData };
    },

    /**
     * 获取中标通知书日期校验提示（空串表示通过）
     * @returns {string}
     */
    getWinNoticeDateValidationMessage() {
      const missing = this.displaySegments
        .map((seg, idx) => ({
          name: this.isMultiSegment ? (seg.name || `标段${idx + 1}`) : '单标段',
          idx
        }))
        .filter(({ idx }) => !this._isValidWinNoticeDate((this.segmentFormData[idx] || {}).winNoticeDate))
        .map(({ name }) => name);
      if (missing.length > 0) {
        return `以下标段缺少有效的中标通知书日期：${missing.join('、')}`;
      }
      return '';
    },

    /**
     * 检查中标通知书日期是否满足单/多标段必填要求
     * @returns {boolean}
     */
    hasValidWinNoticeDate() {
      return !this.getWinNoticeDateValidationMessage();
    },

    /**
     * 提交审核
     */
    async submitForReview() {
      if (!this.canEditForm || this.submitting) return;

      if (!this.region || !String(this.region).trim()) {
        ElMessage.warning('请先设置所属地域（在文件页配置）');
        return;
      }
      const winNoticeMsg = this.getWinNoticeDateValidationMessage();
      if (winNoticeMsg) {
        ElMessage.warning(winNoticeMsg);
        return;
      }

      this.submitting = true;
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      try {
        const requestBody = this._buildSubmitBody();
        await this._persistFormData();
        await DB.updateProject(this.projectId, { updatedAt: new Date().toISOString() });
        await API.requestReview(this.projectId, requestBody);
        this._dirty = false;
        ElMessage.success('已提交审核');
        navigateTo('#/home');
      } catch (error) {
        ElMessage.error('提交审核失败: ' + error.message);
        this.submitting = false;
      }
    },

    /**
     * 审核不通过（管理员）
     */
    async rejectReview() {
      if (this.rejecting) return;
      const comment = (this.adminReviewComment || '').trim();
      if (!comment) {
        ElMessage.warning('请填写审核不通过原因');
        return;
      }
      this.rejecting = true;
      try {
        await API.rejectReview(this.projectId, comment);
        ElMessage.success('已驳回审核');
        navigateTo('#/home');
      } catch (error) {
        ElMessage.error('操作失败: ' + error.message);
        this.rejecting = false;
      }
    },

    /**
     * 管理员确认含纸质（即时保存）
     * @param {Object} fileItem
     * @param {boolean} checked
     */
    async onPaperReviewChange(fileItem, checked) {
      if (!fileItem) return;
      const file = this.projectFiles.find((f) => f.id === fileItem.id);
      if (!file) return;
      const prev = !!file.paperReviewed;
      const next = !!checked;
      file.paperReviewed = next;
      try {
        const updated = await DB.updateFilePaperReview(fileItem.id, next);
        if (updated) {
          file.paperReviewed = !!updated.paperReviewed;
        }
      } catch (error) {
        file.paperReviewed = prev;
        ElMessage.error('保存确认状态失败: ' + error.message);
      }
    },

    /**
     * 电子档审核通过（管理员）
     * - 生成归档记录；存在含纸质文件时进入待纸质核对
     */
    async approveElectronic() {
      if (this.submitting) return;

      this.submitting = true;
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      try {
        const requestBody = this._buildSubmitBody();
        const comment = (this.adminReviewComment || '').trim();
        const result = await API.approveElectronic(this.projectId, { ...requestBody, comment });
        if (result.status === 'pending_paper') {
          ElMessage.success('电子档审核通过，已生成待纸质核对');
          this.adminReviewComment = '';
          this.submitting = false;
          await this.loadData();
        } else {
          ElMessage.success('审核通过，项目已归档');
          navigateTo('#/home');
        }
      } catch (error) {
        ElMessage.error('电子档审核失败: ' + error.message);
        this.submitting = false;
      }
    },

    /**
     * 完成纸质档核对（管理员）
     */
    async completePaperReview() {
      if (this.submitting) return;
      const { total, confirmed } = this.paperReviewProgress;
      if (total > 0 && confirmed < total) {
        ElMessage.warning(`尚有 ${total - confirmed} 份含纸质文件未确认收到`);
        return;
      }

      this.submitting = true;
      try {
        const comment = (this.adminReviewComment || '').trim();
        const result = await API.completePaperReview(this.projectId, { comment });
        ElMessage.success(result.message || '纸质档核对完成，项目已全部归档');
        navigateTo('#/home');
      } catch (error) {
        ElMessage.error('完成纸质档核对失败: ' + error.message);
        this.submitting = false;
      }
    },

    /**
     * 兼容旧调用名
     */
    async approveAndArchive() {
      return this.approveElectronic();
    },

    /**
     * @deprecated 保留兼容，请使用 submitForReview / approveElectronic
     */
    async submitToArchive() {
      return this.submitForReview();
    }
  },
  template: `
    <div class="page-container" v-loading="loading">
      <!-- 页头：返回 + 标题 + 状态 -->
      <div class="page-head">
        <el-button text @click="navigateTo('#/project/' + projectId)">← 返回详情</el-button>
        <el-tag v-if="project && project.status === 'pending_review'" type="warning" size="small">待审核</el-tag>
        <el-tag v-else-if="project && project.status === 'pending_paper'" type="warning" size="small">待纸质核对</el-tag>
        <el-tag v-else-if="project && project.status === 'archived'" type="info" size="small">只读</el-tag>
        <el-tag v-if="isMultiSegment" type="primary" size="small">多标段（{{ segments.length }}个）</el-tag>
      </div>

      <!-- 所属地域 / 采购类型显示（只读） -->
      <div v-if="!loading && project" style="padding: 8px 20px; display: flex; align-items: center; gap: 16px; background: #f5f7fa; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: #606266;">所属地域：</span>
          <el-tag size="small" type="info">{{ region || '未设置' }}</el-tag>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: #606266;">采购类型：</span>
          <el-tag size="small">
            {{ procurementType === 'F' ? '服务(F)' : procurementType === 'G' ? '工程(G)' : '货物(H)' }}
          </el-tag>
        </div>
      </div>

      <!-- 表单主体 -->
      <div class="review-form" v-if="!loading">

        <!-- 共享字段 + 各标段卡片（单/多标段统一布局） -->
        <div>
          <el-collapse v-model="activeGroups">
            <el-collapse-item v-for="group in fieldGroups" :key="group.key" :title="group.label" :name="group.key">
              <el-form label-position="left" label-width="140px" style="padding: 0 12px;">
                <template v-for="field in groupedFields[group.key]" :key="field.key">
                  <el-form-item v-if="!isSegmentField(field.key)">
                    <template #label>
                      <span>{{ field.label }}</span>
                      <span v-if="field.required" style="color:red"> *</span>
                    </template>

                    <div class="field-wrapper" :class="{
                      'field-conflict': fieldMeta[field.key]?.conflict,
                      'field-missing': !formData[field.key] && !fieldMeta[field.key]?.conflict
                    }">
                      <template v-if="field.key === 'projectNo'">
                        <el-input :model-value="displayProjectNo" disabled />
                      </template>

                      <el-autocomplete
                        v-else-if="field.type === 'enum' && field.allowCreate"
                        :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :fetch-suggestions="(q, cb) => queryEnumSuggestions(field.enumKey, q, cb)"
                        :disabled="isFormLocked"
                        clearable
                        placeholder="请选择或输入"
                        style="width:100%"
                      />

                      <el-select v-else-if="field.type === 'enum'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="isFormLocked"
                        placeholder="请选择" clearable filterable style="width:100%">
                        <el-option v-for="opt in getEnumOptions(field.enumKey, formData[field.key])" :key="opt" :label="opt" :value="opt" />
                      </el-select>

                      <el-input v-else-if="field.type === 'partialDate'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        @blur="onPartialDateBlur(null, field.key, formData[field.key])"
                        :disabled="isFormLocked"
                        placeholder="如 2022 / 2022-03 / 2022-03-10" />

                      <el-date-picker v-else-if="field.type === 'date'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="isFormLocked"
                        type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />

                      <el-input v-else-if="field.type === 'textarea'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="isFormLocked"
                        type="textarea" :rows="4" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <el-input v-else-if="field.type === 'number'" :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="isFormLocked"
                        type="number" :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <el-input v-else :model-value="formData[field.key]"
                        @update:model-value="setFieldValue(field.key, $event)"
                        :disabled="isFormLocked"
                        :placeholder="formData[field.key] ? '' : '未找到，请手动填写'" />

                      <div v-if="field.type === 'partialDate' && getPartialDateError(formData[field.key])" class="field-warning">
                        {{ getPartialDateError(formData[field.key]) }}
                      </div>

                      <span v-if="fieldMeta[field.key]?.source" class="field-source">
                        来自：{{ getSourceLabel(fieldMeta[field.key].source) }}
                      </span>
                    </div>

                    <div v-if="fieldMeta[field.key]?.conflict" class="conflict-bar">
                      <span> 数据冲突：</span>
                      <span v-for="(src, cIdx) in fieldMeta[field.key].sources" :key="cIdx">
                        <el-button size="small" text type="primary" @click="resolveConflict(field.key, src.value)"
                          :disabled="isFormLocked">
                          {{ getSourceLabel(src.docType) }}: {{ src.value }}
                        </el-button>
                        <span v-if="cIdx < fieldMeta[field.key].sources.length - 1"> / </span>
                      </span>
                      <el-button size="small" type="warning" plain @click="resolveConflictKeepAll(field.key)"
                        :disabled="isFormLocked">
                        保留全部
                      </el-button>
                    </div>
                  </el-form-item>
                </template>
              </el-form>
            </el-collapse-item>
          </el-collapse>

          <div style="padding: 16px 20px;">
            <h4 style="margin-bottom: 12px; color: #303133;">各标段信息</h4>
            <el-card v-for="(seg, idx) in displaySegments" :key="idx" style="margin-bottom: 12px;" shadow="hover">
              <template #header>
                <span v-if="isMultiSegment" style="font-weight: bold;">{{ seg.name || ('标段' + (idx + 1)) }}</span>
                <span v-else style="font-weight: bold;">单标段</span>
              </template>
              <el-form label-position="left" label-width="140px">
                <el-form-item v-for="field in segmentFieldDefs" :key="field.key">
                  <template #label>
                    <span>{{ field.label }}</span>
                    <span v-if="field.key === 'winNoticeDate'" style="color:red"> *</span>
                  </template>
                  <el-date-picker
                    v-if="field.type === 'date'"
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    :disabled="isFormLocked"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="选择日期"
                    style="width:100%"
                  />
                  <el-autocomplete
                    v-else-if="field.type === 'enum' && field.allowCreate"
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    :fetch-suggestions="(q, cb) => queryEnumSuggestions(field.enumKey, q, cb)"
                    :disabled="isFormLocked"
                    clearable
                    placeholder="请选择或输入"
                    style="width:100%"
                  />
                  <el-select
                    v-else-if="field.type === 'enum'"
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    :disabled="isFormLocked"
                    placeholder="请选择"
                    clearable
                    filterable
                    style="width:100%"
                  >
                    <el-option v-for="opt in getEnumOptions(field.enumKey, segmentFormData[idx] && segmentFormData[idx][field.key])" :key="opt" :label="opt" :value="opt" />
                  </el-select>
                  <el-input
                    v-else-if="field.type === 'number'"
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    type="number"
                    :placeholder="'请输入' + field.label"
                    :disabled="isFormLocked"
                  />
                  <el-input
                    v-else
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    :placeholder="'请输入' + field.label"
                    :disabled="isFormLocked"
                  />
                </el-form-item>
              </el-form>
            </el-card>
          </div>

          <!-- 履约评价：置于标段信息之后，按标段独立填写 -->
          <div class="evaluation-section">
            <h4 style="margin: 0 0 6px; color: #303133;">履约评价</h4>
            <div class="evaluation-hint">
              优先取履约评价；无评价时自动带出招标文件中的招标人及联系人。评价信息按标段填写。
            </div>
            <el-card v-for="(seg, idx) in displaySegments" :key="'eval-' + idx" style="margin-bottom: 12px;" shadow="hover">
              <template #header>
                <span v-if="isMultiSegment" style="font-weight: bold;">{{ seg.name || ('标段' + (idx + 1)) }}</span>
                <span v-else style="font-weight: bold;">单标段</span>
              </template>
              <el-form label-position="left" label-width="140px">
                <el-form-item v-for="field in evaluationFieldDefs" :key="field.key">
                  <template #label>
                    <span>{{ field.label }}</span>
                  </template>
                  <el-input
                    v-if="field.type === 'partialDate'"
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    @blur="onPartialDateBlur(idx, field.key, segmentFormData[idx] && segmentFormData[idx][field.key])"
                    :disabled="isFormLocked"
                    placeholder="如 2025-04-11 / 2025-04 / 2025"
                  />
                  <el-input
                    v-else
                    :model-value="segmentFormData[idx] && segmentFormData[idx][field.key]"
                    @update:model-value="setSegmentFieldValue(idx, field.key, $event)"
                    :placeholder="'请输入' + field.label"
                    :disabled="isFormLocked"
                  />
                  <div v-if="field.type === 'partialDate' && getPartialDateError(segmentFormData[idx] && segmentFormData[idx][field.key])" class="field-warning">
                    {{ getPartialDateError(segmentFormData[idx] && segmentFormData[idx][field.key]) }}
                  </div>
                  <div v-if="field.key === 'evalDate' && getEvalDateWarning(idx)" class="field-warning">
                    {{ getEvalDateWarning(idx) }}
                  </div>
                </el-form-item>
              </el-form>
            </el-card>
          </div>
        </div>

        <!-- 底部操作 -->
        <div v-if="showAdminReviewPanel" class="review-admin-section">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="第一步：电子档审核。通过后自动生成归档记录，并进入纸质档核对。"
            style="margin-bottom: 12px;"
          />
          <el-form label-position="left" label-width="140px" class="review-admin-form">
            <el-form-item v-if="paperFilesForReview.length > 0" label="含纸质文件">
              <table class="paper-files-table paper-files-table-admin">
                <thead>
                  <tr>
                    <th class="paper-file-category">所属分类</th>
                    <th class="paper-file-name">文件名</th>
                    <th class="paper-file-check">含纸质</th>
                    <th class="paper-file-check">纸质确认</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pf in paperFilesForReview" :key="pf.id">
                    <td class="paper-file-category">{{ formatFileDocCategory(pf.docType, pf.segmentNo) }}</td>
                    <td class="paper-file-name" :title="pf.filename">{{ pf.filename }}</td>
                    <td class="paper-file-check">
                      <el-checkbox :model-value="true" disabled />
                    </td>
                    <td class="paper-file-check">
                      <span class="paper-pending-text">待下一步核对</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </el-form-item>
            <el-form-item label="电子档审核意见">
              <div class="review-admin-comment-wrap">
                <el-input
                  v-model="adminReviewComment"
                  type="textarea"
                  :rows="4"
                  placeholder="审核不通过时必填；通过时可选"
                />
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 第二步：纸质档核对 -->
        <div v-if="showPaperReviewPanel" class="review-admin-section">
          <h4 class="paper-review-title">第二步：纸质档核对</h4>
          <div class="paper-review-hint">
            电子档已审核通过并生成归档记录。请核对纸质文件是否收到，全部确认后完成最终归档。
          </div>
          <div v-if="paperFilesForReview.length === 0" class="paper-review-hint">
            本项目没有标记「含纸质」文件，可直接完成纸质档核对。
          </div>
          <el-form label-position="left" label-width="140px" class="review-admin-form">
            <el-form-item v-if="paperFilesForReview.length > 0" label="含纸质文件">
              <table class="paper-files-table paper-files-table-admin">
                <thead>
                  <tr>
                    <th class="paper-file-category">所属分类</th>
                    <th class="paper-file-name">文件名</th>
                    <th class="paper-file-check">含纸质</th>
                    <th class="paper-file-check">确认收到</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pf in paperFilesForReview" :key="pf.id">
                    <td class="paper-file-category">{{ formatFileDocCategory(pf.docType, pf.segmentNo) }}</td>
                    <td class="paper-file-name" :title="pf.filename">{{ pf.filename }}</td>
                    <td class="paper-file-check">
                      <el-checkbox :model-value="true" disabled />
                    </td>
                    <td class="paper-file-check">
                      <el-checkbox
                        :model-value="!!pf.paperReviewed"
                        @change="(val) => onPaperReviewChange(pf, val)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="paper-review-progress">
                已确认 {{ paperReviewProgress.confirmed }}/{{ paperReviewProgress.total }}
              </div>
            </el-form-item>
            <el-form-item label="纸质核对备注">
              <el-input
                v-model="adminReviewComment"
                type="textarea"
                :rows="3"
                placeholder="可选"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 固定底部操作栏：始终可见 -->
        <div v-if="showAdminReviewPanel" class="review-sticky-actions">
          <span class="autosave-status">电子档审核</span>
          <div class="review-sticky-buttons">
            <el-button type="danger" @click="rejectReview" :loading="rejecting">审核不通过</el-button>
            <el-button type="primary" @click="approveElectronic" :loading="submitting">电子档审核通过</el-button>
          </div>
        </div>
        <div v-else-if="showPaperReviewPanel" class="review-sticky-actions">
          <span class="autosave-status">已确认 {{ paperReviewProgress.confirmed }}/{{ paperReviewProgress.total }}</span>
          <div class="review-sticky-buttons">
            <el-button
              type="primary"
              @click="completePaperReview"
              :loading="submitting"
              :disabled="paperReviewProgress.total > 0 && paperReviewProgress.confirmed < paperReviewProgress.total"
            >完成纸质档核对</el-button>
          </div>
        </div>
        <div v-else-if="canEditForm" class="review-sticky-actions">
          <span
            class="autosave-status"
            :class="{ 'is-error': autoSaveState === 'error', 'is-saving': autoSaveState === 'saving' }"
            @click="retryAutoSave"
          >{{ autoSaveLabel }}</span>
          <div class="review-sticky-buttons">
            <el-button @click="saveDraft" :loading="saving">保存草稿</el-button>
            <el-button type="primary" @click="submitForReview" :loading="submitting">提交审核</el-button>
          </div>
        </div>
        <div v-else-if="project && project.status === 'archived'" class="form-actions">
          <el-button disabled>已归档</el-button>
        </div>
        <div
          v-if="project && project.status === 'archived' && project.reviewComment"
          class="review-comment-display"
          style="margin: 0;"
        >
          <strong>审核意见：</strong>{{ project.reviewComment }}
        </div>
      </div>
    </div>
  `
});

// ============================================
// 管理员合同管理页面组件
// ============================================

// ============================================
// 工程项目表单弹窗（新建 / 编辑）
// ============================================

app.component('master-project-form-dialog', {
  props: {
    visible: { type: Boolean, default: false },
    project: { type: Object, default: null }
  },
  emits: ['update:visible', 'saved'],
  data() {
    return {
      form: {
        name: '',
        projectNo: '',
        ownerName: '',
        region: '',
        industry: '公路',
        totalInvestment: '',
        constructionScale: '',
        manager: '',
        status: 'active',
        remark: ''
      },
      saving: false
    };
  },
  computed: {
    isEdit() {
      return !!(this.project && this.project.id);
    }
  },
  watch: {
    visible(val) {
      if (val) this.resetForm();
    }
  },
  methods: {
    resetForm() {
      const p = this.project || {};
      this.form = {
        name: p.name || '',
        projectNo: p.projectNo || '',
        ownerName: p.ownerName || '',
        region: p.region || '',
        industry: p.industry || '公路',
        totalInvestment: p.totalInvestment == null ? '' : p.totalInvestment,
        constructionScale: p.constructionScale || '',
        manager: p.manager || '',
        status: p.status || 'active',
        remark: p.remark || ''
      };
      this.saving = false;
    },
    close() {
      if (this.saving) return;
      this.$emit('update:visible', false);
    },
    async submit() {
      const name = String(this.form.name || '').trim();
      if (!name) {
        ElMessage.warning('请输入工程项目名称');
        return;
      }
      this.saving = true;
      try {
        const payload = {
          name,
          projectNo: String(this.form.projectNo || '').trim(),
          ownerName: String(this.form.ownerName || '').trim(),
          region: String(this.form.region || '').trim(),
          industry: String(this.form.industry || '').trim(),
          totalInvestment: this.form.totalInvestment === '' ? null : Number(this.form.totalInvestment),
          constructionScale: String(this.form.constructionScale || '').trim(),
          manager: String(this.form.manager || '').trim(),
          status: this.form.status || 'active',
          remark: String(this.form.remark || '').trim()
        };
        const saved = this.isEdit
          ? await API.updateMasterProject(this.project.id, payload)
          : await API.createMasterProject(payload);
        ElMessage.success(this.isEdit ? '工程项目已更新' : '工程项目已创建');
        this.$emit('saved', saved);
        this.$emit('update:visible', false);
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.saving = false;
    }
  },
  template: `
    <el-dialog
      :model-value="visible"
      :title="isEdit ? '编辑工程项目' : '新建工程项目'"
      width="640px"
      :close-on-click-modal="false"
      @update:model-value="$emit('update:visible', $event)"
    >
      <div class="mpf-hint">工程项目是业主的立项工程，仅用于把归档项目分组，不代表本公司承接的业务。</div>
      <el-form label-width="96px">
        <el-form-item label="工程项目名称" required>
          <el-input v-model="form.name" maxlength="200" show-word-limit placeholder="如 G8517 屏山至兴义国家高速公路" />
        </el-form-item>
        <div class="mpf-grid">
          <el-form-item label="工程项目编号">
            <el-input v-model="form.projectNo" placeholder="留空自动生成 P2026-001" />
          </el-form-item>
          <el-form-item label="建设单位">
            <el-input v-model="form.ownerName" placeholder="业主单位" />
          </el-form-item>
          <el-form-item label="地区">
            <el-input v-model="form.region" placeholder="如 贵州" />
          </el-form-item>
          <el-form-item label="行业">
            <el-input v-model="form.industry" placeholder="默认 公路" />
          </el-form-item>
          <el-form-item label="总投资（万元）">
            <el-input v-model="form.totalInvestment" type="number" placeholder="可空" />
          </el-form-item>
          <el-form-item label="建设规模">
            <el-input v-model="form.constructionScale" placeholder="如 160km" />
          </el-form-item>
          <el-form-item label="负责人">
            <el-input v-model="form.manager" placeholder="可空" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 100%;">
              <el-option label="进行中" value="active" />
              <el-option label="已完工" value="closed" />
              <el-option label="已暂停" value="paused" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可空" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  `
});

// ============================================
// 工程项目列表页
// ============================================

app.component('master-project-list-page', {
  emits: ['open-settings'],
  props: {
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      loading: true,
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      search: '',
      ownerName: '',
      year: '',
      status: '',
      showForm: false,
      editingProject: null,
      searchTimer: null
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    yearOptions() {
      const current = new Date().getFullYear();
      const years = [];
      for (let i = 0; i < 8; i++) years.push(String(current - i));
      return years;
    }
  },
  async mounted() {
    await this.load();
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    async load() {
      this.loading = true;
      try {
        const res = await API.listMasterProjects({
          page: this.page,
          pageSize: this.pageSize,
          search: this.search,
          ownerName: this.ownerName,
          year: this.year,
          status: this.status
        });
        this.items = res.items || [];
        this.total = res.total || 0;
      } catch (error) {
        ElMessage.error('加载工程项目失败: ' + error.message);
      }
      this.loading = false;
    },
    onSearchInput() {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.page = 1;
        this.load();
      }, 300);
    },
    onFilterChange() {
      this.page = 1;
      this.load();
    },
    onPageChange(page) {
      this.page = page;
      this.load();
    },
    openCreate() {
      this.editingProject = null;
      this.showForm = true;
    },
    openEdit(item) {
      const u = this.currentUser;
      const isAdmin = !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
      if (!isAdmin && item.createdBy !== (u && u.id)) {
        ElMessage.warning('仅创建人或管理员可编辑该工程项目');
        return;
      }
      this.editingProject = item;
      this.showForm = true;
    },
    async onSaved() {
      await this.load();
    },
    goDetail(item) {
      this.navigateTo('#/master-projects/' + item.id);
    },
    async remove(item) {
      try {
        await ElMessageBox.confirm(
          '确定要删除该工程项目吗？仅当归属归档数为 0 时可删除。',
          '确认删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch (e) {
        return;
      }
      try {
        await API.deleteMasterProject(item.id);
        ElMessage.success('工程项目已删除');
        await this.load();
      } catch (error) {
        ElMessage.error(error.message || '删除失败');
      }
    },
    archiveCountText(item) {
      const c = item.categoryCounts || {};
      const parts = [];
      if (c.tender) parts.push('招标 ' + c.tender);
      if (c.cost) parts.push('造价 ' + c.cost);
      if (c.consult) parts.push('咨询 ' + c.consult);
      return parts;
    }
  },
  template: `
    <div class="page-container mp-page" v-loading="loading">
      <div class="banner mp-banner">
        工程项目是<b>业主的立项工程</b>，只用于把归档项目分组，不代表本公司承接的业务。
      </div>

      <div class="mp-toolbar">
        <div class="mp-filters">
          <el-input v-model="search" class="mp-search" placeholder="搜索工程项目名称、建设单位、编号" clearable @input="onSearchInput" @clear="onSearchInput" />
          <el-input v-model="ownerName" placeholder="建设单位" clearable style="width: 180px;" @change="onFilterChange" />
          <el-select v-model="year" clearable placeholder="年份" style="width: 120px;" @change="onFilterChange">
            <el-option v-for="y in yearOptions" :key="y" :label="y + ' 年'" :value="y" />
          </el-select>
          <el-select v-model="status" clearable placeholder="状态" style="width: 120px;" @change="onFilterChange">
            <el-option label="进行中" value="active" />
            <el-option label="已完工" value="closed" />
            <el-option label="已暂停" value="paused" />
          </el-select>
        </div>
        <div class="mp-actions">
          <el-button type="primary" @click="openCreate">+ 新建工程项目</el-button>
        </div>
      </div>

      <div class="ap-table-card">
        <el-table :data="items" style="width: 100%;" row-key="id">
          <el-table-column label="工程项目" min-width="260">
            <template #default="{ row }">
              <div class="ap-name" @click="goDetail(row)">{{ row.name }}</div>
              <div class="ap-sub">
                {{ [row.region, row.industry, row.constructionScale].filter(Boolean).join(' · ') }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="编号" width="140">
            <template #default="{ row }"><span class="ap-mono">{{ row.projectNo || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="建设单位" min-width="200">
            <template #default="{ row }">{{ row.ownerName || '—' }}</template>
          </el-table-column>
          <el-table-column label="归属归档" min-width="180">
            <template #default="{ row }">
              <span v-if="archiveCountText(row).length === 0" class="ap-unassigned">暂无归档</span>
              <span v-else class="mp-count-chips">
                <span v-for="t in archiveCountText(row)" :key="t" class="ap-chip ap-chip--cat">{{ t }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="负责人" width="96">
            <template #default="{ row }">{{ row.manager || row.createdByName || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="goDetail(row)">查看</el-button>
              <el-button text @click="openEdit(row)">编辑</el-button>
              <el-button v-if="isAdmin" text type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="!loading && items.length === 0" class="ap-empty">
          暂无工程项目。工程项目可以现在建，也可以在新建归档时就地新建。
        </div>

        <div v-if="total > pageSize" class="ap-pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="total, prev, pager, next"
            @current-change="onPageChange"
          />
        </div>
      </div>

      <master-project-form-dialog v-model:visible="showForm" :project="editingProject" @saved="onSaved" />
    </div>
  `
});

// ============================================
// 工程项目详情页
// ============================================

app.component('master-project-detail-page', {
  emits: ['open-settings'],
  props: {
    masterProjectId: { type: String, required: true },
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      loading: true,
      detail: null,
      showForm: false,
      showCreateArchive: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    canEdit() {
      if (!this.detail || !this.currentUser) return false;
      return this.isAdmin || this.detail.createdBy === this.currentUser.id;
    },
    statusCounts() {
      return (this.detail && this.detail.statusCounts) || { draft: 0, pending_review: 0, pending_paper: 0, archived: 0, total: 0 };
    }
  },
  async mounted() {
    await this.load();
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    async load() {
      this.loading = true;
      try {
        this.detail = await API.getMasterProject(this.masterProjectId);
      } catch (error) {
        ElMessage.error('加载工程项目失败: ' + error.message);
        this.detail = null;
      }
      this.loading = false;
    },
    statusLabel(status) {
      const map = {
        draft: '草稿',
        pending_review: '待审核',
        review_rejected: '审核不通过',
        review_approved: '审核通过',
        pending_paper: '待纸质核对',
        archived: '已归档'
      };
      return map[status] || status || '—';
    },
    goProject(project) {
      this.navigateTo('#/project/' + project.id);
    },
    onSaved() {
      this.load();
    },
    onArchiveCreated(projectId) {
      this.navigateTo('#/project/' + projectId);
    },
    async removeMaster() {
      if (!this.detail) return;
      try {
        await ElMessageBox.confirm(
          '确定要删除该工程项目吗？仅当归属归档数为 0 时可删除。',
          '确认删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch (e) {
        return;
      }
      try {
        await API.deleteMasterProject(this.detail.id);
        ElMessage.success('工程项目已删除');
        this.navigateTo('#/master-projects');
      } catch (error) {
        ElMessage.error(error.message || '删除失败');
      }
    }
  },
  template: `
    <div class="page-container mp-detail" v-loading="loading">
      <div class="page-crumb">
        <a href="javascript:;" @click="navigateTo('#/master-projects')">工程项目</a>
        <span>/</span>
        <b>{{ detail ? detail.name : '' }}</b>
      </div>

      <template v-if="detail">
        <div class="mp-hero">
          <div class="mp-hero-main">
            <h2>{{ detail.name }}</h2>
            <div class="mp-hero-meta">
              <span>编号 <b>{{ detail.projectNo || '—' }}</b></span>
              <span>建设单位 <b>{{ detail.ownerName || '—' }}</b></span>
              <span>地区 <b>{{ detail.region || '—' }}</b></span>
              <span>总投资 <b>{{ detail.totalInvestment == null ? '—' : detail.totalInvestment + ' 万元' }}</b></span>
              <span>负责人 <b>{{ detail.manager || detail.createdByName || '—' }}</b></span>
            </div>
          </div>
          <div class="mp-hero-actions">
            <el-button v-if="canEdit" @click="showForm = true">编辑</el-button>
            <el-button type="primary" @click="showCreateArchive = true">+ 添加归档项目</el-button>
            <el-button v-if="isAdmin" text type="danger" @click="removeMaster">删除</el-button>
          </div>
        </div>

        <div class="ap-table-card mp-detail-table">
          <div class="mp-section-hd">
            <h3>归属归档 <span>本公司在此工程下承接的服务，各自独立归档</span></h3>
            <span class="mp-section-count">共 {{ detail.projects.length }} 个</span>
          </div>
          <el-table :data="detail.projects" style="width: 100%;" row-key="id">
            <el-table-column label="类型" width="110">
              <template #default="{ row }"><span class="ap-chip ap-chip--cat">{{ row.categoryName || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="归档项目" min-width="240">
              <template #default="{ row }">
                <div class="ap-name" @click="goProject(row)">{{ row.name }}</div>
              </template>
            </el-table-column>
            <el-table-column label="编号" width="140">
              <template #default="{ row }"><span class="ap-mono">{{ row.projectNo || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="归档状态" width="112">
              <template #default="{ row }"><span class="ap-chip">{{ statusLabel(row.status) }}</span></template>
            </el-table-column>
            <el-table-column label="负责人" width="96">
              <template #default="{ row }">{{ row.createdByName || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="goProject(row)">进入归档</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="detail.projects.length === 0" class="ap-empty">
            该工程项目下暂无归档。可以先建工程后补归档。
          </div>
        </div>

        <div class="ap-table-card mp-progress">
          <div class="mp-section-hd"><h3>归档进度</h3><span>按归档项目汇总，纸质档单独计</span></div>
          <div class="mp-stats">
            <div class="mp-stat"><div class="k">归档项目</div><div class="v">{{ statusCounts.total }}</div></div>
            <div class="mp-stat"><div class="k">草稿</div><div class="v">{{ statusCounts.draft || 0 }}</div></div>
            <div class="mp-stat"><div class="k">待审核</div><div class="v">{{ statusCounts.pending_review || 0 }}</div></div>
            <div class="mp-stat"><div class="k">已归档</div><div class="v">{{ statusCounts.archived || 0 }}</div></div>
            <div class="mp-stat"><div class="k">纸质档待核对</div><div class="v">{{ statusCounts.pending_paper || 0 }}</div></div>
          </div>
        </div>
      </template>

      <div v-else-if="!loading" class="ap-empty">工程项目不存在或已被删除</div>

      <master-project-form-dialog v-model:visible="showForm" :project="detail" @saved="onSaved" />
      <archive-project-create-dialog
        v-model:visible="showCreateArchive"
        :preset-master-project="detail"
        @created="onArchiveCreated"
      />
    </div>
  `
});

function emptyContractForm() {
  return {
    name: '',
    counterparty: '',
    totalInvestment: '',
    natureRaw: '',
    contractContent: '',
    projectManager: '',
    techManager: '',
    contractDateRaw: '',
    agencyFee: '',
    stampTaxDue: '',
    stampTaxPaid: '',
    copies: '',
    archiveDate: '',
    isConsolidatedTax: false,
    creditCodeRaw: '',
    contractAmount: '',
    parentContractId: '',
    isPayment: false
  };
}

function contractFormFromDetail(detail) {
  return {
    name: detail.name || '',
    counterparty: detail.counterparty || '',
    totalInvestment: detail.totalInvestment == null ? '' : detail.totalInvestment,
    natureRaw: detail.natureRaw || '',
    contractContent: detail.contractContent || '',
    projectManager: detail.projectManager || '',
    techManager: detail.techManager || '',
    contractDateRaw: detail.contractDateRaw || detail.contractDate || '',
    agencyFee: detail.agencyFee == null ? '' : detail.agencyFee,
    stampTaxDue: detail.stampTaxDue == null ? '' : detail.stampTaxDue,
    stampTaxPaid: detail.stampTaxPaid == null ? '' : detail.stampTaxPaid,
    copies: detail.copies == null ? '' : detail.copies,
    archiveDate: detail.archiveDate || '',
    isConsolidatedTax: !!detail.isConsolidatedTax,
    creditCodeRaw: detail.creditCodeRaw || '',
    contractAmount: detail.contractAmount == null ? '' : detail.contractAmount,
    parentContractId: detail.parentContractId || '',
    isPayment: !!detail.isPayment
  };
}

app.component('admin-contract-ledger-page', {
  emits: ['open-settings'],
  props: {
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      contracts: [],
      total: 0,
      currentPage: 1,
      pageSize: 50,
      loading: false,
      exporting: false,
      searchText: '',
      filterPaymentOnly: false,
      filterChildOnly: false,
      filterMissingCredit: false,
      searchDebounceTimer: null,
      formDialogVisible: false,
      formMode: 'create',
      formSaving: false,
      form: emptyContractForm(),
      editingContract: null,
      parentOptions: [],
      parentLoading: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    parentSelectOptions() {
      const selfId = this.editingContract && this.editingContract.id;
      return (this.parentOptions || []).filter((c) => c.id !== selfId);
    }
  },
  watch: {
    searchText() {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.currentPage = 1;
        this.loadContracts();
      }, 300);
    },
    filterPaymentOnly() { this._reloadFirstPage(); },
    filterChildOnly() { this._reloadFirstPage(); },
    filterMissingCredit() { this._reloadFirstPage(); }
  },
  async mounted() {
    if (!this.isAdmin) {
      window.navigateTo('#/projects');
      return;
    }
    await this.loadContracts();
  },
  methods: {
    _reloadFirstPage() {
      this.currentPage = 1;
      this.loadContracts();
    },
    async loadContracts() {
      this.loading = true;
      try {
        const res = await API.listContracts({
          page: this.currentPage,
          pageSize: this.pageSize,
          search: this.searchText,
          paymentOnly: this.filterPaymentOnly,
          childOnly: this.filterChildOnly,
          missingCredit: this.filterMissingCredit
        });
        this.contracts = res.items || [];
        this.total = res.total || 0;
      } catch (error) {
        ElMessage.error('加载合同台账失败: ' + error.message);
      }
      this.loading = false;
    },
    handlePageChange(page) {
      this.currentPage = page;
      this.loadContracts();
    },
    formatMoney(value) {
      if (value === null || value === undefined || value === '') return '—';
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      return n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
    },
    legacyIssueText(row) {
      const extra = row && row.legacyExtra;
      if (!extra) return '';
      const issues = Array.isArray(extra.issues) ? extra.issues : [];
      return issues.map((it) => (typeof it === 'string' ? it : it.message || '')).filter(Boolean).join('；');
    },
    async loadParentOptions() {
      this.parentLoading = true;
      try {
        const res = await API.listContracts({ page: 1, pageSize: 2000 });
        this.parentOptions = res.items || [];
      } catch (error) {
        this.parentOptions = [];
      }
      this.parentLoading = false;
    },
    openCreateDialog() {
      this.formMode = 'create';
      this.editingContract = null;
      this.form = emptyContractForm();
      this.formDialogVisible = true;
      this.loadParentOptions();
    },
    async openEditDialog(row) {
      try {
        const detail = await API.getContract(row.id);
        this.formMode = 'edit';
        this.editingContract = detail;
        this.form = contractFormFromDetail(detail);
        this.formDialogVisible = true;
        await this.loadParentOptions();
      } catch (error) {
        ElMessage.error('加载合同详情失败: ' + error.message);
      }
    },
    async saveForm() {
      const name = String(this.form.name || '').trim();
      if (!name) {
        ElMessage.warning('请输入合同名称');
        return;
      }
      this.formSaving = true;
      try {
        const payload = { ...this.form, name };
        if (this.formMode === 'create') {
          await API.createContract(payload);
        } else {
          await API.updateContract(this.editingContract.id, payload);
        }
        ElMessage.success('保存成功');
        this.formDialogVisible = false;
        await this.loadContracts();
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.formSaving = false;
    },
    async confirmDelete(row) {
      try {
        await ElMessageBox.confirm('确定要删除此合同吗？删除后不可恢复。', '确认删除', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        });
      } catch (e) {
        return;
      }
      try {
        await API.deleteContract(row.id);
        ElMessage.success('合同已删除');
        await this.loadContracts();
      } catch (error) {
        ElMessage.error(error.message || '删除失败');
      }
    },
    async exportAll() {
      this.exporting = true;
      try {
        const res = await API.listContracts({
          page: 1,
          pageSize: 10000,
          search: this.searchText,
          paymentOnly: this.filterPaymentOnly,
          childOnly: this.filterChildOnly,
          missingCredit: this.filterMissingCredit
        });
        Export.exportContractsToExcel(res.items || []);
        ElMessage.success('合同台账已导出');
      } catch (error) {
        ElMessage.error('导出失败: ' + error.message);
      }
      this.exporting = false;
    }
  },
  template: `
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="head-title">合同台账</div>
          <div class="cl-subtitle">印花税台账 · 管理员维护</div>
        </div>
        <div class="head-actions">
          <el-button type="primary" @click="openCreateDialog">+ 新增</el-button>
          <el-button :loading="exporting" @click="exportAll">导出合同台账</el-button>
        </div>
      </div>

      <div style="padding: 20px;" v-loading="loading">
        <div class="search-bar" style="margin-bottom: 16px;">
          <div class="search-bar-filters contract-search-bar">
            <el-input
              v-model="searchText"
              placeholder="合同名称 / 对方企业 / 合同性质"
              clearable
              style="max-width: 380px;"
            />
            <el-checkbox v-model="filterPaymentOnly">仅付款类</el-checkbox>
            <el-checkbox v-model="filterChildOnly">仅子合同</el-checkbox>
            <el-checkbox v-model="filterMissingCredit">缺信用代码</el-checkbox>
          </div>
        </div>

        <el-table :data="contracts" stripe style="width: 100%;" row-key="id">
          <el-table-column label="序号" width="76">
            <template #default="{ row }">{{ row.seqNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="合同名称" min-width="280">
            <template #default="{ row }">
              <div class="contract-name-cell" :title="row.name">
                <span>{{ row.name }}</span>
                <el-tag v-if="row.isPayment" size="small" type="danger" effect="plain">付款</el-tag>
                <el-tag v-if="row.parentContractId" size="small" type="info">子合同</el-tag>
                <el-tag v-if="row.source === 'legacy'" size="small" type="info">历史</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="counterparty" label="对方企业" min-width="180" show-overflow-tooltip />
          <el-table-column prop="natureRaw" label="合同性质" min-width="150" show-overflow-tooltip />
          <el-table-column label="合同金额(万元)" width="130" align="right">
            <template #default="{ row }">{{ formatMoney(row.contractAmount) }}</template>
          </el-table-column>
          <el-table-column label="应贴花(元)" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.stampTaxDue) }}</template>
          </el-table-column>
          <el-table-column label="已贴花(元)" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.stampTaxPaid) }}</template>
          </el-table-column>
          <el-table-column prop="copies" label="份数" width="72" align="center">
            <template #default="{ row }">{{ row.copies == null ? '—' : row.copies }}</template>
          </el-table-column>
          <el-table-column prop="archiveDate" label="存档日期" width="118">
            <template #default="{ row }">{{ row.archiveDate || '—' }}</template>
          </el-table-column>
          <el-table-column label="汇总纳税" width="92" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.isConsolidatedTax ? 'success' : 'info'">
                {{ row.isConsolidatedTax ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" text @click="openEditDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" text @click="confirmDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

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

      <el-dialog
        v-model="formDialogVisible"
        :title="formMode === 'create' ? '新增合同' : '编辑合同'"
        width="920px"
        top="4vh"
        :close-on-click-modal="false"
        destroy-on-close
      >
        <div v-if="formMode === 'edit' && editingContract && editingContract.source === 'legacy'" class="contract-legacy-hint">
          历史导入合同：序号 {{ editingContract.seqNo }}，来源 {{ editingContract.legacySheet }} 第 {{ editingContract.legacyRow }} 行
          <span v-if="legacyIssueText(editingContract)">；异常：{{ legacyIssueText(editingContract) }}</span>
        </div>

        <el-form label-width="118px" class="contract-form-grid">
          <el-form-item label="合同名称" required class="is-full">
            <el-input v-model="form.name" placeholder="合同名称/项目名称" maxlength="300" show-word-limit />
          </el-form-item>
          <el-form-item label="对方企业名称">
            <el-input v-model="form.counterparty" placeholder="对方企业名称" />
          </el-form-item>
          <el-form-item label="合同性质原文">
            <el-input v-model="form.natureRaw" placeholder="保留历史原文，新合同可手工填写" />
          </el-form-item>
          <el-form-item label="合同日期">
            <el-input v-model="form.contractDateRaw" placeholder="如 2022 / 2022-03 / 2022-03-10" />
          </el-form-item>
          <el-form-item label="合同金额(万元)">
            <el-input v-model="form.contractAmount" type="number" placeholder="可空" />
          </el-form-item>
          <el-form-item label="总投资额(万元)">
            <el-input v-model="form.totalInvestment" type="number" placeholder="可空" />
          </el-form-item>
          <el-form-item label="代理费(万元)">
            <el-input v-model="form.agencyFee" type="number" placeholder="可空" />
          </el-form-item>
          <el-form-item label="应贴花(元)">
            <el-input v-model="form.stampTaxDue" type="number" placeholder="手填，不自动计算" />
          </el-form-item>
          <el-form-item label="已贴花(元)">
            <el-input v-model="form.stampTaxPaid" type="number" placeholder="手填" />
          </el-form-item>
          <el-form-item label="份数">
            <el-input v-model="form.copies" type="number" placeholder="合同份数" />
          </el-form-item>
          <el-form-item label="存档日期">
            <el-date-picker
              v-model="form.archiveDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              style="width: 100%;"
            />
          </el-form-item>
          <el-form-item label="项目负责人">
            <el-input v-model="form.projectManager" placeholder="多人可用顿号分隔" />
          </el-form-item>
          <el-form-item label="技术负责人">
            <el-input v-model="form.techManager" placeholder="多人可用顿号分隔" />
          </el-form-item>
          <el-form-item label="统一社会信用代码" class="is-full">
            <el-input v-model="form.creditCodeRaw" placeholder="多个代码可用 / 分隔" />
          </el-form-item>
          <el-form-item label="合同内容" class="is-full">
            <el-input v-model="form.contractContent" type="textarea" :rows="3" placeholder="合同内容/服务范围" />
          </el-form-item>
          <el-form-item label="汇总纳税">
            <el-switch v-model="form.isConsolidatedTax" active-text="是" inactive-text="否" />
          </el-form-item>
          <el-form-item label="付款类合同">
            <el-switch v-model="form.isPayment" />
          </el-form-item>
          <el-form-item label="所属合同">
            <el-select
              v-model="form.parentContractId"
              clearable
              filterable
              :loading="parentLoading"
              placeholder="可选：补充协议/付款挂主合同"
              style="width: 100%;"
            >
              <el-option
                v-for="opt in parentSelectOptions"
                :key="opt.id"
                :label="(opt.seqNo ? opt.seqNo + ' ' : '') + opt.name"
                :value="opt.id"
              />
            </el-select>
          </el-form-item>
        </el-form>

        <div v-if="formMode === 'edit' && editingContract && editingContract.children && editingContract.children.length > 0" style="margin-top: 12px;">
          <h4 class="contract-section-title">子合同</h4>
          <el-table :data="editingContract.children" size="small" stripe>
            <el-table-column prop="seqNo" label="序号" width="70" />
            <el-table-column prop="name" label="合同名称" min-width="240" />
            <el-table-column prop="contractDate" label="合同日期" width="120" />
            <el-table-column prop="natureRaw" label="合同性质" min-width="140" />
            <el-table-column label="代理费(万元)" width="120" align="right">
              <template #default="{ row }">{{ formatMoney(row.agencyFee) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <template #footer>
          <el-button @click="formDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="formSaving" @click="saveForm">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

app.component('admin-archive-page', {
  emits: ['open-settings'],
  props: {
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      archives: [],
      total: 0,
      currentPage: 1,
      pageSize: 50,
      loading: false,
      exporting: false,
      downloadingZip: false,
      searchText: '',
      filterRegionList: [],
      searchDebounceTimer: null,
      archiveFilesCache: {},
      archiveFilesLoading: {},
      selectedFileIds: [],
      selectedProjectIds: [],
      expandedRowKeys: [],
      deletingProjectId: null,
      batchDeletingProjects: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    provinceOptions() {
      return Utils.PROVINCES || [];
    },
    hasSelectedFiles() {
      return this.selectedFileIds.length > 0;
    },
    selectedFileCount() {
      return this.selectedFileIds.length;
    },
    hasSelectedProjects() {
      return this.selectedProjectIds.length > 0;
    },
    pageProjectIds() {
      const ids = new Set();
      (this.archives || []).forEach((row) => {
        if (row && row.project_id) ids.add(row.project_id);
      });
      return [...ids];
    },
    isAllPageProjectsSelected() {
      const pageIds = this.pageProjectIds;
      if (pageIds.length === 0) return false;
      return pageIds.every((id) => this.selectedProjectIds.includes(id));
    },
    isPageProjectsIndeterminate() {
      const pageIds = this.pageProjectIds;
      if (pageIds.length === 0) return false;
      const selectedCount = pageIds.filter((id) => this.selectedProjectIds.includes(id)).length;
      return selectedCount > 0 && selectedCount < pageIds.length;
    },
    downloadZipTooltip() {
      return this.hasSelectedFiles
        ? '按归档目录结构打包下载，超过 50MB 自动分包'
        : '请先展开项目，勾选要下载的附件';
    },
    downloadButtonLabel() {
      return this.hasSelectedFiles ? `下载目录（${this.selectedFileCount}）` : '下载目录';
    }
  },
  watch: {
    filterRegionList() {
      this.clearSelectedFiles();
      this.clearSelectedProjects();
      this.currentPage = 1;
      this.loadArchives();
    },
    searchText() {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = setTimeout(() => {
        this.clearSelectedFiles();
        this.clearSelectedProjects();
        this.currentPage = 1;
        this.loadArchives();
      }, 300);
    }
  },
  async mounted() {
    if (!this.isAdmin) {
      window.navigateTo('#/home');
      return;
    }
    await this.loadArchives();
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    goHome() {
      this.navigateTo('#/home');
    },
    archiveRowKey(row) {
      return `${row.project_id}_${row.segment_no || 0}`;
    },
    getArchiveFilesCacheKey(row) {
      return this.archiveRowKey(row);
    },
    clearSelectedFiles() {
      this.selectedFileIds = [];
    },
    clearSelectedProjects() {
      this.selectedProjectIds = [];
    },
    isProjectSelected(row) {
      return !!(row && row.project_id && this.selectedProjectIds.includes(row.project_id));
    },
    toggleProjectSelection(row, checked) {
      if (!row || !row.project_id) return;
      const ids = new Set(this.selectedProjectIds);
      if (checked) {
        ids.add(row.project_id);
      } else {
        ids.delete(row.project_id);
      }
      this.selectedProjectIds = [...ids];
    },
    togglePageProjectsSelectAll(checked) {
      const ids = new Set(this.selectedProjectIds);
      this.pageProjectIds.forEach((projectId) => {
        if (checked) {
          ids.add(projectId);
        } else {
          ids.delete(projectId);
        }
      });
      this.selectedProjectIds = [...ids];
    },
    async confirmDeleteArchiveProject(row) {
      if (!row || !row.project_id) return;
      const name = row.project_name || row.project_id;
      try {
        await ElMessageBox.confirm(
          `确定删除项目「${name}」吗？将永久删除归档记录、项目数据及 NAS/本地文件，不可恢复。`,
          '确认删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch {
        return;
      }
      this.deletingProjectId = row.project_id;
      try {
        await DB.deleteProject(row.project_id);
        ElMessage.success('项目已删除');
        this.selectedProjectIds = this.selectedProjectIds.filter((id) => id !== row.project_id);
        await this.loadArchives();
      } catch (error) {
        ElMessage.error('删除失败: ' + error.message);
      }
      this.deletingProjectId = null;
    },
    async confirmDeleteSelectedProjects() {
      if (this.selectedProjectIds.length === 0) return;
      const count = this.selectedProjectIds.length;
      try {
        await ElMessageBox.confirm(
          `确定删除 ${count} 个项目吗？将永久删除归档记录、项目数据及 NAS/本地文件，不可恢复。`,
          '确认批量删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch {
        return;
      }
      this.batchDeletingProjects = true;
      try {
        const res = await DB.deleteProjectsBatch(this.selectedProjectIds);
        const failed = (res.results && res.results.failed) || [];
        if (failed.length > 0) {
          ElMessage.warning(`${res.message || '批量删除完成'}；${failed.length} 个失败`);
        } else {
          ElMessage.success(res.message || '批量删除成功');
        }
        this.clearSelectedProjects();
        await this.loadArchives();
      } catch (error) {
        ElMessage.error('批量删除失败: ' + error.message);
      }
      this.batchDeletingProjects = false;
    },
    isFileSelected(fileId) {
      return this.selectedFileIds.includes(fileId);
    },
    toggleFileSelection(file, checked) {
      if (!file || !file.id || !file.has_nas) return;
      const ids = new Set(this.selectedFileIds);
      if (checked) {
        ids.add(file.id);
      } else {
        ids.delete(file.id);
      }
      this.selectedFileIds = [...ids];
    },
    getSelectableFiles(row) {
      const key = this.getArchiveFilesCacheKey(row);
      const files = this.archiveFilesCache[key] || [];
      return files.filter((f) => f.has_nas);
    },
    isRowAllSelected(row) {
      const selectable = this.getSelectableFiles(row);
      if (selectable.length === 0) return false;
      return selectable.every((f) => this.isFileSelected(f.id));
    },
    isRowIndeterminate(row) {
      const selectable = this.getSelectableFiles(row);
      if (selectable.length === 0) return false;
      const selectedCount = selectable.filter((f) => this.isFileSelected(f.id)).length;
      return selectedCount > 0 && selectedCount < selectable.length;
    },
    toggleRowSelectAll(row, checked) {
      const selectable = this.getSelectableFiles(row);
      const ids = new Set(this.selectedFileIds);
      selectable.forEach((file) => {
        if (checked) {
          ids.add(file.id);
        } else {
          ids.delete(file.id);
        }
      });
      this.selectedFileIds = [...ids];
    },
    getDocTypeLabel(docType) {
      const info = Utils.DOC_TYPES && Utils.DOC_TYPES[docType];
      return (info && info.label) || docType || '附件';
    },
    /**
     * 归档记录状态文案
     * @param {string} status
     * @returns {string}
     */
    archiveStatusLabel(status) {
      const map = {
        pending_paper: '待纸质核对',
        archived: '已归档'
      };
      return map[status] || '已归档';
    },
    /**
     * 归档记录状态标签颜色
     * @param {string} status
     * @returns {string}
     */
    archiveStatusTagType(status) {
      return status === 'pending_paper' ? 'warning' : 'success';
    },
    async loadArchives() {
      this.loading = true;
      try {
        const res = await API.getArchives({
          page: this.currentPage,
          pageSize: this.pageSize,
          search: this.searchText,
          regions: this.filterRegionList
        });
        this.archives = res.items || [];
        this.total = res.total || 0;

        const filesCache = {};
        const loadingState = {};
        const expandedKeys = [];
        this.archives.forEach((row) => {
          const cacheKey = this.archiveRowKey(row);
          const files = Array.isArray(row.files) ? row.files : [];
          filesCache[cacheKey] = files;
          loadingState[cacheKey] = false;
          if (files.length > 0) expandedKeys.push(row.seq_no);
          delete row.files;
        });
        this.archiveFilesCache = filesCache;
        this.archiveFilesLoading = loadingState;
        this.expandedRowKeys = expandedKeys;
        this.clearSelectedFiles();
        this.clearSelectedProjects();
      } catch (error) {
        ElMessage.error('加载归档记录失败: ' + error.message);
      }
      this.loading = false;
    },
    handlePageChange(page) {
      this.currentPage = page;
      this.clearSelectedFiles();
      this.clearSelectedProjects();
      this.loadArchives();
    },
    async handleExpandChange(row, expandedRows) {
      this.expandedRowKeys = (expandedRows || []).map((r) => r.seq_no);
      if (!row) return;
      const isExpanded = expandedRows.some((r) => this.archiveRowKey(r) === this.archiveRowKey(row));
      if (!isExpanded) return;

      const cacheKey = this.getArchiveFilesCacheKey(row);
      if (this.archiveFilesCache[cacheKey]) return;

      this.archiveFilesLoading = { ...this.archiveFilesLoading, [cacheKey]: true };
      try {
        const res = await API.getArchiveProjectFiles(row.project_id, row.segment_no || 0);
        this.archiveFilesCache = {
          ...this.archiveFilesCache,
          [cacheKey]: res.files || []
        };
      } catch (error) {
        ElMessage.error('加载附件失败: ' + error.message);
        this.archiveFilesCache = {
          ...this.archiveFilesCache,
          [cacheKey]: []
        };
      }
      this.archiveFilesLoading = { ...this.archiveFilesLoading, [cacheKey]: false };
    },
    getRowFiles(row) {
      return this.archiveFilesCache[this.getArchiveFilesCacheKey(row)] || [];
    },
    isRowFilesLoading(row) {
      return !!this.archiveFilesLoading[this.getArchiveFilesCacheKey(row)];
    },
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
    },
    async downloadSelectedFiles() {
      if (this.selectedFileIds.length === 0) return;
      this.downloadingZip = true;
      try {
        const result = await API.downloadArchiveFilesZip(this.selectedFileIds);
        if (result.multiple) {
          ElMessage.success(`已开始下载 ${result.totalPackages} 个压缩包`);
        } else {
          ElMessage.success('附件下载成功');
        }
      } catch (error) {
        ElMessage.error('下载失败: ' + error.message);
      }
      this.downloadingZip = false;
    }
  },
  template: `
    <div class="page-container">
      <div class="page-head">
        <div class="head-actions">
          <span class="download-hint" :class="{ 'is-selected': hasSelectedFiles }">
            <template v-if="hasSelectedFiles">已选 {{ selectedFileCount }} 个附件</template>
            <template v-else>展开项目 → 勾选附件 → 下载</template>
          </span>
          <el-tooltip :content="downloadZipTooltip" placement="bottom">
            <span class="navbar-action-tooltip-wrap">
              <el-button
                type="primary"
                :disabled="!hasSelectedFiles"
                :loading="downloadingZip"
                @click="downloadSelectedFiles"
              >
                {{ downloadButtonLabel }}
              </el-button>
            </span>
          </el-tooltip>
          <el-button @click="downloadExcel" :loading="exporting">下载全部归档表格</el-button>
          <el-button
            type="danger"
            plain
            :disabled="!hasSelectedProjects"
            :loading="batchDeletingProjects"
            @click="confirmDeleteSelectedProjects"
          >
            批量删除所选项目
          </el-button>
        </div>
      </div>

      <div style="padding: 20px;" v-loading="loading">
        <div class="search-bar" style="margin-bottom: 16px;">
          <div class="search-bar-filters">
            <el-select
              v-model="filterRegionList"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              placeholder="所属地域"
              class="search-region-select"
            >
              <el-option
                v-for="province in provinceOptions"
                :key="province"
                :label="province"
                :value="province"
              />
            </el-select>
            <el-input
              v-model="searchText"
              placeholder="搜索项目名称或编号（| 或，空格 且）..."
              clearable
            />
          </div>
        </div>

        <el-table
          class="archive-table"
          :data="archives"
          stripe
          style="width: 100%;"
          row-key="seq_no"
          :expand-row-keys="expandedRowKeys"
          @expand-change="handleExpandChange"
        >
          <el-table-column label="选择" width="56" align="center">
            <template #header>
              <el-checkbox
                :model-value="isAllPageProjectsSelected"
                :indeterminate="isPageProjectsIndeterminate"
                @change="togglePageProjectsSelectAll"
              />
            </template>
            <template #default="{ row }">
              <el-checkbox
                :model-value="isProjectSelected(row)"
                @change="toggleProjectSelection(row, $event)"
              />
            </template>
          </el-table-column>
          <el-table-column type="expand">
            <template #default="{ row }">
              <div v-loading="isRowFilesLoading(row)" style="padding: 8px 16px 12px 48px;">
                <div v-if="getRowFiles(row).length > 0" style="margin-bottom: 8px;">
                  <el-checkbox
                    :model-value="isRowAllSelected(row)"
                    :indeterminate="isRowIndeterminate(row)"
                    @change="toggleRowSelectAll(row, $event)"
                  >
                    全选本项附件
                  </el-checkbox>
                </div>
                <div v-if="getRowFiles(row).length === 0 && !isRowFilesLoading(row)" style="color: #909399;">
                  暂无附件
                </div>
                <div
                  v-for="file in getRowFiles(row)"
                  :key="file.id"
                  style="display: flex; align-items: center; gap: 8px; padding: 4px 0;"
                >
                  <el-checkbox
                    :model-value="isFileSelected(file.id)"
                    :disabled="!file.has_nas"
                    @change="toggleFileSelection(file, $event)"
                  />
                  <el-tag size="small" type="info">{{ getDocTypeLabel(file.doc_type) }}</el-tag>
                  <span>{{ file.file_name }}</span>
                  <span v-if="!file.has_nas" style="color: #f56c6c; font-size: 12px;">文件不可用</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="seq_no" label="序号" width="80" />
          <el-table-column prop="project_no" label="项目编号" width="160" />
          <el-table-column prop="project_name" label="项目名称" />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="archiveStatusTagType(row.project_status)">
                {{ archiveStatusLabel(row.project_status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="segment_name" label="标段" width="120" />
          <el-table-column prop="submitted_by_name" label="提交人" width="120" />
          <el-table-column prop="submitted_at" label="提交时间" width="180" />
          <el-table-column label="操作" width="88" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                type="danger"
                link
                :loading="deletingProjectId === row.project_id"
                @click="confirmDeleteArchiveProject(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

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
// 管理员用户管理页面组件
// ============================================

app.component('admin-users-page', {
  emits: ['open-settings'],
  props: {
    currentUser: { type: Object, default: null }
  },
  data() {
    return {
      activeTab: 'departments',
      loading: false,
      // 部门
      departments: [],
      deptDialogVisible: false,
      deptForm: { id: '', name: '', description: '', sortOrder: 0 },
      deptSaving: false,
      // 角色
      roles: [],
      roleDialogVisible: false,
      roleForm: { id: '', name: '', code: '', description: '' },
      roleSaving: false,
      // 用户
      users: [],
      userTotal: 0,
      userPage: 1,
      userPageSize: 20,
      userKeyword: '',
      userDeptFilter: '',
      userDialogVisible: false,
      userForm: { id: '', username: '', password: '', name: '', phone: '', departmentId: '', roleId: '', status: 'active' },
      userSaving: false,
      resetPwdDialogVisible: false,
      resetPwdForm: { userId: '', username: '', password: '' },
      resetPwdSaving: false
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    isEditDept() {
      return !!this.deptForm.id;
    },
    isEditRole() {
      return !!this.roleForm.id;
    },
    isEditUser() {
      return !!this.userForm.id;
    }
  },
  async mounted() {
    if (!this.isAdmin) {
      window.navigateTo('#/home');
      return;
    }
    await this.loadDepartments();
    await this.loadRoles();
    await this.loadUsers();
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    goHome() {
      this.navigateTo('#/home');
    },
    async onTabChange(tab) {
      if (tab === 'departments') await this.loadDepartments();
      if (tab === 'roles') await this.loadRoles();
      if (tab === 'users') await this.loadUsers();
    },
    // ---- 部门 ----
    async loadDepartments() {
      this.loading = true;
      try {
        this.departments = await API.listDepartments();
      } catch (error) {
        ElMessage.error('加载部门失败: ' + error.message);
      }
      this.loading = false;
    },
    openDeptDialog(row) {
      if (row) {
        this.deptForm = { id: row.id, name: row.name, description: row.description || '', sortOrder: row.sortOrder || 0 };
      } else {
        this.deptForm = { id: '', name: '', description: '', sortOrder: 0 };
      }
      this.deptDialogVisible = true;
    },
    async saveDepartment() {
      if (!this.deptForm.name.trim()) {
        ElMessage.warning('请输入部门名称');
        return;
      }
      this.deptSaving = true;
      try {
        const payload = { name: this.deptForm.name.trim(), description: this.deptForm.description.trim(), sortOrder: this.deptForm.sortOrder };
        if (this.isEditDept) {
          await API.updateDepartment(this.deptForm.id, payload);
          ElMessage.success('部门已更新');
        } else {
          await API.createDepartment(payload);
          ElMessage.success('部门已创建');
        }
        this.deptDialogVisible = false;
        await this.loadDepartments();
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.deptSaving = false;
    },
    async deleteDepartment(row) {
      try {
        await ElMessageBox.confirm('确定删除部门「' + row.name + '」吗？', '确认删除', { type: 'warning' });
        await API.deleteDepartment(row.id);
        ElMessage.success('部门已删除');
        await this.loadDepartments();
      } catch (error) {
        if (error !== 'cancel') ElMessage.error(error.message || '删除失败');
      }
    },
    // ---- 角色 ----
    async loadRoles() {
      this.loading = true;
      try {
        this.roles = await API.listRoles();
      } catch (error) {
        ElMessage.error('加载角色失败: ' + error.message);
      }
      this.loading = false;
    },
    openRoleDialog(row) {
      if (row) {
        this.roleForm = { id: row.id, name: row.name, code: row.code, description: row.description || '' };
      } else {
        this.roleForm = { id: '', name: '', code: '', description: '' };
      }
      this.roleDialogVisible = true;
    },
    async saveRole() {
      if (!this.roleForm.name.trim()) {
        ElMessage.warning('请输入角色名称');
        return;
      }
      if (!this.isEditRole && !this.roleForm.code.trim()) {
        ElMessage.warning('请输入权限码');
        return;
      }
      this.roleSaving = true;
      try {
        const payload = { name: this.roleForm.name.trim(), description: this.roleForm.description.trim() };
        if (this.isEditRole) {
          await API.updateRole(this.roleForm.id, payload);
          ElMessage.success('角色已更新');
        } else {
          await API.createRole({ ...payload, code: this.roleForm.code.trim() });
          ElMessage.success('角色已创建');
        }
        this.roleDialogVisible = false;
        await this.loadRoles();
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.roleSaving = false;
    },
    async deleteRole(row) {
      try {
        await ElMessageBox.confirm('确定删除角色「' + row.name + '」吗？', '确认删除', { type: 'warning' });
        await API.deleteRole(row.id);
        ElMessage.success('角色已删除');
        await this.loadRoles();
      } catch (error) {
        if (error !== 'cancel') ElMessage.error(error.message || '删除失败');
      }
    },
    // ---- 用户 ----
    async loadUsers() {
      this.loading = true;
      try {
        const res = await API.listUsers(this.userPage, this.userPageSize, this.userKeyword, this.userDeptFilter);
        this.users = res.list || [];
        this.userTotal = res.total || 0;
      } catch (error) {
        ElMessage.error('加载用户失败: ' + error.message);
      }
      this.loading = false;
    },
    searchUsers() {
      this.userPage = 1;
      this.loadUsers();
    },
    handleUserPageChange(page) {
      this.userPage = page;
      this.loadUsers();
    },
    openUserDialog(row) {
      if (row) {
        this.userForm = {
          id: row.id, username: row.username, password: '', name: row.name,
          phone: row.phone || '',
          departmentId: row.departmentId, roleId: row.roleId, status: row.status || 'active'
        };
      } else {
        const defaultDept = this.departments[0];
        const defaultRole = this.roles.find(r => r.code === 'user') || this.roles[0];
        this.userForm = {
          id: '', username: '', password: '', name: '', phone: '',
          departmentId: defaultDept ? defaultDept.id : '',
          roleId: defaultRole ? defaultRole.id : '',
          status: 'active'
        };
      }
      this.userDialogVisible = true;
    },
    async saveUser() {
      const f = this.userForm;
      if (!f.name.trim()) { ElMessage.warning('请输入姓名'); return; }
      if (!this.isEditUser) {
        if (!f.username.trim()) { ElMessage.warning('请输入用户名'); return; }
        if (!f.password || f.password.length < 6) { ElMessage.warning('密码至少 6 位'); return; }
      }
      const phone = (f.phone || '').trim();
      if (phone && !/^1\d{10}$/.test(phone)) {
        ElMessage.warning('手机号格式不正确（需为 11 位大陆手机号）');
        return;
      }
      if (!f.departmentId) { ElMessage.warning('请选择部门'); return; }
      if (!f.roleId) { ElMessage.warning('请选择角色'); return; }
      this.userSaving = true;
      try {
        if (this.isEditUser) {
          await API.updateUser(f.id, {
            name: f.name.trim(), phone, departmentId: f.departmentId, roleId: f.roleId, status: f.status
          });
          ElMessage.success('用户已更新');
        } else {
          await API.createUser({
            username: f.username.trim(), password: f.password, name: f.name.trim(), phone,
            departmentId: f.departmentId, roleId: f.roleId, status: f.status
          });
          ElMessage.success('用户已创建');
        }
        this.userDialogVisible = false;
        await this.loadUsers();
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.userSaving = false;
    },
    async deleteUser(row) {
      try {
        await ElMessageBox.confirm('确定删除用户「' + row.name + '」吗？', '确认删除', { type: 'warning' });
        await API.deleteUser(row.id);
        ElMessage.success('用户已删除');
        await this.loadUsers();
      } catch (error) {
        if (error !== 'cancel') ElMessage.error(error.message || '删除失败');
      }
    },
    openResetPwdDialog(row) {
      this.resetPwdForm = { userId: row.id, username: row.username, password: '' };
      this.resetPwdDialogVisible = true;
    },
    async saveResetPassword() {
      if (!this.resetPwdForm.password || this.resetPwdForm.password.length < 6) {
        ElMessage.warning('新密码至少 6 位');
        return;
      }
      this.resetPwdSaving = true;
      try {
        await API.resetUserPassword(this.resetPwdForm.userId, this.resetPwdForm.password);
        ElMessage.success('密码已重置');
        this.resetPwdDialogVisible = false;
      } catch (error) {
        ElMessage.error(error.message || '重置失败');
      }
      this.resetPwdSaving = false;
    }
  },
  template: `
    <div class="page-container">
      <div style="padding: 20px;" v-loading="loading">
        <el-tabs v-model="activeTab" @tab-change="onTabChange">
          <!-- 部门管理 -->
          <el-tab-pane label="部门管理" name="departments">
            <div style="margin-bottom: 16px;">
              <el-button type="primary" @click="openDeptDialog()">新增部门</el-button>
            </div>
            <el-table :data="departments" stripe style="width: 100%;">
              <el-table-column prop="name" label="部门名称" />
              <el-table-column prop="description" label="描述" />
              <el-table-column prop="userCount" label="用户数" width="100" />
              <el-table-column prop="sortOrder" label="排序" width="80" />
              <el-table-column label="操作" width="180">
                <template #default="{ row }">
                  <el-button size="small" @click="openDeptDialog(row)">编辑</el-button>
                  <el-button size="small" type="danger" @click="deleteDepartment(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <!-- 角色管理 -->
          <el-tab-pane label="角色管理" name="roles">
            <div style="margin-bottom: 16px;">
              <el-button type="primary" @click="openRoleDialog()">新增角色</el-button>
            </div>
            <el-table :data="roles" stripe style="width: 100%;">
              <el-table-column prop="name" label="角色名称" />
              <el-table-column prop="code" label="权限码" width="120" />
              <el-table-column prop="description" label="描述" />
              <el-table-column prop="userCount" label="用户数" width="100" />
              <el-table-column label="系统内置" width="100">
                <template #default="{ row }">
                  <el-tag v-if="row.isSystem" size="small">是</el-tag>
                  <span v-else>否</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180">
                <template #default="{ row }">
                  <el-button size="small" @click="openRoleDialog(row)">编辑</el-button>
                  <el-button size="small" type="danger" :disabled="row.code === 'admin'" @click="deleteRole(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <!-- 用户管理 -->
          <el-tab-pane label="用户管理" name="users">
            <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
              <el-input v-model="userKeyword" placeholder="搜索用户名/姓名/手机号" clearable style="width: 220px;" @keyup.enter="searchUsers" />
              <el-select v-model="userDeptFilter" placeholder="筛选部门" clearable style="width: 180px;" @change="searchUsers">
                <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
              <el-button @click="searchUsers">搜索</el-button>
              <el-button type="primary" @click="openUserDialog()">新增用户</el-button>
            </div>
            <el-table :data="users" stripe style="width: 100%;">
              <el-table-column prop="username" label="用户名" width="120" />
              <el-table-column prop="phone" label="手机号" width="130" />
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column prop="departmentName" label="部门" />
              <el-table-column prop="roleName" label="角色" width="120" />
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                    {{ row.status === 'active' ? '启用' : '禁用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="260">
                <template #default="{ row }">
                  <el-button size="small" @click="openUserDialog(row)">编辑</el-button>
                  <el-button size="small" @click="openResetPwdDialog(row)">重置密码</el-button>
                  <el-button size="small" type="danger" @click="deleteUser(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
              <el-pagination
                v-if="userTotal > userPageSize"
                layout="prev, pager, next, total"
                :total="userTotal"
                :page-size="userPageSize"
                :current-page="userPage"
                @current-change="handleUserPageChange"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 部门弹窗 -->
      <el-dialog v-model="deptDialogVisible" :title="isEditDept ? '编辑部门' : '新增部门'" width="480px" :close-on-click-modal="false">
        <el-form label-position="top">
          <el-form-item label="部门名称">
            <el-input v-model="deptForm.name" placeholder="请输入部门名称" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="deptForm.description" type="textarea" placeholder="可选" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="deptForm.sortOrder" :min="0" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="deptDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveDepartment" :loading="deptSaving">保存</el-button>
        </template>
      </el-dialog>

      <!-- 角色弹窗 -->
      <el-dialog v-model="roleDialogVisible" :title="isEditRole ? '编辑角色' : '新增角色'" width="480px" :close-on-click-modal="false">
        <el-form label-position="top">
          <el-form-item label="角色名称">
            <el-input v-model="roleForm.name" placeholder="如：审计员" />
          </el-form-item>
          <el-form-item v-if="!isEditRole" label="权限码">
            <el-input v-model="roleForm.code" placeholder="小写字母开头，如 auditor" />
          </el-form-item>
          <el-form-item v-else label="权限码">
            <el-input :value="roleForm.code" disabled />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="roleForm.description" type="textarea" placeholder="可选" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="roleDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveRole" :loading="roleSaving">保存</el-button>
        </template>
      </el-dialog>

      <!-- 用户弹窗 -->
      <el-dialog v-model="userDialogVisible" :title="isEditUser ? '编辑用户' : '新增用户'" width="480px" :close-on-click-modal="false">
        <el-form label-position="top">
          <el-form-item v-if="!isEditUser" label="用户名">
            <el-input v-model="userForm.username" placeholder="登录用户名" />
          </el-form-item>
          <el-form-item v-else label="用户名">
            <el-input :value="userForm.username" disabled />
          </el-form-item>
          <el-form-item v-if="!isEditUser" label="密码">
            <el-input v-model="userForm.password" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
          <el-form-item label="姓名">
            <el-input v-model="userForm.name" placeholder="显示名称" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="userForm.phone" placeholder="可选，11 位大陆手机号，可用于登录" maxlength="11" />
          </el-form-item>
          <el-form-item label="部门">
            <el-select v-model="userForm.departmentId" placeholder="选择部门" style="width: 100%;">
              <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="角色">
            <el-select v-model="userForm.roleId" placeholder="选择角色" style="width: 100%;">
              <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="userForm.status" style="width: 100%;">
              <el-option label="启用" value="active" />
              <el-option label="禁用" value="disabled" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="userDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveUser" :loading="userSaving">保存</el-button>
        </template>
      </el-dialog>

      <!-- 重置密码弹窗 -->
      <el-dialog v-model="resetPwdDialogVisible" title="重置密码" width="400px" :close-on-click-modal="false">
        <el-form label-position="top">
          <el-form-item label="用户">
            <el-input :value="resetPwdForm.username" disabled />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="resetPwdForm.password" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="resetPwdDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveResetPassword" :loading="resetPwdSaving">确认重置</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

// ============================================
// 注册 Element Plus 并挂载应用
// ============================================

app.use(ElementPlus, {
  locale: (typeof ElementPlusLocaleZhCn !== 'undefined' ? ElementPlusLocaleZhCn : ElementPlus.lang?.zhCn)
});
app.mount('#app');
