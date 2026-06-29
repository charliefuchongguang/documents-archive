/**
 * http.js - 统一后端 API 调用封装
 * 提供 token 管理、请求拦截、错误处理
 */
window.Http = {

  // 后端 API 基础地址（部署时调整）
  BASE_URL: '/api',
  TOKEN_KEY: 'archive-helper-token',

  /**
   * 获取已保存的 JWT token
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * 保存 JWT token
   */
  saveToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  /**
   * 清除 token（退出登录）
   */
  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!this.getToken();
  },

  /**
   * 发起 API 请求
   */
  async request(path, options = {}) {
    const url = this.BASE_URL + path;
    const headers = {
      ...options.headers
    };

    // 非 FormData 请求添加 Content-Type
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // 添加认证 token
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      // 解析后端错误信息
      let errorMsg = '';
      try {
        const errData = await response.json();
        errorMsg = errData.error || errData.message || response.statusText;
      } catch {
        errorMsg = response.statusText;
      }

      // 401 未授权处理：
      // - 登录接口本身的 401（如用户名密码错误）→ 透传后端错误信息
      // - 其他接口的 401（已携带 token 但被拒绝）→ 视为登录过期，清除 token 并跳转登录
      if (response.status === 401) {
        const isLoginRequest = path === '/auth/login';
        if (!isLoginRequest && token) {
          this.clearToken();
          this.redirectToLogin();
          throw new Error('登录已过期，请重新登录');
        }
      }

      throw new Error(errorMsg);
    }

    return response.json();
  },

  /**
   * GET 请求
   */
  async get(path) {
    return this.request(path, { method: 'GET' });
  },

  /**
   * POST 请求（JSON）
   */
  async post(path, data) {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * PUT 请求
   */
  async put(path, data) {
    return this.request(path, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  /**
   * DELETE 请求
   */
  async del(path) {
    return this.request(path, { method: 'DELETE' });
  },

  /**
   * POST 上传文件（FormData）
   */
  async upload(path, formData) {
    return this.request(path, {
      method: 'POST',
      body: formData
      // 不设置 Content-Type，让浏览器自动设置 multipart boundary
    });
  },

  /**
   * 重定向到登录页（触发 Vue 显示登录组件）
   */
  redirectToLogin() {
    // 触发 Vue 显示登录页面
    if (window.app) {
      window.app.showLogin = true;
    }
  }
};
