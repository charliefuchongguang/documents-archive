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
 *   #/projects/:cat → { name: 'home', params: { category } }（tender|consult|cost）
 *   #/project/:id   → { name: 'project', params: { id } }
 *   #/review/:id    → { name: 'review', params: { id } }
 *   #/admin-archives → { name: 'admin-archives', params: {} }
 *   #/admin-contracts → { name: 'admin-contracts', params: {} }
 *   #/admin-users   → { name: 'admin-users', params: {} }
 * @returns {{path: string, name: string, params: Object}}
 */
function parseRoute() {
  const hash = window.location.hash || '#/workbench';
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

  // 匹配 /admin-contracts
  if (path === '/admin-contracts') {
    return { path, name: 'admin-contracts', params: {} };
  }

  // 匹配 /admin-users
  if (path === '/admin-users') {
    return { path, name: 'admin-users', params: {} };
  }

  // 工作台（登录后默认首页）
  if (path === '/workbench') {
    return { path, name: 'workbench', params: {} };
  }

  // 项目列表：/projects 或 /projects/:category
  const listMatch = path.match(/^\/projects(?:\/(tender|consult|cost))?$/);
  if (listMatch) {
    return { path, name: 'home', params: { category: listMatch[1] || '' } };
  }

  // 兼容旧地址 /home、/
  if (path === '/home' || path === '/') {
    return { path, name: 'home', params: { category: '' } };
  }

  // 其余未知路径回到工作台
  return { path, name: 'workbench', params: {} };
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
      const cat = (this.route.params && this.route.params.category) || '';
      if (name === 'home') {
        const map = { tender: '招标项目', consult: '咨询项目', cost: '造价项目' };
        return map[cat] || '全部项目';
      }
      const map = {
        workbench: '工作台',
        project: '项目详情',
        review: '复核并确认信息',
        'admin-archives': '归档记录',
        'admin-contracts': '合同管理',
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

          <div class="shell-nav-group">项目</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('home', '') }" role="button" tabindex="0"
               @click="go('#/projects')" @keydown.enter="go('#/projects')">全部项目</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('home', 'tender') }" role="button" tabindex="0"
               @click="go('#/projects/tender')" @keydown.enter="go('#/projects/tender')">招标项目</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('home', 'consult') }" role="button" tabindex="0"
               @click="go('#/projects/consult')" @keydown.enter="go('#/projects/consult')">咨询项目</div>
          <div class="shell-nav-item" :class="{ 'is-active': navActive('home', 'cost') }" role="button" tabindex="0"
               @click="go('#/projects/cost')" @keydown.enter="go('#/projects/cost')">造价项目</div>

          <template v-if="isAdmin">
            <div class="shell-nav-group">归档</div>
            <div class="shell-nav-item" :class="{ 'is-active': navActive('admin-archives') }" role="button" tabindex="0"
                 @click="go('#/admin-archives')" @keydown.enter="go('#/admin-archives')">归档记录</div>
            <div class="shell-nav-item" :class="{ 'is-active': navActive('admin-contracts') }" role="button" tabindex="0"
                 @click="go('#/admin-contracts')" @keydown.enter="go('#/admin-contracts')">合同管理</div>
            <div class="shell-nav-group">系统</div>
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
              <input v-model="searchText" type="search" placeholder="搜索项目名称 / 编号 / 负责人" aria-label="搜索项目" />
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
      this.createCategory = category;
      this.newName = '未命名项目 ' + Utils.formatDate(new Date());
      this.newRegion = '';
      this.newProcurement = 'G';
      this.showCreate = true;
    },
    async createProject() {
      const name = String(this.newName || '').trim();
      if (!name) {
        ElMessage.warning('请输入项目名称');
        return;
      }
      if (!this.newRegion) {
        ElMessage.warning('请选择所属地域');
        return;
      }
      this.creating = true;
      try {
        const projectId = await DB.createProject(name, this.createCategory, {
          region: this.newRegion,
          procurementType: this.newProcurement
        });
        ElMessage.success('项目已创建');
        this.showCreate = false;
        window.navigateTo('#/project/' + projectId);
      } catch (error) {
        ElMessage.error(error.message || '创建项目失败');
      } finally {
        this.creating = false;
      }
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
                <button class="primary" @click="openCreate('tender')"><span class="plus"></span>新建招标项目</button>
                <button @click="openCreate('consult')"><span class="plus"></span>新建咨询项目</button>
                <button @click="openCreate('cost')"><span class="plus"></span>新建造价项目</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-dialog v-model="showCreate" :title="createTitle" width="480px">
        <el-form label-width="88px">
          <el-form-item label="项目名称" required>
            <el-input v-model="newName" placeholder="输入项目名称" @keyup.enter="createProject" />
          </el-form-item>
          <el-form-item label="所属地域" required>
            <el-select v-model="newRegion" placeholder="请选择省份" filterable style="width: 100%;">
              <el-option v-for="p in provinceOptions" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="采购类型" required>
            <el-select v-model="newProcurement" style="width: 100%;">
              <el-option label="工程(G)" value="G" />
              <el-option label="货物(H)" value="H" />
              <el-option label="服务(F)" value="F" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreate = false">取消</el-button>
          <el-button type="primary" :loading="creating" @click="createProject">创建</el-button>
        </template>
      </el-dialog>
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
    currentUser: {
      type: Object,
      default: null
    },
    /** 侧栏进入的分类过滤：'' 表示全部 */
    category: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      projects: [],      // 项目列表数据
      /** @type {Array<{ id: string, name: string, sortOrder: number }>} 可见部门骨架（含无项目） */
      departments: [],
      searchText: '',    // 搜索关键词
      /** @type {string} 关键词限定字段 */
      searchField: 'name_overview',
      /** @type {Array<'tender'|'consult'|'cost'>} 项目类型多选筛选，空数组表示全部 */
      filterCategoryList: [],
      /** @type {string[]} 状态多选筛选 */
      filterStatusList: [],
      /** @type {string[]} 所属地域多选筛选 */
      filterRegionList: [],
      /** @type {string[]} 招标类型/内容多选筛选 */
      filterTenderTypeList: [],
      /** @type {string[]} 项目类型多选筛选 */
      filterProjectTypeList: [],
      /** @type {string[]} 道路等级多选筛选 */
      filterRoadLevelList: [],
      /** @type {string[]} 行业多选筛选 */
      filterIndustryList: [],
      showAdvancedFilters: false,
      dateField: 'winNoticeDate',
      dateFrom: '',
      dateTo: '',
      amountField: 'totalInvestment',
      amountMin: '',
      amountMax: '',
      mileageMin: '',
      mileageMax: '',
      /** @type {{ inProgress: number, pendingReview: number, reviewRejected: number, archived: number }} */
      projectStats: { inProgress: 0, pendingReview: 0, reviewRejected: 0, pendingPaper: 0, archived: 0 },
      searchDebounceTimer: null,
      _homeMounted: false,
      showCreateDialog: false, // 新建项目弹窗开关
      /** @type {'tender'|'consult'|'cost'} 当前新建对话框对应的业务分类 */
      createCategoryCode: 'tender',
      newProjectName: '', // 新建项目名称
      newProjectRegion: '', // 新建所属地域
      newProjectProcurementType: 'G', // 新建采购类型
      creatingProject: false,
      loading: true,     // 加载状态
      projectPage: 1,
      projectPageSize: 100,
      projectTotal: 0,
      /** @type {Record<string, boolean>} 折叠的部门 id → true */
      collapsedDeptIds: {},
      /** @type {Record<string, boolean>} 折叠的「部门+分类」键 → true */
      collapsedCatKeys: {},
      // ---- 调整归属弹窗 ----
      showOwnershipDialog: false,
      ownershipSaving: false,
      ownershipLoadingUsers: false,
      ownershipProject: null,
      ownershipForm: {
        departmentId: '',
        ownerUserId: ''
      },
      ownershipUsers: []
    };
  },
  computed: {
    /**
     * 非普通用户（roleCode !== 'user'），列表/统计可见全部项目
     * @returns {boolean}
     */
    isPrivilegedUser() {
      const u = this.currentUser;
      const code = u && (u.roleCode || u.role || 'user');
      return code !== 'user';
    },
    /**
     * 是否存在收窄列表的筛选条件（空状态多选视为全部状态，不算收窄）
     * @returns {boolean}
     */
    hasNarrowingFilters() {
      return !!(this.searchText || this.filterCategoryList.length > 0
        || this.filterStatusList.length > 0 || this.filterRegionList.length > 0
        || this.filterTenderTypeList.length > 0 || this.filterProjectTypeList.length > 0
        || this.filterRoadLevelList.length > 0 || this.filterIndustryList.length > 0
        || this.dateFrom || this.dateTo
        || this.amountMin !== '' || this.amountMax !== ''
        || this.mileageMin !== '' || this.mileageMax !== '');
    },
    searchFieldOptions() {
      return [
        { value: 'name_overview', label: '项目名称/概况' },
        { value: 'projectManager', label: '项目负责人' },
        { value: 'techManager', label: '技术负责人' }
      ];
    },
    /**
     * 可点状态统计 chips：标签、状态值与实时计数（点击即按状态筛选）
     * @returns {Array<{ status: string, label: string, count: number }>}
     */
    statusChips() {
      return [
        { status: 'draft', label: '待提交', count: this.projectStats.inProgress },
        { status: 'pending_review', label: '待审核', count: this.projectStats.pendingReview },
        { status: 'pending_paper', label: '待纸质核对', count: this.projectStats.pendingPaper },
        { status: 'review_rejected', label: '审核驳回', count: this.projectStats.reviewRejected },
        { status: 'archived', label: '已归档', count: this.projectStats.archived }
      ];
    },
    /**
     * 更多筛选面板中已生效的条件数（按钮徽标；项目分类仅在全部项目视图计入）
     * @returns {number}
     */
    advancedFilterCount() {
      let n = 0;
      if (!this.category && this.filterCategoryList.length > 0) n += 1;
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
    dateFieldLabel() {
      return this.dateField === 'entrustDate' ? '委托时间' : '中标通知书时间';
    },
    amountFieldLabel() {
      return this.amountField === 'winAmount' ? '中标金额' : '项目总投资';
    },
    /**
     * 已选条件 chips（仅面板内条件；状态筛选由常驻统计 chips 承担，不在此重复）
     * @returns {Array<{ key: string, label: string }>}
     */
    activeFilterChips() {
      const chips = [];
      const catNames = { tender: '招标', consult: '咨询', cost: '造价' };
      if (!this.category && this.filterCategoryList.length > 0) {
        chips.push({ key: 'category', label: '项目分类：' + this.filterCategoryList.map((c) => catNames[c] || c).join('、') });
      }
      if (this.filterRegionList.length > 0) {
        chips.push({ key: 'region', label: '所属地域：' + this.filterRegionList.join('、') });
      }
      if (this.filterTenderTypeList.length > 0) {
        chips.push({ key: 'tenderType', label: '招标类型/内容：' + this.filterTenderTypeList.join('、') });
      }
      if (this.filterProjectTypeList.length > 0) {
        chips.push({ key: 'projectType', label: '项目类型：' + this.filterProjectTypeList.join('、') });
      }
      if (this.filterRoadLevelList.length > 0) {
        chips.push({ key: 'roadLevel', label: '道路等级：' + this.filterRoadLevelList.join('、') });
      }
      if (this.filterIndustryList.length > 0) {
        chips.push({ key: 'industry', label: '行业：' + this.filterIndustryList.join('、') });
      }
      if (this.dateFrom || this.dateTo) {
        chips.push({ key: 'date', label: this.dateFieldLabel + '：' + (this.dateFrom || '不限') + ' ~ ' + (this.dateTo || '不限') });
      }
      if (this.amountMin !== '' || this.amountMax !== '') {
        chips.push({ key: 'amount', label: this.amountFieldLabel + '（万元）：' + (this.amountMin || '不限') + ' ~ ' + (this.amountMax || '不限') });
      }
      if (this.mileageMin !== '' || this.mileageMax !== '') {
        chips.push({ key: 'mileage', label: '里程（公里）：' + (this.mileageMin || '不限') + ' ~ ' + (this.mileageMax || '不限') });
      }
      return chips;
    },
    tenderTypeFilterOptions() {
      return Utils.ENUMS.tenderType || [];
    },
    projectTypeFilterOptions() {
      return Utils.ENUMS.projectType || [];
    },
    roadLevelFilterOptions() {
      return Utils.ENUMS.roadLevel || [];
    },
    industryFilterOptions() {
      return Utils.ENUMS.industry || [];
    },
    /**
     * 所属地域选项（省份列表）
     * @returns {string[]}
     */
    provinceOptions() {
      return Utils.PROVINCES;
    },
    /**
     * 符合条件的项目超过一页时显示分页
     * @returns {boolean}
     */
    showProjectPagination() {
      return this.projectTotal > this.projectPageSize;
    },
    /**
     * 按所属部门分组，部门内再按业务分类（招标/咨询/造价）分子组
     * 有搜索词或分类/状态筛选时仅展示有匹配项目的部门；否则展示全部可见部门（含空部门）
     * 分类子组仅展示有项目的分类
     * @returns {Array<{
     *   departmentId: string,
     *   departmentName: string,
     *   departmentSortOrder: number,
     *   projects: Array,
     *   categories: Array<{ categoryId: string, categoryCode: string, categoryName: string, categorySortOrder: number, projects: Array }>
     * }>}
     */
    groupedProjects() {
      const groups = new Map();
      const filtering = this.hasNarrowingFilters;

      if (!filtering) {
        for (const dept of this.departments) {
          groups.set(dept.id, {
            departmentId: dept.id,
            departmentName: dept.name,
            departmentSortOrder: Number.isFinite(dept.sortOrder) ? dept.sortOrder : 0,
            projects: [],
            categories: []
          });
        }
      }

      for (const project of this.projects) {
        const departmentId = project.departmentId || '_none';
        const departmentName = project.departmentName || '未分配部门';
        const departmentSortOrder = departmentId === '_none'
          ? Number.MAX_SAFE_INTEGER
          : (Number.isFinite(project.departmentSortOrder)
            ? project.departmentSortOrder
            : Number.MAX_SAFE_INTEGER);
        if (!groups.has(departmentId)) {
          groups.set(departmentId, {
            departmentId,
            departmentName,
            departmentSortOrder,
            projects: [],
            categories: []
          });
        }
        groups.get(departmentId).projects.push(project);
      }

      const deptGroups = Array.from(groups.values()).sort((a, b) => {
        if (a.departmentSortOrder !== b.departmentSortOrder) {
          return a.departmentSortOrder - b.departmentSortOrder;
        }
        return String(a.departmentName).localeCompare(String(b.departmentName), 'zh');
      });

      for (const group of deptGroups) {
        const catMap = new Map();
        for (const project of group.projects) {
          const categoryId = project.categoryId || 'cat_tender';
          const categoryCode = project.categoryCode || 'tender';
          const categoryName = project.categoryName || '招标';
          const categorySortOrder = Number.isFinite(project.categorySortOrder)
            ? project.categorySortOrder
            : 1;
          if (!catMap.has(categoryId)) {
            catMap.set(categoryId, {
              categoryId,
              categoryCode,
              categoryName,
              categorySortOrder,
              projects: []
            });
          }
          catMap.get(categoryId).projects.push(project);
        }
        group.categories = Array.from(catMap.values()).sort((a, b) => {
          if (a.categorySortOrder !== b.categorySortOrder) {
            return a.categorySortOrder - b.categorySortOrder;
          }
          return String(a.categoryName).localeCompare(String(b.categoryName), 'zh');
        });
      }

      return deptGroups;
    },
    /**
     * 新建弹窗标题（分类在弹窗内选择，标题保持通用）
     * @returns {string}
     */
    createDialogTitle() {
      return '新建项目';
    },
    /**
     * 当前用户是否为管理员
     * @returns {boolean}
     */
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    }
  },
  watch: {
    filterCategoryList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterStatusList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterRegionList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterTenderTypeList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterProjectTypeList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterRoadLevelList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    filterIndustryList() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    searchField() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    dateField() { this._onAdvancedFilterChange(); },
    dateFrom() { this._onAdvancedFilterChange(); },
    dateTo() { this._onAdvancedFilterChange(); },
    amountField() { this._onAdvancedFilterChange(); },
    amountMin() { this._onAdvancedFilterChange(); },
    amountMax() { this._onAdvancedFilterChange(); },
    mileageMin() { this._onAdvancedFilterChange(); },
    mileageMax() { this._onAdvancedFilterChange(); },
    searchText() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = setTimeout(() => {
        this.saveHomeFilters();
        this.loadProjects();
      }, 300);
    },
    /**
     * 侧栏切换分类：同一组件实例复用，需重新应用过滤
     * （本 watcher 原本写在第二个 watch 块里，JS 对象重复键会覆盖前一个 watch 块，
     *   导致筛选/搜索监听全部失效，已合并至此——勿再拆出第二个 watch 块）
     */
    category() {
      if (this.category) {
        this.applyRouteCategory();
      } else {
        this.filterCategoryList = [];
      }
      this.projectPage = 1;
      this.loadProjects();
    }
  },
  async mounted() {
    if (this.category) {
      this.applyRouteCategory();
    } else {
      this.initHomeFilters();
    }
    this.applyPendingShellSearch();
    this._onShellSearch = (event) => {
      this.applyShellSearch(event.detail);
    };
    window.addEventListener('shell-search', this._onShellSearch);
    await this.loadProjects();
    this._homeMounted = true;
  },
  beforeUnmount() {
    if (this._onShellSearch) {
      window.removeEventListener('shell-search', this._onShellSearch);
    }
  },
  methods: {
    /**
     * 按侧栏分类路由应用过滤（显示该分类全部状态）
     */
    applyRouteCategory() {
      this.applyDefaultFilters();
      this.filterCategoryList = [this.category];
      this.filterStatusList = [];
    },
    /**
     * 消费顶栏搜索留下的待应用关键词
     */
    applyPendingShellSearch() {
      if (typeof window.__pendingProjectSearch === 'string') {
        const text = window.__pendingProjectSearch;
        window.__pendingProjectSearch = undefined;
        if (text) {
          this.searchText = text;
        }
      }
    },
    /**
     * 顶栏搜索事件（已在列表页时）
     * @param {string} keyword
     */
    applyShellSearch(keyword) {
      this.searchText = String(keyword || '');
      this.projectPage = 1;
      this.saveHomeFilters();
      this.loadProjects();
    },
    /**
     * 高级筛选变更（防抖）
     */
    _onAdvancedFilterChange() {
      if (!this._homeMounted) return;
      this.projectPage = 1;
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = setTimeout(() => {
        this.saveHomeFilters();
        this.loadProjects();
      }, 300);
    },
    /**
     * 导航到指定路径
     * @param {string} path
     */
    navigateTo(path) {
      window.navigateTo(path);
    },
    /**
     * 初始化筛选：有会话缓存则恢复，否则按角色应用默认值
     */
    initHomeFilters() {
      const cached = window.HomeFilterStorage
        ? window.HomeFilterStorage.load(this.currentUser)
        : null;
      if (cached) {
        this.applyFilterState(cached);
        return;
      }
      this.applyDefaultFilters();
    },
    /**
     * @param {Object} state
     */
    applyFilterState(state) {
      this.searchText = state.searchText || '';
      this.searchField = state.searchField || 'name_overview';
      this.filterCategoryList = state.filterCategoryList || [];
      this.filterStatusList = state.filterStatusList || [];
      this.filterRegionList = state.filterRegionList || [];
      this.filterTenderTypeList = state.filterTenderTypeList || [];
      this.filterProjectTypeList = state.filterProjectTypeList || [];
      this.filterRoadLevelList = state.filterRoadLevelList || [];
      this.filterIndustryList = state.filterIndustryList || [];
      this.showAdvancedFilters = !!state.showAdvancedFilters;
      this.dateField = state.dateField || 'winNoticeDate';
      this.dateFrom = state.dateFrom || '';
      this.dateTo = state.dateTo || '';
      this.amountField = state.amountField || 'totalInvestment';
      this.amountMin = state.amountMin !== undefined && state.amountMin !== null ? state.amountMin : '';
      this.amountMax = state.amountMax !== undefined && state.amountMax !== null ? state.amountMax : '';
      this.mileageMin = state.mileageMin !== undefined && state.mileageMin !== null ? state.mileageMin : '';
      this.mileageMax = state.mileageMax !== undefined && state.mileageMax !== null ? state.mileageMax : '';
      this.projectPage = state.projectPage || 1;
    },
    /**
     * 按角色重置全部筛选为默认值（新登录、无缓存时使用）
     */
    applyDefaultFilters() {
      this.searchText = '';
      this.searchField = 'name_overview';
      this.filterCategoryList = [];
      this.filterRegionList = [];
      this.filterTenderTypeList = [];
      this.filterProjectTypeList = [];
      this.filterRoadLevelList = [];
      this.filterIndustryList = [];
      this.showAdvancedFilters = false;
      this.dateField = 'winNoticeDate';
      this.dateFrom = '';
      this.dateTo = '';
      this.amountField = 'totalInvestment';
      this.amountMin = '';
      this.amountMax = '';
      this.mileageMin = '';
      this.mileageMax = '';
      this.projectPage = 1;
      this.filterStatusList = this.isPrivilegedUser
        ? ['pending_review', 'pending_paper']
        : ['pending_review', 'review_rejected'];
    },
    /**
     * 将当前筛选写入 sessionStorage（登录会话内有效）
     */
    saveHomeFilters() {
      if (!this.currentUser || !window.HomeFilterStorage) return;
      window.HomeFilterStorage.save(this.currentUser, {
        searchText: this.searchText,
        searchField: this.searchField,
        filterCategoryList: this.filterCategoryList,
        filterStatusList: this.filterStatusList,
        filterRegionList: this.filterRegionList,
        filterTenderTypeList: this.filterTenderTypeList,
        filterProjectTypeList: this.filterProjectTypeList,
        filterRoadLevelList: this.filterRoadLevelList,
        filterIndustryList: this.filterIndustryList,
        showAdvancedFilters: this.showAdvancedFilters,
        dateField: this.dateField,
        dateFrom: this.dateFrom,
        dateTo: this.dateTo,
        amountField: this.amountField,
        amountMin: this.amountMin,
        amountMax: this.amountMax,
        mileageMin: this.mileageMin,
        mileageMax: this.mileageMax,
        projectPage: this.projectPage
      });
    },
    /**
     * 从后端加载项目列表、可见部门与全局统计
     */
    async loadProjects() {
      this.loading = true;
      try {
        const result = await DB.getProjects({
          search: this.searchText,
          searchField: this.searchField,
          categoryCodes: this.filterCategoryList,
          statuses: this.filterStatusList,
          regions: this.filterRegionList,
          tenderTypes: this.filterTenderTypeList,
          projectTypes: this.filterProjectTypeList,
          roadLevels: this.filterRoadLevelList,
          industries: this.filterIndustryList,
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
        this.departments = result.departments || [];
        this.projectTotal = result.total || 0;
        this.projectPage = result.page || this.projectPage;
        this.projectStats = result.stats || { inProgress: 0, pendingReview: 0, reviewRejected: 0, pendingPaper: 0, archived: 0 };
        this.projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        this.syncDefaultCollapseState();
      } catch (error) {
        ElMessage.error('加载项目列表失败: ' + error.message);
      }
      this.loading = false;
    },
    /**
     * 切换更多筛选面板
     */
    toggleAdvancedFilters() {
      this.showAdvancedFilters = !this.showAdvancedFilters;
      this.saveHomeFilters();
    },
    /**
     * 点击状态统计 chip：切换对应状态筛选（由 watcher 触发重新加载）
     * @param {string} status
     */
    toggleStatusChip(status) {
      const i = this.filterStatusList.indexOf(status);
      if (i >= 0) {
        this.filterStatusList.splice(i, 1);
      } else {
        this.filterStatusList.push(status);
      }
    },
    /**
     * 移除单个已选条件 chip（清空对应字段，由 watcher 触发重新加载）
     * @param {{ key: string }} chip
     */
    removeFilterChip(chip) {
      switch (chip.key) {
        case 'category': this.filterCategoryList = []; break;
        case 'region': this.filterRegionList = []; break;
        case 'tenderType': this.filterTenderTypeList = []; break;
        case 'projectType': this.filterProjectTypeList = []; break;
        case 'roadLevel': this.filterRoadLevelList = []; break;
        case 'industry': this.filterIndustryList = []; break;
        case 'date': this.dateFrom = ''; this.dateTo = ''; break;
        case 'amount': this.amountMin = ''; this.amountMax = ''; break;
        case 'mileage': this.mileageMin = ''; this.mileageMax = ''; break;
      }
    },
    /**
     * 清空更多筛选面板内的全部条件（不影响关键词与状态 chips；分类路由下保留路由分类）
     */
    clearPanelFilters() {
      if (!this.category) this.filterCategoryList = [];
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
    },
    /**
     * 项目列表翻页
     * @param {number} page
     */
    onProjectPageChange(page) {
      this.projectPage = page;
      this.saveHomeFilters();
      this.loadProjects();
    },
    /**
     * 打开新建项目弹窗，默认名称为"未命名项目 + 当天日期"
     * @param {'tender'|'consult'|'cost'} [categoryCode='tender']
     */
    openCreateDialog(categoryCode = 'tender') {
      this.createCategoryCode = categoryCode || 'tender';
      this.newProjectName = '未命名项目 ' + Utils.formatDate(new Date());
      this.newProjectRegion = '';
      this.newProjectProcurementType = 'G';
      this.showCreateDialog = true;
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
     * 创建新项目并跳转到项目详情页（咨询/造价暂复用招标详情流程）
     * 创建前确认所属地域、采购类型（创建后普通用户不可改）
     */
    async createProject() {
      const name = String(this.newProjectName || '').trim();
      if (!name) {
        ElMessage.warning('请输入项目名称');
        return;
      }
      if (!this.newProjectRegion) {
        ElMessage.warning('请选择所属地域');
        return;
      }
      if (!this.newProjectProcurementType) {
        ElMessage.warning('请选择采购类型');
        return;
      }

      const typeLabel = this.procurementTypeLabel(this.newProjectProcurementType);
      try {
        await ElMessageBox.confirm(
          `确认所属地域：${this.newProjectRegion}、采购类型：${typeLabel}？创建后不可修改，并将生成项目编号。`,
          '确认创建',
          {
            confirmButtonText: '确认创建',
            cancelButtonText: '返回修改',
            type: 'warning'
          }
        );
      } catch {
        return;
      }

      this.creatingProject = true;
      try {
        const projectId = await DB.createProject(name, this.createCategoryCode, {
          region: this.newProjectRegion,
          procurementType: this.newProjectProcurementType
        });
        this.showCreateDialog = false;
        this.navigateTo('#/project/' + projectId);
      } catch (error) {
        ElMessage.error('创建项目失败: ' + error.message);
      }
      this.creatingProject = false;
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
    },
    /**
     * 卡片底部左侧：更新时间 · 最后更新者
     * @param {Object} project
     * @returns {string}
     */
    getProjectUpdateLine(project) {
      const time = this.getRelativeTime(project.updatedAt);
      const updater = project.updatedByName || project.createdByName || '未知';
      return `更新: ${time} · ${updater}`;
    },
    /**
     * 是否可删除项目（按状态与角色）
     * @param {Object} project
     * @returns {boolean}
     */
    canDeleteProject(project) {
      if (!project) return false;
      if (project.status === 'pending_review') return false;
      if (project.status === 'pending_paper') return false;
      if (project.status === 'archived') return this.isAdmin;
      if (project.status === 'draft' || project.status === 'review_rejected') return true;
      // 未知状态：仅管理员
      return this.isAdmin;
    },
    /**
     * 是否可调整归属（管理员 + 未归档）
     * @param {Object} project
     * @returns {boolean}
     */
    canReassignOwnership(project) {
      return this.isAdmin && project
        && project.status !== 'archived'
        && project.status !== 'pending_review'
        && project.status !== 'pending_paper';
    },
    /**
     * 打开调整归属弹窗
     * @param {Object} project
     */
    async openOwnershipDialog(project) {
      if (!this.canReassignOwnership(project)) return;
      this.ownershipProject = project;
      this.ownershipForm = {
        departmentId: project.departmentId || '',
        ownerUserId: ''
      };
      this.ownershipUsers = [];
      this.showOwnershipDialog = true;
      if (this.ownershipForm.departmentId) {
        await this.loadOwnershipUsers(this.ownershipForm.departmentId);
        // 若原归属人仍在该部门，预选
        if (project.createdBy && this.ownershipUsers.some((u) => u.id === project.createdBy)) {
          this.ownershipForm.ownerUserId = project.createdBy;
        }
      }
    },
    /**
     * 归属弹窗：部门变更时重新加载人员
     */
    async onOwnershipDepartmentChange(departmentId) {
      this.ownershipForm.ownerUserId = '';
      this.ownershipUsers = [];
      if (departmentId) {
        await this.loadOwnershipUsers(departmentId);
      }
    },
    /**
     * 加载指定部门下的启用用户
     * @param {string} departmentId
     */
    async loadOwnershipUsers(departmentId) {
      this.ownershipLoadingUsers = true;
      try {
        const result = await API.listUsers(1, 100, '', departmentId);
        const items = result.list || result.items || result.users || [];
        this.ownershipUsers = items.filter((u) => (u.status || 'active') === 'active');
      } catch (error) {
        this.ownershipUsers = [];
        ElMessage.error('加载部门人员失败: ' + error.message);
      }
      this.ownershipLoadingUsers = false;
    },
    /**
     * 提交调整归属
     */
    async submitOwnership() {
      if (!this.ownershipProject) return;
      if (!this.ownershipForm.departmentId) {
        ElMessage.warning('请选择新部门');
        return;
      }
      if (!this.ownershipForm.ownerUserId) {
        ElMessage.warning('请选择归属人');
        return;
      }
      this.ownershipSaving = true;
      try {
        await DB.reassignProjectOwnership(this.ownershipProject.projectId, {
          departmentId: this.ownershipForm.departmentId,
          ownerUserId: this.ownershipForm.ownerUserId
        });
        this.showOwnershipDialog = false;
        ElMessage.success('项目归属已调整');
        await this.loadProjects();
      } catch (error) {
        ElMessage.error('调整归属失败: ' + error.message);
      }
      this.ownershipSaving = false;
    },
    /**
     * 默认仅展开第一个有项目的部门及其第一个分类，空部门与其余组均折叠
     */
    syncDefaultCollapseState() {
      const groups = this.groupedProjects;
      const deptCollapsed = {};
      const catCollapsed = {};
      const firstDeptWithProjectsIndex = groups.findIndex((g) => g.projects.length > 0);

      groups.forEach((group, deptIndex) => {
        const expandDept = deptIndex === firstDeptWithProjectsIndex && firstDeptWithProjectsIndex !== -1;
        if (!expandDept) {
          deptCollapsed[group.departmentId] = true;
        }
        group.categories.forEach((cat, catIndex) => {
          if (!expandDept || catIndex > 0) {
            catCollapsed[this.catCollapseKey(group.departmentId, cat.categoryId)] = true;
          }
        });
      });

      this.collapsedDeptIds = deptCollapsed;
      this.collapsedCatKeys = catCollapsed;
    },
    /**
     * 部门分组是否已折叠
     * @param {string} departmentId
     * @returns {boolean}
     */
    isDeptCollapsed(departmentId) {
      return !!this.collapsedDeptIds[departmentId];
    },
    /**
     * 切换部门分组折叠状态
     * @param {string} departmentId
     */
    toggleDeptCollapse(departmentId) {
      this.collapsedDeptIds = {
        ...this.collapsedDeptIds,
        [departmentId]: !this.collapsedDeptIds[departmentId]
      };
    },
    /**
     * 部门内分类子组折叠键
     * @param {string} departmentId
     * @param {string} categoryId
     * @returns {string}
     */
    catCollapseKey(departmentId, categoryId) {
      return departmentId + '::' + categoryId;
    },
    /**
     * 分类子组是否已折叠
     * @param {string} departmentId
     * @param {string} categoryId
     * @returns {boolean}
     */
    isCatCollapsed(departmentId, categoryId) {
      return !!this.collapsedCatKeys[this.catCollapseKey(departmentId, categoryId)];
    },
    /**
     * 切换分类子组折叠状态
     * @param {string} departmentId
     * @param {string} categoryId
     */
    toggleCatCollapse(departmentId, categoryId) {
      const key = this.catCollapseKey(departmentId, categoryId);
      this.collapsedCatKeys = {
        ...this.collapsedCatKeys,
        [key]: !this.collapsedCatKeys[key]
      };
    }
  },
  template: `
    <div class="page-container">
      <!-- 按部门分组的项目列表（部门内再按分类） -->
      <div class="project-list" v-loading="loading">
        <div v-if="showProjectPagination" class="project-list-pagination">
          <el-pagination
            v-model:current-page="projectPage"
            :page-size="projectPageSize"
            :total="projectTotal"
            layout="total, prev, pager, next"
            @current-change="onProjectPageChange"
          />
        </div>
        <!-- 常驻筛选栏：组合搜索 + 可点状态统计 + 更多筛选 + 新建 -->
        <div class="home-filter-bar">
          <div class="combo-search">
            <el-select v-model="searchField" class="combo-search-field">
              <el-option
                v-for="opt in searchFieldOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-input
              v-model="searchText"
              class="combo-search-input"
              placeholder="搜索关键词（空格 = 且，竖线 | = 或）"
              clearable
            />
          </div>
          <div class="stat-chips">
            <button
              v-for="chip in statusChips"
              :key="chip.status"
              type="button"
              class="stat-chip"
              :class="['stat-chip--' + chip.status, { on: filterStatusList.includes(chip.status) }]"
              @click="toggleStatusChip(chip.status)"
            >{{ chip.label }} <b>{{ chip.count }}</b></button>
          </div>
          <div class="home-filter-actions">
            <el-button class="more-filter-btn" @click="toggleAdvancedFilters">
              更多筛选
              <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
            </el-button>
            <el-button type="primary" @click="openCreateDialog(category || 'tender')">+ 新建项目</el-button>
          </div>

          <!-- 更多筛选面板（浮层，改动即时生效） -->
          <div v-if="showAdvancedFilters" class="filter-panel">
            <div class="filter-panel-hd">
              更多筛选
              <span class="filter-panel-hint">改动即时生效</span>
            </div>
            <div class="filter-panel-bd">
              <div class="filter-grp-label">基本</div>
              <div class="filter-grp-selects">
                <el-select
                  v-if="!category"
                  v-model="filterCategoryList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="项目分类"
                >
                  <el-option label="招标" value="tender" />
                  <el-option label="咨询" value="consult" />
                  <el-option label="造价" value="cost" />
                </el-select>
                <el-select
                  v-model="filterRegionList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  placeholder="所属地域"
                >
                  <el-option
                    v-for="province in provinceOptions"
                    :key="province"
                    :label="province"
                    :value="province"
                  />
                </el-select>
                <el-select
                  v-model="filterTenderTypeList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  placeholder="招标类型/内容"
                >
                  <el-option
                    v-for="opt in tenderTypeFilterOptions"
                    :key="opt"
                    :label="opt"
                    :value="opt"
                  />
                </el-select>
                <el-select
                  v-model="filterProjectTypeList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="项目类型"
                >
                  <el-option
                    v-for="opt in projectTypeFilterOptions"
                    :key="opt"
                    :label="opt"
                    :value="opt"
                  />
                </el-select>
                <el-select
                  v-model="filterRoadLevelList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="道路等级"
                >
                  <el-option
                    v-for="opt in roadLevelFilterOptions"
                    :key="opt"
                    :label="opt"
                    :value="opt"
                  />
                </el-select>
                <el-select
                  v-model="filterIndustryList"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  placeholder="行业"
                >
                  <el-option
                    v-for="opt in industryFilterOptions"
                    :key="opt"
                    :label="opt"
                    :value="opt"
                  />
                </el-select>
              </div>
              <div class="filter-grp-label">范围</div>
              <div class="filter-range-row">
                <span class="filter-range-lb">日期</span>
                <el-select v-model="dateField" class="filter-range-field">
                  <el-option label="中标通知书时间" value="winNoticeDate" />
                  <el-option label="委托时间" value="entrustDate" />
                </el-select>
                <el-date-picker
                  v-model="dateFrom"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="开始日期"
                  class="filter-range-input"
                />
                <span class="filter-range-sep">至</span>
                <el-date-picker
                  v-model="dateTo"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="结束日期"
                  class="filter-range-input"
                />
              </div>
              <div class="filter-range-row">
                <span class="filter-range-lb">金额（万元）</span>
                <el-select v-model="amountField" class="filter-range-field">
                  <el-option label="项目总投资" value="totalInvestment" />
                  <el-option label="中标金额" value="winAmount" />
                </el-select>
                <el-input v-model="amountMin" placeholder="最小（含）" class="filter-range-input" clearable />
                <span class="filter-range-sep">至</span>
                <el-input v-model="amountMax" placeholder="最大（含）" class="filter-range-input" clearable />
              </div>
              <div class="filter-range-row">
                <span class="filter-range-lb">里程（公里）</span>
                <span class="filter-range-field"></span>
                <el-input v-model="mileageMin" placeholder="最小（含）" class="filter-range-input" clearable />
                <span class="filter-range-sep">至</span>
                <el-input v-model="mileageMax" placeholder="最大（含）" class="filter-range-input" clearable />
              </div>
            </div>
            <div class="filter-panel-ft">
              <el-button @click="clearPanelFilters">清空</el-button>
              <el-button type="primary" @click="toggleAdvancedFilters">完成</el-button>
            </div>
          </div>
        </div>

        <!-- 已选条件（仅面板内条件；状态筛选由上方统计 chips 承担） -->
        <div v-if="activeFilterChips.length > 0" class="filter-chips-row">
          <span class="filter-chips-label">已选条件：</span>
          <span v-for="chip in activeFilterChips" :key="chip.key" class="filter-chip">
            {{ chip.label }}
            <i class="filter-chip-x" @click="removeFilterChip(chip)">✕</i>
          </span>
          <el-button text type="primary" size="small" @click="clearPanelFilters">清空全部</el-button>
        </div>
        <div v-if="!loading && groupedProjects.length === 0" class="empty-state">
          <p>{{ hasNarrowingFilters ? '没有符合筛选条件的项目' : '还没有项目，点击上方新建按钮开始' }}</p>
        </div>
        <div
          v-for="group in groupedProjects"
          :key="group.departmentId"
          class="project-dept-group"
          :class="{ 'is-collapsed': isDeptCollapsed(group.departmentId) }"
        >
          <div
            class="project-dept-heading"
            role="button"
            tabindex="0"
            :aria-expanded="(!isDeptCollapsed(group.departmentId)).toString()"
            @click="toggleDeptCollapse(group.departmentId)"
            @keydown.enter.prevent="toggleDeptCollapse(group.departmentId)"
            @keydown.space.prevent="toggleDeptCollapse(group.departmentId)"
          >
            <span class="project-dept-chevron" aria-hidden="true"></span>
            <span class="project-dept-name">{{ group.departmentName }}</span>
            <span class="project-dept-count">{{ group.projects.length }}</span>
          </div>
          <div v-show="!isDeptCollapsed(group.departmentId)">
            <div v-if="group.projects.length === 0" class="project-dept-empty">
              暂无项目
            </div>
            <div
              v-for="cat in group.categories"
              :key="cat.categoryId"
              class="project-cat-group"
              :class="{ 'is-collapsed': isCatCollapsed(group.departmentId, cat.categoryId) }"
            >
              <div
                class="project-cat-heading"
                role="button"
                tabindex="0"
                :aria-expanded="(!isCatCollapsed(group.departmentId, cat.categoryId)).toString()"
                @click="toggleCatCollapse(group.departmentId, cat.categoryId)"
                @keydown.enter.prevent="toggleCatCollapse(group.departmentId, cat.categoryId)"
                @keydown.space.prevent="toggleCatCollapse(group.departmentId, cat.categoryId)"
              >
                <span class="project-cat-chevron" aria-hidden="true"></span>
                <span
                  class="project-cat-label"
                  :class="'cat-tag-' + (cat.categoryCode || 'tender')"
                >{{ cat.categoryName }}</span>
                <span class="project-cat-count">{{ cat.projects.length }}</span>
              </div>
              <div v-show="!isCatCollapsed(group.departmentId, cat.categoryId)" class="project-grid">
                <div
                  v-for="project in cat.projects"
                  :key="project.projectId"
                  class="project-card"
                  :class="'card-' + project.status"
                >
                  <div class="card-header">
                    <a
                      class="card-title"
                      :href="'#/project/' + project.projectId"
                      :title="project.projectName"
                      @click.prevent="navigateTo('#/project/' + project.projectId)"
                    >{{ project.projectName }}</a>
                    <a
                      v-if="canReassignOwnership(project)"
                      href="javascript:;"
                      class="card-dept-link"
                      :title="'调整所属部门：' + (project.departmentName || '未分配部门')"
                      @click.stop.prevent="openOwnershipDialog(project)"
                    >{{ project.departmentName || '未分配部门' }}</a>
                    <span v-else class="card-dept-text">{{ project.departmentName || '未分配部门' }}</span>
                  </div>
                  <div class="card-body">
                    <span v-if="project.status === 'draft'" class="card-progress">
                      草稿
                    </span>
                    <span v-else-if="project.status === 'pending_review'" class="card-status card-pending-review">
                      待审核
                    </span>
                    <span v-else-if="project.status === 'review_rejected'" class="card-status card-review-rejected">
                      审核不通过
                    </span>
                    <span v-else-if="project.status === 'pending_paper'" class="card-status card-pending-paper">
                      待纸质核对
                    </span>
                    <span v-else-if="project.status === 'archived'" class="card-status">
                      已归档
                    </span>
                    <span v-else class="card-status card-ready-text">
                      {{ project.status === 'review_approved' ? '审核通过' : '可提交' }}
                    </span>
                    <span v-if="project.paperTotal > 0" class="card-paper-stats">[含纸质 {{ project.paperConfirmed }}/{{ project.paperTotal }}]</span>
                    <span
                      class="card-cat-tag"
                      :class="'cat-tag-' + (project.categoryCode || 'tender')"
                    >{{ project.categoryName || '招标' }}</span>
                  </div>
                  <div class="card-footer">
                    <span class="card-time">{{ getProjectUpdateLine(project) }}</span>
                    <el-button
                      v-if="canDeleteProject(project)"
                      text
                      size="small"
                      @click.stop="deleteProject(project.projectId)"
                      class="card-delete"
                    >删除</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="showProjectPagination" class="project-list-pagination">
          <el-pagination
            v-model:current-page="projectPage"
            :page-size="projectPageSize"
            :total="projectTotal"
            layout="total, prev, pager, next"
            @current-change="onProjectPageChange"
          />
        </div>
      </div>

      <!-- 新建项目弹窗 -->
      <el-dialog v-model="showCreateDialog" :title="createDialogTitle" width="480px">
        <el-form label-width="88px">
          <el-form-item label="项目分类" required>
            <el-radio-group v-model="createCategoryCode">
              <el-radio-button label="tender">招标</el-radio-button>
              <el-radio-button label="consult">咨询</el-radio-button>
              <el-radio-button label="cost">造价</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="项目名称" required>
            <el-input
              v-model="newProjectName"
              placeholder="输入项目名称"
              @keyup.enter="createProject"
            />
          </el-form-item>
          <el-form-item label="所属地域" required>
            <el-select
              v-model="newProjectRegion"
              placeholder="请选择省份"
              filterable
              style="width: 100%;"
            >
              <el-option v-for="p in provinceOptions" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="采购类型" required>
            <el-select v-model="newProjectProcurementType" style="width: 100%;">
              <el-option label="工程(G)" value="G" />
              <el-option label="货物(H)" value="H" />
              <el-option label="服务(F)" value="F" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateDialog = false">取消</el-button>
          <el-button type="primary" :loading="creatingProject" @click="createProject">创建</el-button>
        </template>
      </el-dialog>

      <!-- 调整项目归属弹窗（仅管理员） -->
      <el-dialog
        v-model="showOwnershipDialog"
        title="调整项目归属"
        width="440px"
        destroy-on-close
      >
        <p v-if="ownershipProject" class="ownership-project-name" :title="ownershipProject.projectName">
          {{ ownershipProject.projectName }}
        </p>
        <el-form label-width="88px">
          <el-form-item label="新部门" required>
            <el-select
              v-model="ownershipForm.departmentId"
              placeholder="选择部门"
              style="width: 100%;"
              filterable
              @change="onOwnershipDepartmentChange"
            >
              <el-option
                v-for="dept in departments"
                :key="dept.id"
                :label="dept.name"
                :value="dept.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="归属人" required>
            <el-select
              v-model="ownershipForm.ownerUserId"
              placeholder="选择部门内人员"
              style="width: 100%;"
              filterable
              :loading="ownershipLoadingUsers"
              :disabled="!ownershipForm.departmentId"
            >
              <el-option
                v-for="user in ownershipUsers"
                :key="user.id"
                :label="user.name + (user.username ? '（' + user.username + '）' : '')"
                :value="user.id"
              />
            </el-select>
            <div v-if="ownershipForm.departmentId && !ownershipLoadingUsers && ownershipUsers.length === 0" class="ownership-empty-hint">
              该部门暂无可用人员
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showOwnershipDialog = false">取消</el-button>
          <el-button type="primary" :loading="ownershipSaving" @click="submitOwnership">确定</el-button>
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
      projectContracts: [],    // 项目已关联合同
      contractsCanEdit: false,
      contractSearchText: '',
      contractSearchResults: [],
      contractSearchLoading: false,
      selectedSearchContract: null,
      contractSearchDebounceTimer: null,
      contractsExpanded: false,
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
    displayedProjectContracts() {
      const list = this.projectContracts || [];
      if (this.contractsExpanded || list.length <= 3) return list;
      return list.slice(0, 3);
    },
    hiddenContractCount() {
      const total = (this.projectContracts || []).length;
      return total > 3 ? total - 3 : 0;
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
  watch: {
    contractSearchText() {
      if (this.contractSearchDebounceTimer) clearTimeout(this.contractSearchDebounceTimer);
      if (!this.contractsCanEdit) return;
      this.contractSearchDebounceTimer = setTimeout(() => {
        this.searchContractsForProject();
      }, 300);
    }
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
          this.loadProjectContracts(),
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
     * 加载项目已关联合同
     */
    async loadProjectContracts() {
      try {
        const res = await API.getProjectContracts(this.projectId);
        this.projectContracts = res.items || [];
        this.contractsCanEdit = !!res.canEdit;
        this.contractsExpanded = false;
      } catch (error) {
        this.projectContracts = [];
        this.contractsCanEdit = false;
      }
    },
    async searchContractsForProject() {
      const q = (this.contractSearchText || '').trim();
      this.contractSearchLoading = true;
      try {
        const linkedIds = new Set((this.projectContracts || []).map((c) => c.contractId));
        const res = await API.searchContracts(q, 20);
        this.contractSearchResults = (res.items || []).filter((c) => !linkedIds.has(c.id));
      } catch (error) {
        this.contractSearchResults = [];
      }
      this.contractSearchLoading = false;
    },
    selectSearchContract(contract) {
      this.selectedSearchContract = contract;
    },
    async addProjectContractLink() {
      if (!this.selectedSearchContract) {
        ElMessage.warning('请先从搜索结果中选择合同');
        return;
      }
      try {
        const link = await API.addProjectContract(this.projectId, this.selectedSearchContract.id);
        this.projectContracts.push(link);
        this.selectedSearchContract = null;
        this.contractSearchText = '';
        this.contractSearchResults = [];
        ElMessage.success('已关联合同');
      } catch (error) {
        ElMessage.error(error.message || '关联失败');
      }
    },
    async removeProjectContractLink(link) {
      if (!link || !link.canDelete) return;
      try {
        await API.removeProjectContract(this.projectId, link.linkId);
        this.projectContracts = this.projectContracts.filter((c) => c.linkId !== link.linkId);
        ElMessage.success('已解除关联');
      } catch (error) {
        ElMessage.error(error.message || '解除关联失败');
      }
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

            <div class="contract-links-section">
              <div class="contract-links-header">
                <span style="font-size: 13px; color: #606266; white-space: nowrap;">所属合同：</span>
                <el-tag v-if="!contractsCanEdit" size="small" type="info">只读</el-tag>
              </div>

              <template v-if="contractsCanEdit">
                <div class="contract-links-search">
                  <el-input
                    v-model="contractSearchText"
                    size="small"
                    placeholder="搜索合同名称..."
                    clearable
                    style="flex: 1;"
                  />
                  <el-button size="small" type="primary" plain @click="addProjectContractLink">添加</el-button>
                </div>
                <div v-loading="contractSearchLoading" class="contract-search-results contract-search-results--compact">
                  <div
                    v-for="item in contractSearchResults"
                    :key="item.id"
                    class="contract-search-result-item"
                    :class="{ 'is-selected': selectedSearchContract && selectedSearchContract.id === item.id }"
                    @click="selectSearchContract(item)"
                  >
                    <span>{{ item.name }}</span>
                    <el-tag v-if="item.isAnchor" size="small" type="warning" style="margin-left: 8px;">大合同</el-tag>
                    <el-tag v-if="item.seqNo" size="small" type="info" style="margin-left: 6px;">{{ item.seqNo }}</el-tag>
                  </div>
                </div>
              </template>

              <div v-if="projectContracts.length > 0" class="contract-linked-list">
                <div
                  v-for="link in displayedProjectContracts"
                  :key="link.linkId"
                  class="contract-linked-item"
                >
                  <span class="contract-linked-name">《{{ link.contractName }} &lt;{{ link.createdByName || '未知' }}&gt;》</span>
                  <el-button
                    v-if="contractsCanEdit && link.canDelete"
                    size="small"
                    text
                    type="danger"
                    @click="removeProjectContractLink(link)"
                  >删除</el-button>
                </div>
                <el-button
                  v-if="hiddenContractCount > 0 && !contractsExpanded"
                  size="small"
                  text
                  type="primary"
                  @click="contractsExpanded = true"
                >展开全部 ({{ projectContracts.length }})</el-button>
                <el-button
                  v-if="contractsExpanded && projectContracts.length > 3"
                  size="small"
                  text
                  type="primary"
                  @click="contractsExpanded = false"
                >收起</el-button>
              </div>
              <div v-else class="contract-linked-empty">暂未关联合同</div>
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

app.component('admin-contract-page', {
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
      searchText: '',
      searchType: 'contract',
      searchDebounceTimer: null,
      createDialogVisible: false,
      createForm: { name: '' },
      createSaving: false,
      editDialogVisible: false,
      editSaving: false,
      editingContract: null,
      editForm: { name: '', projects: [] },
      projectSearchText: '',
      projectSearchResults: [],
      projectSearchLoading: false,
      selectedSearchProject: null,
      projectSearchDebounceTimer: null
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
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
    searchType() {
      this.currentPage = 1;
      this.loadContracts();
    },
    projectSearchText(val) {
      if (this.projectSearchDebounceTimer) clearTimeout(this.projectSearchDebounceTimer);
      this.projectSearchDebounceTimer = setTimeout(() => {
        this.searchProjectsForEdit(val);
      }, 300);
    }
  },
  async mounted() {
    if (!this.isAdmin) {
      window.navigateTo('#/home');
      return;
    }
    await this.loadContracts();
  },
  methods: {
    navigateTo(path) {
      window.navigateTo(path);
    },
    goHome() {
      this.navigateTo('#/home');
    },
    rowIndex(index) {
      return (this.currentPage - 1) * this.pageSize + index + 1;
    },
    formatProjectNames(row) {
      const names = row.projectNames || [];
      if (names.length === 0) return '—';
      if (names.length <= 3) return names.join('、');
      return names.slice(0, 3).join('、') + ' 等 ' + row.projectCount + ' 个';
    },
    async loadContracts() {
      this.loading = true;
      try {
        const res = await API.listContracts({
          page: this.currentPage,
          pageSize: this.pageSize,
          search: this.searchText,
          searchType: this.searchType
        });
        this.contracts = res.items || [];
        this.total = res.total || 0;
      } catch (error) {
        ElMessage.error('加载合同列表失败: ' + error.message);
      }
      this.loading = false;
    },
    handlePageChange(page) {
      this.currentPage = page;
      this.loadContracts();
    },
    openCreateDialog() {
      this.createForm = { name: '' };
      this.createDialogVisible = true;
    },
    async saveCreate() {
      const name = (this.createForm.name || '').trim();
      if (!name) {
        ElMessage.warning('请输入合同名称');
        return;
      }
      this.createSaving = true;
      try {
        await API.createContract(name);
        ElMessage.success('合同创建成功');
        this.createDialogVisible = false;
        await this.loadContracts();
      } catch (error) {
        ElMessage.error(error.message || '创建失败');
      }
      this.createSaving = false;
    },
    async openEditDialog(row) {
      try {
        const detail = await API.getContract(row.id);
        this.editingContract = detail;
        this.editForm = {
          name: detail.name,
          projects: (detail.projects || []).map((p) => ({ ...p }))
        };
        this.projectSearchText = '';
        this.projectSearchResults = [];
        this.selectedSearchProject = null;
        this.editDialogVisible = true;
        this.searchProjectsForEdit('');
      } catch (error) {
        ElMessage.error('加载合同详情失败: ' + error.message);
      }
    },
    async searchProjectsForEdit(q) {
      if (!this.editingContract) return;
      this.projectSearchLoading = true;
      try {
        const linkedIds = new Set(this.editForm.projects.map((p) => p.projectId));
        const res = await API.searchContractsForAdmin({
          q: q || '',
          page: 1,
          pageSize: 20,
          excludeContractId: this.editingContract.id
        });
        this.projectSearchResults = (res.items || []).filter((p) => !linkedIds.has(p.id));
      } catch (error) {
        ElMessage.error('搜索项目失败: ' + error.message);
        this.projectSearchResults = [];
      }
      this.projectSearchLoading = false;
    },
    selectSearchProject(project) {
      this.selectedSearchProject = project;
    },
    addProjectToEditForm() {
      if (!this.selectedSearchProject) {
        ElMessage.warning('请先从搜索结果中选择项目');
        return;
      }
      const p = this.selectedSearchProject;
      const exists = this.editForm.projects.some((item) => item.projectId === p.id);
      if (exists) {
        ElMessage.warning('该项目已在列表中');
        return;
      }
      this.editForm.projects.push({
        linkId: '',
        projectId: p.id,
        projectName: p.name,
        createdBy: this.currentUser ? this.currentUser.id : '',
        createdByName: this.currentUser ? (this.currentUser.name || '') : '',
        createdAt: '',
        isNew: true
      });
      this.selectedSearchProject = null;
      this.projectSearchResults = this.projectSearchResults.filter((item) => item.id !== p.id);
    },
    removeProjectFromEditForm(index) {
      this.editForm.projects.splice(index, 1);
    },
    async saveEdit() {
      const name = (this.editForm.name || '').trim();
      if (!name) {
        ElMessage.warning('合同名称不能为空');
        return;
      }
      if (!this.editingContract) return;
      this.editSaving = true;
      try {
        await API.saveContractProjects(this.editingContract.id, {
          name,
          projectIds: this.editForm.projects.map((p) => p.projectId)
        });
        ElMessage.success('保存成功');
        this.editDialogVisible = false;
        await this.loadContracts();
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.editSaving = false;
    },
    async confirmDelete(row) {
      try {
        await ElMessageBox.confirm(
          '确定删除合同「' + row.name + '」？将同时解除与所有项目的关联。',
          '删除合同',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        );
        await API.deleteContract(row.id);
        ElMessage.success('已删除');
        await this.loadContracts();
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
          ElMessage.error(error.message || '删除失败');
        }
      }
    }
  },
  template: `
    <div class="page-container">
      <div class="page-head">
        <div class="head-actions">
          <el-button type="primary" @click="openCreateDialog">新建合同</el-button>
        </div>
      </div>

      <div style="padding: 20px;" v-loading="loading">
        <div class="search-bar" style="margin-bottom: 16px;">
          <div class="search-bar-filters contract-search-bar">
            <el-input
              v-model="searchText"
              placeholder="输入关键词搜索..."
              clearable
              style="max-width: 360px;"
            />
            <el-radio-group v-model="searchType" size="small">
              <el-radio-button label="contract">合同名称</el-radio-button>
              <el-radio-button label="project">项目名称</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <el-table :data="contracts" stripe style="width: 100%;">
          <el-table-column label="序号" width="80">
            <template #default="{ $index }">{{ rowIndex($index) }}</template>
          </el-table-column>
          <el-table-column prop="name" label="合同名称" min-width="180" />
          <el-table-column label="包含项目名称" min-width="280">
            <template #default="{ row }">{{ formatProjectNames(row) }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="180" />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openEditDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" link @click="confirmDelete(row)">删除</el-button>
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

      <el-dialog v-model="createDialogVisible" title="新建合同" width="480px" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="合同名称" required>
            <el-input v-model="createForm.name" placeholder="请输入合同名称" maxlength="200" show-word-limit />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="createSaving" @click="saveCreate">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="editDialogVisible" title="编辑合同" width="720px" :close-on-click-modal="false">
        <el-form label-width="90px">
          <el-form-item label="合同名称" required>
            <el-input v-model="editForm.name" placeholder="合同名称" maxlength="200" show-word-limit />
          </el-form-item>
          <el-form-item label="包含项目">
            <el-table :data="editForm.projects" size="small" stripe style="width: 100%; margin-bottom: 12px;">
              <el-table-column prop="projectName" label="项目名称" />
              <el-table-column prop="createdByName" label="添加人" width="100">
                <template #default="{ row }">{{ row.createdByName || (row.isNew ? (currentUser && currentUser.name) : '—') }}</template>
              </el-table-column>
              <el-table-column prop="createdAt" label="添加时间" width="160">
                <template #default="{ row }">{{ row.createdAt || (row.isNew ? '待保存' : '—') }}</template>
              </el-table-column>
              <el-table-column label="操作" width="70">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" link @click="removeProjectFromEditForm($index)">移除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="contract-edit-add-project">
              <el-input
                v-model="projectSearchText"
                placeholder="搜索项目名称或编号..."
                clearable
                style="margin-bottom: 8px;"
              />
              <div v-loading="projectSearchLoading" class="contract-search-results">
                <div
                  v-for="item in projectSearchResults"
                  :key="item.id"
                  class="contract-search-result-item"
                  :class="{ 'is-selected': selectedSearchProject && selectedSearchProject.id === item.id }"
                  @click="selectSearchProject(item)"
                >
                  <span>{{ item.name }}</span>
                  <el-tag v-if="item.projectNo" size="small" type="info" style="margin-left: 8px;">{{ item.projectNo }}</el-tag>
                </div>
                <div v-if="!projectSearchLoading && projectSearchResults.length === 0" class="contract-search-empty">
                  输入关键词搜索项目
                </div>
              </div>
              <el-button size="small" type="primary" plain style="margin-top: 8px;" @click="addProjectToEditForm">添加</el-button>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `
});

// ============================================
// 合同台账页面组件（大合同锚点）
// ============================================

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
    isAnchor: false,
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
    isAnchor: !!detail.isAnchor,
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
      searchType: 'contract',
      filterAnchorOnly: false,
      filterPaymentOnly: false,
      filterChildOnly: false,
      filterLinkStatus: '',
      filterMissingCredit: false,
      searchDebounceTimer: null,
      anchorOptions: [],
      formDialogVisible: false,
      formMode: 'create',
      formSaving: false,
      form: emptyContractForm(),
      editingContract: null,
      formProjects: [],
      formChildren: [],
      formStats: null,
      formParent: null,
      projectSearchText: '',
      projectSearchResults: [],
      projectSearchLoading: false,
      selectedSearchProject: null,
      projectSearchDebounceTimer: null
    };
  },
  computed: {
    isAdmin() {
      const u = this.currentUser;
      return !!(u && (u.role === 'admin' || u.roleCode === 'admin'));
    },
    availableAnchorOptions() {
      const selfId = this.editingContract && this.editingContract.id;
      return (this.anchorOptions || []).filter((c) => c.id !== selfId && !c.isPayment);
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
    searchType() {
      this.currentPage = 1;
      this.loadContracts();
    },
    filterAnchorOnly() { this._reloadFirstPage(); },
    filterPaymentOnly() { this._reloadFirstPage(); },
    filterChildOnly() { this._reloadFirstPage(); },
    filterLinkStatus() { this._reloadFirstPage(); },
    filterMissingCredit() { this._reloadFirstPage(); },
    projectSearchText(val) {
      if (this.projectSearchDebounceTimer) clearTimeout(this.projectSearchDebounceTimer);
      this.projectSearchDebounceTimer = setTimeout(() => {
        this.searchProjectsForForm(val);
      }, 300);
    }
  },
  async mounted() {
    if (!this.isAdmin) {
      window.navigateTo('#/home');
      return;
    }
    await Promise.all([this.loadContracts(), this.loadAnchorOptions()]);
  },
  methods: {
    _reloadFirstPage() {
      this.currentPage = 1;
      this.loadContracts();
    },
    goHome() {
      window.navigateTo('#/home');
    },
    async loadContracts() {
      this.loading = true;
      try {
        const res = await API.listContracts({
          page: this.currentPage,
          pageSize: this.pageSize,
          search: this.searchText,
          searchType: this.searchType,
          anchorOnly: this.filterAnchorOnly,
          paymentOnly: this.filterPaymentOnly,
          childOnly: this.filterChildOnly,
          linkStatus: this.filterLinkStatus,
          missingCredit: this.filterMissingCredit
        });
        this.contracts = res.items || [];
        this.total = res.total || 0;
      } catch (error) {
        ElMessage.error('加载合同列表失败: ' + error.message);
      }
      this.loading = false;
    },
    async loadAnchorOptions() {
      try {
        const res = await API.listContracts({ page: 1, pageSize: 1000, anchorOnly: true });
        this.anchorOptions = (res.items || []).filter((c) => c.isAnchor);
      } catch (error) {
        this.anchorOptions = [];
      }
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
    formatProjectNames(row) {
      const names = row.projectNames || [];
      if (names.length === 0) return '—';
      if (names.length <= 2) return names.join('、');
      return `${names.slice(0, 2).join('、')} 等 ${names.length} 个`;
    },
    legacyIssueText(row) {
      const extra = row && row.legacyExtra;
      if (!extra) return '';
      const issues = Array.isArray(extra.issues) ? extra.issues : [];
      return issues.map((it) => (typeof it === 'string' ? it : it.message || '')).filter(Boolean).join('；');
    },
    openCreateDialog() {
      this.formMode = 'create';
      this.editingContract = null;
      this.form = emptyContractForm();
      this.formProjects = [];
      this.formChildren = [];
      this.formStats = null;
      this.formParent = null;
      this.projectSearchText = '';
      this.projectSearchResults = [];
      this.selectedSearchProject = null;
      this.formDialogVisible = true;
      this.loadAnchorOptions();
    },
    async openEditDialog(row) {
      try {
        const detail = await API.getContract(row.id);
        this.formMode = 'edit';
        this.editingContract = detail;
        this.form = contractFormFromDetail(detail);
        this.formProjects = (detail.projects || []).map((p) => ({ ...p }));
        this.formChildren = detail.children || [];
        this.formStats = detail.stats || null;
        this.formParent = detail.parent || null;
        this.projectSearchText = '';
        this.projectSearchResults = [];
        this.selectedSearchProject = null;
        this.formDialogVisible = true;
        await this.loadAnchorOptions();
        if (this.form.isAnchor) this.searchProjectsForForm('');
      } catch (error) {
        ElMessage.error('加载合同详情失败: ' + error.message);
      }
    },
    onPaymentChange(value) {
      if (value) {
        this.form.isAnchor = false;
        this.form.parentContractId = '';
      }
    },
    onAnchorChange(value) {
      if (value) {
        if (this.form.parentContractId) {
          ElMessage.warning('请先清除“所属大合同”，再将合同标记为大合同');
          this.form.isAnchor = false;
          return;
        }
        this.form.isPayment = false;
      }
    },
    async saveForm() {
      const name = String(this.form.name || '').trim();
      if (!name) {
        ElMessage.warning('请输入合同名称');
        return;
      }
      if (this.form.isPayment && this.form.isAnchor) {
        ElMessage.warning('付款类合同不能标记为大合同');
        return;
      }
      if (this.form.isAnchor && this.form.parentContractId) {
        ElMessage.warning('大合同不能同时挂在其他合同下');
        return;
      }
      this.formSaving = true;
      try {
        if (this.formMode === 'create') {
          const created = await API.createContract({ ...this.form, name });
          if (this.form.isAnchor && this.formProjects.length > 0) {
            await API.saveContractProjects(created.id, {
              projectIds: this.formProjects.map((p) => p.projectId)
            });
          }
          ElMessage.success('合同已创建');
        } else {
          await API.updateContract(this.editingContract.id, { ...this.form, name });
          if (this.form.isAnchor) {
            await API.saveContractProjects(this.editingContract.id, {
              projectIds: this.formProjects.map((p) => p.projectId)
            });
          }
          ElMessage.success('合同已保存');
        }
        this.formDialogVisible = false;
        await Promise.all([this.loadContracts(), this.loadAnchorOptions()]);
      } catch (error) {
        ElMessage.error(error.message || '保存失败');
      }
      this.formSaving = false;
    },
    async toggleAnchor(row, value) {
      try {
        await API.updateContract(row.id, { isAnchor: value });
        ElMessage.success(value ? '已标记为大合同' : '已取消大合同');
        await Promise.all([this.loadContracts(), this.loadAnchorOptions()]);
      } catch (error) {
        ElMessage.error(error.message || '操作失败');
        await this.loadContracts();
      }
    },
    async confirmDelete(row) {
      try {
        await ElMessageBox.confirm(
          '确定删除合同「' + row.name + '」？删除后不可恢复。',
          '删除合同',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        );
        await API.deleteContract(row.id);
        ElMessage.success('已删除');
        await Promise.all([this.loadContracts(), this.loadAnchorOptions()]);
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
          ElMessage.error(error.message || '删除失败');
        }
      }
    },
    async searchProjectsForForm(q) {
      if (!this.form.isAnchor) {
        this.projectSearchResults = [];
        return;
      }
      this.projectSearchLoading = true;
      try {
        const linkedIds = new Set(this.formProjects.map((p) => p.projectId));
        const res = await API.searchContractsForAdmin({
          q: q || '',
          page: 1,
          pageSize: 20,
          excludeContractId: this.editingContract ? this.editingContract.id : ''
        });
        this.projectSearchResults = (res.items || []).filter((p) => !linkedIds.has(p.id));
      } catch (error) {
        ElMessage.error('搜索项目失败: ' + error.message);
        this.projectSearchResults = [];
      }
      this.projectSearchLoading = false;
    },
    selectSearchProject(project) {
      this.selectedSearchProject = project;
    },
    addProjectToForm() {
      if (!this.selectedSearchProject) {
        ElMessage.warning('请先从搜索结果中选择项目');
        return;
      }
      const p = this.selectedSearchProject;
      if (this.formProjects.some((item) => item.projectId === p.id)) {
        ElMessage.warning('该项目已在列表中');
        return;
      }
      this.formProjects.push({
        linkId: '',
        projectId: p.id,
        projectName: p.name,
        createdBy: this.currentUser ? this.currentUser.id : '',
        createdByName: this.currentUser ? (this.currentUser.name || '') : '',
        createdAt: '',
        isNew: true
      });
      this.selectedSearchProject = null;
      this.projectSearchResults = this.projectSearchResults.filter((item) => item.id !== p.id);
    },
    removeProjectFromForm(index) {
      this.formProjects.splice(index, 1);
    },
    async exportAll() {
      this.exporting = true;
      try {
        const res = await API.listContracts({
          page: 1,
          pageSize: 10000,
          search: this.searchText,
          searchType: this.searchType,
          anchorOnly: this.filterAnchorOnly,
          paymentOnly: this.filterPaymentOnly,
          childOnly: this.filterChildOnly,
          linkStatus: this.filterLinkStatus,
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
        <div class="head-actions">
          <el-button type="primary" @click="openCreateDialog">新建合同</el-button>
          <el-button :loading="exporting" @click="exportAll">导出合同台账</el-button>
        </div>
      </div>

      <div style="padding: 20px;" v-loading="loading">
        <div class="search-bar" style="margin-bottom: 16px;">
          <div class="search-bar-filters contract-search-bar">
            <el-input
              v-model="searchText"
              placeholder="合同名称 / 对方企业 / 合同性质 / 关联项目"
              clearable
              style="max-width: 380px;"
            />
            <el-radio-group v-model="searchType" size="small">
              <el-radio-button label="contract">合同/对方/性质</el-radio-button>
              <el-radio-button label="project">项目名称</el-radio-button>
            </el-radio-group>
            <el-checkbox v-model="filterAnchorOnly">仅大合同</el-checkbox>
            <el-checkbox v-model="filterPaymentOnly">仅付款类</el-checkbox>
            <el-checkbox v-model="filterChildOnly">仅子合同</el-checkbox>
            <el-checkbox v-model="filterMissingCredit">缺信用代码</el-checkbox>
            <el-select v-model="filterLinkStatus" clearable placeholder="关联状态" style="width: 140px;">
              <el-option label="有关联项目" value="linked" />
              <el-option label="无关联项目" value="unlinked" />
            </el-select>
          </div>
        </div>

        <el-table :data="contracts" stripe style="width: 100%;" row-key="id">
          <el-table-column label="序号" width="76">
            <template #default="{ row }">{{ row.seqNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="大合同" width="84" align="center">
            <template #default="{ row }">
              <el-switch
                :model-value="row.isAnchor"
                :disabled="row.isPayment"
                @change="(val) => toggleAnchor(row, val)"
              />
            </template>
          </el-table-column>
          <el-table-column label="合同名称" min-width="260">
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
          <el-table-column prop="natureRaw" label="合同性质" min-width="160" show-overflow-tooltip />
          <el-table-column label="合同日期" width="118">
            <template #default="{ row }">{{ row.contractDateRaw || row.contractDate || '—' }}</template>
          </el-table-column>
          <el-table-column label="代理费(万元)" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.agencyFee) }}</template>
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
          <el-table-column label="信用代码" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.creditCodeRaw || '—' }}</template>
          </el-table-column>
          <el-table-column label="子合同" width="80" align="center">
            <template #default="{ row }">{{ row.childCount || 0 }}</template>
          </el-table-column>
          <el-table-column label="关联项目" width="90" align="center">
            <template #default="{ row }">
              <el-tooltip :content="formatProjectNames(row)" placement="top">
                <span class="contract-project-count">{{ row.projectCount || 0 }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openEditDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" link @click="confirmDelete(row)">删除</el-button>
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
        :title="formMode === 'create' ? '新建合同' : '编辑合同'"
        width="980px"
        top="4vh"
        :close-on-click-modal="false"
        destroy-on-close
      >
        <div v-if="formMode === 'edit' && editingContract && editingContract.source === 'legacy'" class="contract-legacy-hint">
          历史导入合同：序号 {{ editingContract.seqNo }}，来源 {{ editingContract.legacySheet }} 第 {{ editingContract.legacyRow }} 行
          <span v-if="legacyIssueText(editingContract)">；异常：{{ legacyIssueText(editingContract) }}</span>
        </div>

        <div v-if="formMode === 'edit' && form.isAnchor && formStats" class="contract-stats-panel">
          <div class="contract-stat"><span>大合同金额</span><b>{{ formatMoney(formStats.contractAmount) }} 万元</b></div>
          <div class="contract-stat"><span>关联项目</span><b>{{ formStats.projectCount }} 个</b></div>
          <div class="contract-stat"><span>项目总投资</span><b>{{ formatMoney(formStats.totalInvestment) }} 万元</b></div>
          <div class="contract-stat"><span>项目中标金额</span><b>{{ formatMoney(formStats.winAmount) }} 万元</b></div>
          <div class="contract-stat"><span>子合同</span><b>{{ formStats.childCount }} 个</b></div>
          <div class="contract-stat"><span>子合同代理费</span><b>{{ formatMoney(formStats.childAgencyFee) }} 万元</b></div>
        </div>
        <div v-if="formMode === 'edit' && form.isAnchor && formStats && formStats.categories && formStats.categories.length > 0" class="contract-category-stats">
          <span v-for="cat in formStats.categories" :key="cat.code || cat.name" class="contract-category-stat">
            {{ cat.name }}：{{ cat.projectCount }} 个 / 投资 {{ formatMoney(cat.totalInvestment) }} 万 / 中标 {{ formatMoney(cat.winAmount) }} 万
          </span>
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
            <el-input v-model="form.contractAmount" type="number" placeholder="大合同自身金额，可空" />
          </el-form-item>
          <el-form-item label="总投资额(万元)">
            <el-input v-model="form.totalInvestment" type="number" placeholder="项目总投资，可空" />
          </el-form-item>
          <el-form-item label="代理费(万元)">
            <el-input v-model="form.agencyFee" type="number" placeholder="代理费，可空" />
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
            <el-switch v-model="form.isPayment" @change="onPaymentChange" />
          </el-form-item>
          <el-form-item label="大合同">
            <el-switch v-model="form.isAnchor" :disabled="form.isPayment" @change="onAnchorChange" />
          </el-form-item>
          <el-form-item label="所属大合同">
            <el-select
              v-model="form.parentContractId"
              clearable
              filterable
              :disabled="form.isAnchor || form.isPayment"
              placeholder="小合同挂靠的大合同"
              style="width: 100%;"
            >
              <el-option
                v-for="opt in availableAnchorOptions"
                :key="opt.id"
                :label="(opt.seqNo ? opt.seqNo + ' ' : '') + opt.name"
                :value="opt.id"
              />
            </el-select>
          </el-form-item>
        </el-form>

        <div v-if="formMode === 'edit' && formChildren.length > 0" style="margin-top: 12px;">
          <h4 class="contract-section-title">子合同</h4>
          <el-table :data="formChildren" size="small" stripe>
            <el-table-column prop="seqNo" label="序号" width="70" />
            <el-table-column prop="name" label="合同名称" min-width="240" />
            <el-table-column prop="contractDate" label="合同日期" width="120" />
            <el-table-column prop="natureRaw" label="合同性质" min-width="140" />
            <el-table-column label="代理费(万元)" width="120" align="right">
              <template #default="{ row }">{{ formatMoney(row.agencyFee) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="form.isAnchor" style="margin-top: 12px;">
          <h4 class="contract-section-title">关联项目</h4>
          <el-table :data="formProjects" size="small" stripe style="width: 100%; margin-bottom: 12px;">
            <el-table-column prop="projectName" label="项目名称" min-width="240" />
            <el-table-column prop="createdByName" label="添加人" width="100">
              <template #default="{ row }">{{ row.createdByName || (row.isNew ? (currentUser && currentUser.name) : '—') }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="添加时间" width="160">
              <template #default="{ row }">{{ row.createdAt || (row.isNew ? '待保存' : '—') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ $index }">
                <el-button size="small" type="danger" link @click="removeProjectFromForm($index)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="contract-edit-add-project">
            <el-input
              v-model="projectSearchText"
              placeholder="搜索项目名称或编号..."
              clearable
              style="margin-bottom: 8px;"
            />
            <div v-loading="projectSearchLoading" class="contract-search-results">
              <div
                v-for="item in projectSearchResults"
                :key="item.id"
                class="contract-search-result-item"
                :class="{ 'is-selected': selectedSearchProject && selectedSearchProject.id === item.id }"
                @click="selectSearchProject(item)"
              >
                <span>{{ item.name }}</span>
                <el-tag v-if="item.projectNo" size="small" type="info" style="margin-left: 8px;">{{ item.projectNo }}</el-tag>
              </div>
              <div v-if="!projectSearchLoading && projectSearchResults.length === 0" class="contract-search-empty">
                输入关键词搜索项目
              </div>
            </div>
            <el-button size="small" type="primary" plain style="margin-top: 8px;" @click="addProjectToForm">添加</el-button>
          </div>
        </div>
        <div v-else class="contract-legacy-hint">只有大合同可以关联项目；其他合同仅作为印花税台账记录。</div>

        <template #footer>
          <el-button @click="formDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="formSaving" @click="saveForm">保存</el-button>
        </template>
      </el-dialog>
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
