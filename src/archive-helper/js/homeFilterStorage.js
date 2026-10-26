/**
 * 首页搜索筛选条件 - 登录会话内 sessionStorage 缓存
 * 登录成功时清除；登出 / token 失效时清除；同会话内刷新、路由切换可恢复
 */
window.HomeFilterStorage = {
  KEY_PREFIX: 'archive-helper:home-filters:',

  ALLOWED_CATEGORY_CODES: new Set(['tender', 'consult', 'cost']),
  ALLOWED_STATUSES: new Set(['draft', 'pending_review', 'review_rejected', 'pending_paper', 'archived']),
  ALLOWED_SEARCH_FIELDS: new Set([
    'name_overview', 'projectManager', 'techManager'
  ]),
  /** 已改为多选下拉，旧缓存中的 searchField 需回落 */
  LEGACY_SEARCH_FIELDS: new Set(['tenderType', 'projectType', 'roadLevel', 'industry']),
  ALLOWED_DATE_FIELDS: new Set(['winNoticeDate', 'entrustDate']),
  ALLOWED_AMOUNT_FIELDS: new Set(['totalInvestment', 'winAmount']),

  /**
   * @param {string} enumKey
   * @returns {Set<string>}
   */
  _enumAllowedSet(enumKey) {
    const list = (window.Utils && Utils.ENUMS && Utils.ENUMS[enumKey]) || [];
    return new Set(list);
  },

  /**
   * @param {*} list
   * @param {Set<string>} allowed
   * @returns {string[]}
   */
  _normalizeEnumFilterList(list, allowed) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((v) => typeof v === 'string' && allowed.has(v)))];
  },

  /**
   * @param {Object|null|undefined} user
   * @returns {string}
   */
  getUserId(user) {
    if (!user) return '';
    return String(user.id || user.userid || user.userId || '');
  },

  /**
   * @param {string} userId
   * @returns {string}
   */
  getStorageKey(userId) {
    return `${this.KEY_PREFIX}${userId}`;
  },

  /**
   * @param {*} v
   * @returns {string}
   */
  _optNumStr(v) {
    if (v === undefined || v === null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '';
  },

  /**
   * @param {*} data
   * @returns {Object|null}
   */
  normalize(data) {
    if (!data || typeof data !== 'object') return null;

    const provinceSet = new Set((window.Utils && Utils.PROVINCES) || []);
    const filterCategoryList = Array.isArray(data.filterCategoryList)
      ? [...new Set(data.filterCategoryList.filter((c) => this.ALLOWED_CATEGORY_CODES.has(c)))]
      : [];
    const filterStatusList = Array.isArray(data.filterStatusList)
      ? [...new Set(data.filterStatusList.filter((s) => this.ALLOWED_STATUSES.has(s)))]
      : [];
    const filterRegionList = Array.isArray(data.filterRegionList)
      ? [...new Set(data.filterRegionList.filter((r) => typeof r === 'string' && r
        && (provinceSet.size === 0 || provinceSet.has(r))))]
      : [];
    const filterTenderTypeList = this._normalizeEnumFilterList(
      data.filterTenderTypeList,
      this._enumAllowedSet('tenderType')
    );
    const filterProjectTypeList = this._normalizeEnumFilterList(
      data.filterProjectTypeList,
      this._enumAllowedSet('projectType')
    );
    const filterRoadLevelList = this._normalizeEnumFilterList(
      data.filterRoadLevelList,
      this._enumAllowedSet('roadLevel')
    );
    const filterIndustryList = this._normalizeEnumFilterList(
      data.filterIndustryList,
      this._enumAllowedSet('industry')
    );
    const searchText = typeof data.searchText === 'string' ? data.searchText : '';
    let searchField = typeof data.searchField === 'string' ? data.searchField : 'name_overview';
    if (this.LEGACY_SEARCH_FIELDS.has(searchField) || !this.ALLOWED_SEARCH_FIELDS.has(searchField)) {
      searchField = 'name_overview';
    }
    const showAdvancedFilters = !!data.showAdvancedFilters;
    const dateField = this.ALLOWED_DATE_FIELDS.has(data.dateField) ? data.dateField : 'winNoticeDate';
    const dateFrom = typeof data.dateFrom === 'string' ? data.dateFrom : '';
    const dateTo = typeof data.dateTo === 'string' ? data.dateTo : '';
    const amountField = this.ALLOWED_AMOUNT_FIELDS.has(data.amountField)
      ? data.amountField
      : 'totalInvestment';
    const amountMin = this._optNumStr(data.amountMin);
    const amountMax = this._optNumStr(data.amountMax);
    const mileageMin = this._optNumStr(data.mileageMin);
    const mileageMax = this._optNumStr(data.mileageMax);
    const projectPage = Number.isFinite(Number(data.projectPage)) && Number(data.projectPage) >= 1
      ? Math.floor(Number(data.projectPage))
      : 1;

    return {
      searchText,
      searchField,
      filterCategoryList,
      filterStatusList,
      filterRegionList,
      filterTenderTypeList,
      filterProjectTypeList,
      filterRoadLevelList,
      filterIndustryList,
      showAdvancedFilters,
      dateField,
      dateFrom,
      dateTo,
      amountField,
      amountMin,
      amountMax,
      mileageMin,
      mileageMax,
      projectPage
    };
  },

  /**
   * @param {Object|null|undefined} user
   * @returns {Object|null}
   */
  load(user) {
    const userId = this.getUserId(user);
    if (!userId) return null;
    try {
      const raw = sessionStorage.getItem(this.getStorageKey(userId));
      if (!raw) return null;
      return this.normalize(JSON.parse(raw));
    } catch (error) {
      console.warn('[HomeFilterStorage] 读取缓存失败:', error.message);
      return null;
    }
  },

  /**
   * @param {Object|null|undefined} user
   * @param {Object} filters
   */
  save(user, filters) {
    const userId = this.getUserId(user);
    if (!userId || !filters) return;
    const payload = this.normalize(filters);
    if (!payload) return;
    try {
      sessionStorage.setItem(this.getStorageKey(userId), JSON.stringify(payload));
    } catch (error) {
      console.warn('[HomeFilterStorage] 写入缓存失败:', error.message);
    }
  },

  /**
   * @param {Object|null|undefined} [user]
   */
  clear(user) {
    const userId = user ? this.getUserId(user) : '';
    if (userId) {
      sessionStorage.removeItem(this.getStorageKey(userId));
    }
  },

  /** 登出 / token 失效时清除所有用户的首页筛选缓存 */
  clearAll() {
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.KEY_PREFIX)) {
          keys.push(key);
        }
      }
      keys.forEach((key) => sessionStorage.removeItem(key));
    } catch (error) {
      console.warn('[HomeFilterStorage] 清除缓存失败:', error.message);
    }
  }
};
