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
    if (window.HomeFilterStorage) {
      window.HomeFilterStorage.clearAll();
    }
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
      let errData = null;
      try {
        errData = await response.json();
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

      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = errData;
      throw err;
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
   * 使用 XHR 以获得真实的已上传字节进度；网络失败标记为可重试
   * @param {string} path
   * @param {FormData} formData
   * @param {(loaded: number, total: number) => void} [onProgress]
   * @returns {Promise<Object>}
   */
  upload(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const url = this.BASE_URL + path;
      const token = this.getToken();
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (typeof onProgress === 'function') {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };
      }

      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        // 401：登录过期（与 request 保持一致）
        if (xhr.status === 401 && token) {
          this.clearToken();
          this.redirectToLogin();
        }
        const errorMsg = (data && (data.error || data.message)) || xhr.statusText || `HTTP ${xhr.status}`;
        const err = new Error(errorMsg);
        err.status = xhr.status;
        err.data = data;
        reject(err);
      };
      xhr.onerror = () => {
        const err = new Error('网络连接失败，请检查网络后重试');
        err.network = true;
        err.retryable = true;
        reject(err);
      };
      xhr.ontimeout = () => {
        const err = new Error('上传超时，请重试');
        err.network = true;
        err.retryable = true;
        reject(err);
      };
      xhr.onabort = () => {
        const err = new Error('上传已中断');
        err.network = true;
        err.retryable = true;
        reject(err);
      };

      xhr.send(formData);
    });
  },

  /**
   * POST 请求并返回 Blob（用于文件下载）
   * @param {string} path
   * @param {Object} [data]
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async postBlob(path, data) {
    const url = this.BASE_URL + path;
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data || {})
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errData = await response.json();
        errorMsg = errData.error || errData.message || errorMsg;
      } catch {
        // 非 JSON 错误响应
      }
      if (response.status === 401 && token) {
        this.clearToken();
        this.redirectToLogin();
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return { json, blob: null, filename: '' };
    }

    const blob = await response.blob();
    let filename = 'download.zip';
    const disposition = response.headers.get('Content-Disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const asciiMatch = disposition.match(/filename="([^"]+)"/i);
    if (utf8Match) {
      filename = decodeURIComponent(utf8Match[1]);
    } else if (asciiMatch) {
      filename = asciiMatch[1];
    }

    return { blob, filename, json: null };
  },

  /**
   * 触发浏览器下载 Blob
   * @param {Blob} blob
   * @param {string} filename
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * 重定向到登录页（触发 Vue 显示登录组件）
   */
  redirectToLogin() {
    if (window.app) {
      window.app.currentUser = null;
      window.app.userLoading = false;
      window.app.showLogin = true;
    }
  }
};
