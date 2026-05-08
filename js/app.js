/**
 * app.js
 * 主入口：状态管理 + 事件绑定 + 业务流程编排
 */

(() => {
  /* =========================================================
     全局状态
     ========================================================= */
  const CUSTOM_KEY = '__custom__';

  function defaultState() {
    return {
      trip: {
        origin: '',
        originLocation: null,    // [lng, lat]，用户从下拉选中时填，未来用于起点路线规划
        destinations: [],
        startDate: '',
        endDate: '',
        days: 0,
        transport: 'driving',
        style: 'mixed',
        budget: 0
      },
      pool: {},
      activeCity: '',
      poolKeyword: '景点',         // 用户在景点池里搜什么
      selectedIds: new Set(),
      selectedAttractions: [],
      customAttractions: [],
      itinerary: { days: [], flat: [], matrix: null },
      currentDay: 0,
      segCache: {},
      segPrimaryMode: {},          // segKey -> mode；用户切换的主显交通方式
      acTips: [],
      customAcTips: [],
      originAcTips: [],
      editingSpotId: null
    };
  }
  const state = defaultState();
  window.__state = state;

  /* =========================================================
     存档管理（多档保存到 localStorage）
     ========================================================= */
  function saveCurrentTrip(options) {
    if (state.selectedAttractions.length === 0) return null;
    const snapshot = {
      trip: state.trip,
      selectedAttractions: state.selectedAttractions,
      customAttractions: state.customAttractions,
      itinerary: state.itinerary,
      currentDay: state.currentDay,
      segPrimaryMode: state.segPrimaryMode || {}    // ★ 记住每段路用的交通方式
    };
    return Data.saveTrip(snapshot, options || {});
  }
  function restoreFromSaved(saved) {
    if (!saved || !saved.snapshot) return;
    const snap = saved.snapshot;
    Object.assign(state.trip, snap.trip);
    state.selectedAttractions = snap.selectedAttractions || [];
    state.customAttractions = snap.customAttractions || [];
    state.selectedIds = new Set(state.selectedAttractions.map(a => a.id));
    state.itinerary = snap.itinerary || { days: [], flat: [], matrix: null };
    state.currentDay = snap.currentDay || 0;
    state.segPrimaryMode = snap.segPrimaryMode || {};   // ★ 恢复交通方式
    state.segCache = {};
    state.pool = {};
  }
  function resetAll() {
    const fresh = defaultState();
    Object.keys(fresh).forEach(k => { state[k] = fresh[k]; });
    // 清 UI
    UI.$('#origin-input').value = '';
    UI.$('#start-date').value = '';
    UI.$('#end-date').value = '';
    UI.$('#budget-input').value = '';
    UI.renderDestinationTags([]);
    UI.renderDateSummary('', '');
    UI.$$('.option-chip').forEach(c => c.classList.remove('selected'));
    UI.setOnboardingCTAEnabled(false);
    UI.setPrefsCTAEnabled(false);
    UI.showPage('#page-onboarding');
  }

  /* =========================================================
     PAGE 1: Onboarding
     ========================================================= */
  function setupOnboarding() {
    // 出发地：可搜索（单选），类似目的地
    const originInput = UI.$('#origin-input');
    const originDd = UI.$('#origin-ac');
    let originAcTimer = null;

    originInput.addEventListener('input', e => {
      state.trip.origin = e.target.value.trim();
      state.trip.originLocation = null; // 用户改字 → 清掉之前选中的坐标
      checkOnboardingReady();
      const v = e.target.value.trim();
      clearTimeout(originAcTimer);
      if (v.length < 1) { UI.hideOriginAutoComplete(); return; }
      originAcTimer = setTimeout(() => triggerOriginAutoComplete(v), 250);
    });

    // 点击候选 → 设为出发地
    originDd.addEventListener('click', e => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      const idx = parseInt(item.dataset.idx);
      const tip = state.originAcTips && state.originAcTips[idx];
      if (!tip) return;
      state.trip.origin = tip.name;
      state.trip.originLocation = tip.location || null;
      originInput.value = tip.name;
      UI.hideOriginAutoComplete();
      checkOnboardingReady();
      UI.$('#destination-input').focus();
    });

    // 点击外部关闭出发地下拉
    document.addEventListener('click', e => {
      const wrap = UI.$('.origin-input-wrap');
      if (wrap && !wrap.contains(e.target)) UI.hideOriginAutoComplete();
    });

    // 创建 AutoComplete 下拉容器
    const destField = UI.$('#destination-tags').parentElement;
    const dd = document.createElement('div');
    dd.className = 'ac-dropdown';
    dd.id = 'destination-ac';
    destField.appendChild(dd);

    // 点击下拉外部关闭
    document.addEventListener('click', e => {
      if (!destField.contains(e.target)) UI.hideAutoComplete();
    });

    // 点击候选 → 添加
    dd.addEventListener('click', async e => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      const idx = parseInt(item.dataset.idx);
      const tip = state.acTips[idx];
      if (!tip) return;
      await addDestinationFromTip(tip);
    });

    // tag 区点击：移除 tag / 聚焦输入
    const wrap = UI.$('#destination-tags');
    const destInput = UI.$('#destination-input');
    wrap.addEventListener('click', e => {
      const removeBtn = e.target.closest('.tag-remove');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.idx);
        state.trip.destinations.splice(idx, 1);
        UI.renderDestinationTags(state.trip.destinations);
        checkOnboardingReady();
        return;
      }
      destInput.focus();
    });

    destInput.addEventListener('focus', () => {
      wrap.classList.add('focus-within');
      if (destInput.value.trim()) triggerAutoComplete(destInput.value.trim());
    });
    destInput.addEventListener('blur', () => {
      wrap.classList.remove('focus-within');
      // 延迟关闭，让 click 先触发
      setTimeout(() => UI.hideAutoComplete(), 150);
    });

    // 输入触发自动补全（防抖）
    let acTimer = null;
    destInput.addEventListener('input', e => {
      const v = e.target.value.trim();
      clearTimeout(acTimer);
      if (v.length < 1) {
        UI.hideAutoComplete();
        return;
      }
      acTimer = setTimeout(() => triggerAutoComplete(v), 250);
    });

    // 回车：必须从下拉选（去掉 geocode 兜底防止卡死）
    destInput.addEventListener('keydown', async e => {
      const isCommit = e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、';
      if (!isCommit) return;
      e.preventDefault();
      const v = destInput.value.trim();
      if (!v) return;
      if (state.acTips.length > 0) {
        await addDestinationFromTip(state.acTips[0]);
      } else {
        UI.toast('请等下拉出现后从中选择');
      }
    });

    UI.$('#onboarding-next').addEventListener('click', () => {
      // 把日期换算成天数
      const s = new Date(state.trip.startDate);
      const e = new Date(state.trip.endDate);
      state.trip.days = Math.round((e - s) / 86400000) + 1;
      UI.renderPrefsSummary(state);
      // ★ 显示默认选项的高亮 + 启用下一步按钮
      UI.setPreferenceSelected('transport', state.trip.transport);
      UI.setPreferenceSelected('style', state.trip.style);
      UI.renderBudget(state.trip.budget);
      checkPrefsReady();
      UI.showPage('#page-preferences');
    });

    // 日期选择
    const today = new Date().toISOString().slice(0, 10);
    const startInput = UI.$('#start-date');
    const endInput = UI.$('#end-date');
    startInput.min = today;
    endInput.min = today;

    // 让 cell 根据 input 是否有值切换 has-value 类（控制自定义 placeholder 显隐）
    function syncDateCell(input) {
      const cell = input.closest('.date-cell');
      if (cell) cell.classList.toggle('has-value', !!input.value);
    }
    syncDateCell(startInput);
    syncDateCell(endInput);

    startInput.addEventListener('change', () => {
      state.trip.startDate = startInput.value;
      syncDateCell(startInput);
      if (startInput.value) endInput.min = startInput.value;
      UI.renderDateSummary(state.trip.startDate, state.trip.endDate);
      checkOnboardingReady();
    });
    endInput.addEventListener('change', () => {
      state.trip.endDate = endInput.value;
      syncDateCell(endInput);
      UI.renderDateSummary(state.trip.startDate, state.trip.endDate);
      checkOnboardingReady();
    });

    // 移动端：点 cell 任意位置主动 focus + 触发原生选择器（兼容性兜底）
    [startInput, endInput].forEach(input => {
      const cell = input.closest('.date-cell');
      if (!cell) return;
      cell.addEventListener('click', e => {
        // 已经点到 input 本体就让浏览器自己处理
        if (e.target === input) return;
        try {
          input.focus();
          // 现代浏览器支持的程序化打开 picker
          if (typeof input.showPicker === 'function') input.showPicker();
        } catch (_) { /* 忽略 - 不支持的浏览器 fallback 到 focus */ }
      });
    });

    // 上次行程恢复条
    UI.$('#saved-restore').addEventListener('click', () => {
      const latest = Data.getLatestTrip();
      if (latest) {
        restoreFromSaved(latest);
        UI.renderTimelinePage(state);
        UI.showPage('#page-timeline');
        UI.hideSavedTripBanner();
      }
    });
    UI.$('#saved-discard').addEventListener('click', () => {
      const latest = Data.getLatestTrip();
      if (latest) Data.deleteTrip(latest.id);
      UI.hideSavedTripBanner();
      UI.toast('已删除');
    });
  }

  async function triggerAutoComplete(keyword) {
    UI.renderAutoComplete([], { loading: true });
    try {
      // 目的地框：只搜城市/区县，不要 POI
      const tips = await Data.searchAutoComplete(keyword, { cityOnly: true });
      state.acTips = tips;
      UI.renderAutoComplete(tips);
    } catch (e) {
      state.acTips = [];
      UI.renderAutoComplete([]);
    }
  }

  async function triggerOriginAutoComplete(keyword) {
    UI.renderOriginAutoComplete([], { loading: true });
    try {
      const tips = await Data.searchAutoComplete(keyword, { cityOnly: true });
      state.originAcTips = tips;
      UI.renderOriginAutoComplete(tips);
    } catch (e) {
      state.originAcTips = [];
      UI.renderOriginAutoComplete([]);
    }
  }

  async function addDestinationFromTip(tip) {
    const destInput = UI.$('#destination-input');
    if (state.trip.destinations.some(d => d.name === tip.name)) {
      UI.toast('已经添加过了');
      destInput.value = '';
      UI.hideAutoComplete();
      return;
    }
    let location = tip.location;
    if (!location) {
      try {
        const g = await Data.geocodeCity(tip.name);
        location = g.location;
      } catch (e) {
        UI.toast('无法定位这个地点');
        return;
      }
    }
    state.trip.destinations.push({
      name: tip.name,
      location,
      adcode: tip.adcode,
      district: tip.district
    });
    destInput.value = '';
    state.acTips = [];
    UI.hideAutoComplete();
    UI.renderDestinationTags(state.trip.destinations);
    checkOnboardingReady();
    destInput.focus();
  }

  function checkOnboardingReady() {
    const t = state.trip;
    const hasDate = t.startDate && t.endDate && new Date(t.endDate) >= new Date(t.startDate);
    const ready = t.origin.length > 0 && t.destinations.length > 0 && hasDate;
    UI.setOnboardingCTAEnabled(ready);
  }

  /* =========================================================
     PAGE 2: 偏好选项
     ========================================================= */
  function setupPreferences() {
    UI.$$('.option-grid').forEach(grid => {
      grid.addEventListener('click', e => {
        const chip = e.target.closest('.option-chip');
        if (!chip) return;
        const question = grid.dataset.prefs;
        const value = chip.dataset.value;
        state.trip[question] = (question === 'days') ? parseInt(value) : value;
        UI.setPreferenceSelected(question, value);
        checkPrefsReady();
      });
    });

    UI.$('#budget-input').addEventListener('input', e => {
      state.trip.budget = parseInt(e.target.value) || 0;
    });

    UI.$$('.budget-quick button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.trip.budget = parseInt(btn.dataset.value);
        UI.renderBudget(state.trip.budget);
      });
    });

    UI.$('#prefs-back').addEventListener('click', () => UI.showPage('#page-onboarding'));
    UI.$('#prefs-next').addEventListener('click', enterAttractionPool);
  }

  function checkPrefsReady() {
    const t = state.trip;
    const ready = t.transport && t.style;  // days 由日期自动算
    UI.setPrefsCTAEnabled(ready);
  }

  /* =========================================================
     PAGE 3: 景点池
     ========================================================= */
  function setupPool() {
    UI.$('#city-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.city-tab-btn');
      if (!btn) return;
      switchCity(btn.dataset.city);
    });

    // 自定义搜索：用事件委托，因为搜索框是动态渲染的
    UI.$('#attraction-grid').addEventListener('input', e => {
      if (e.target.id !== 'custom-search') return;
      const v = e.target.value.trim();
      clearTimeout(window.__customAcTimer);
      if (v.length < 1) {
        UI.hideCustomSearchDropdown();
        return;
      }
      window.__customAcTimer = setTimeout(() => triggerCustomAutoComplete(v), 250);
    });

    // 景点池关键字搜索（顶部）
    const poolSearch = UI.$('#pool-search');
    const poolSearchClear = UI.$('#pool-search-clear');
    let poolSearchTimer = null;
    poolSearch.addEventListener('input', () => {
      const v = poolSearch.value.trim();
      poolSearchClear.style.display = v ? 'flex' : 'none';
      clearTimeout(poolSearchTimer);
      poolSearchTimer = setTimeout(() => {
        state.poolKeyword = v || '景点';
        if (state.activeCity && state.activeCity !== CUSTOM_KEY) {
          loadCityPage(state.activeCity, 1);
        }
      }, 350);
    });
    poolSearchClear.addEventListener('click', () => {
      poolSearch.value = '';
      poolSearchClear.style.display = 'none';
      state.poolKeyword = '景点';
      if (state.activeCity && state.activeCity !== CUSTOM_KEY) {
        loadCityPage(state.activeCity, 1);
      }
    });

    // 点击下拉项 → 添加为自定义景点
    UI.$('#attraction-grid').addEventListener('click', async e => {
      // 自定义模式的下拉
      if (state.activeCity === CUSTOM_KEY) {
        const acItem = e.target.closest('#custom-search-dropdown .ac-item');
        if (acItem) {
          const idx = parseInt(acItem.dataset.idx);
          const tip = state.customAcTips[idx];
          if (tip) await addCustomAttraction(tip);
          return;
        }
      }
      // 心形按钮
      const heart = e.target.closest('.heart-btn');
      if (heart) {
        e.stopPropagation();
        toggleHeart(heart.dataset.fav);
        return;
      }
      // 卡片选中切换
      const card = e.target.closest('.attraction-card');
      if (card) toggleSelect(card.dataset.id);
    });

    // 点击自定义模式之外，关闭其下拉
    document.addEventListener('click', e => {
      if (!e.target.closest('.custom-search-block')) UI.hideCustomSearchDropdown();
    });

    // 顶部 + 底部分页都用同一个事件委托
    function onPagerClick(e) {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      loadCityPage(state.activeCity, parseInt(btn.dataset.page));
      // 滚回顶部，方便看新数据
      UI.$('.pool-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    UI.$('#pagination').addEventListener('click', onPagerClick);
    UI.$('#pagination-top').addEventListener('click', onPagerClick);

    UI.$('#pool-back').addEventListener('click', () => UI.showPage('#page-preferences'));
    UI.$('#pool-optimize').addEventListener('click', optimizeAndGo);
  }

  async function triggerCustomAutoComplete(keyword) {
    UI.renderCustomSearchDropdown([], { loading: true });
    try {
      const tips = await Data.searchAutoComplete(keyword);
      state.customAcTips = tips;
      UI.renderCustomSearchDropdown(tips);
    } catch (e) {
      state.customAcTips = [];
      UI.renderCustomSearchDropdown([]);
    }
  }

  async function addCustomAttraction(tip) {
    // 已经存在跳过
    if (state.customAttractions.some(a => a.id === tip.id || a.name === tip.name)) {
      UI.toast('已经加过了');
      UI.hideCustomSearchDropdown();
      const inp = UI.$('#custom-search'); if (inp) inp.value = '';
      return;
    }
    let location = tip.location;
    if (!location) {
      try {
        const g = await Data.geocodeCity(tip.name);
        location = g.location;
      } catch (e) {
        UI.toast('无法定位这个地点');
        return;
      }
    }
    const att = {
      id: tip.id || `custom-${Date.now()}`,
      name: tip.name,
      location,
      address: tip.district || tip.address || '',
      type: '自定义',
      city: tip.district || '',
      photoUrl: null,
      duration: CONFIG.DEFAULT_VISIT_DURATION,
      placeholder: 'placeholder-default',
      isFavorite: false
    };
    state.customAttractions.unshift(att);
    // ★ 同时存到"我的景点库"，下次打开就有
    Data.addMyPlace(att);
    // 自动选中
    state.selectedIds.add(att.id);
    state.selectedAttractions.push(att);
    // 清搜索框 + 重渲染
    const inp = UI.$('#custom-search');
    if (inp) inp.value = '';
    state.customAcTips = [];
    UI.hideCustomSearchDropdown();
    UI.renderCustomPoolView(state.customAttractions, state.selectedIds);
    UI.renderPoolCTA(state.selectedIds.size);
  }

  async function enterAttractionPool() {
    UI.showPage('#page-pool');
    // 把"我的景点库"中持久化的景点合并进当前 customAttractions（去重）
    const myPlaces = Data.getMyPlaces();
    myPlaces.forEach(p => {
      if (!state.customAttractions.some(c => c.id === p.id)) {
        state.customAttractions.push(p);
      }
    });
    UI.renderCityTabs(state.trip.destinations, state.trip.destinations[0].name);
    state.activeCity = state.trip.destinations[0].name;
    await loadCityPage(state.activeCity, 1);
    UI.renderPoolCTA(state.selectedIds.size);
  }

  async function switchCity(cityName) {
    state.activeCity = cityName;
    UI.renderCityTabs(state.trip.destinations, cityName);
    if (cityName === CUSTOM_KEY) {
      // 自定义视图
      UI.$('#pagination').innerHTML = '';
      UI.renderCustomPoolView(state.customAttractions, state.selectedIds);
      return;
    }
    const cached = state.pool[cityName];
    if (cached && cached.attractions) {
      renderCurrentPool();
    } else {
      await loadCityPage(cityName, 1);
    }
  }

  async function loadCityPage(cityName, page) {
    if (!state.pool[cityName]) {
      state.pool[cityName] = { attractions: [], page: 1, totalPages: 1 };
    }
    UI.renderSkeletons(5);
    UI.$('#pagination-top').innerHTML = '';
    try {
      const r = await Data.searchAttractions(cityName, page, state.poolKeyword);
      const slot = state.pool[cityName];
      slot.attractions = r.attractions;
      slot.page = r.page;
      slot.totalPages = Math.max(1, Math.ceil(r.total / CONFIG.PAGE_SIZE));
      renderCurrentPool();
    } catch (e) {
      console.error(e);
      UI.renderEmpty('景点搜索失败', '请检查网络或域名白名单');
    }
  }

  function renderCurrentPool() {
    const slot = state.pool[state.activeCity];
    if (!slot) return;
    const favIds = Data.getFavorites().map(f => f.id);
    slot.attractions.forEach(a => { a.isFavorite = favIds.includes(a.id); });
    UI.renderAttractionGrid(slot.attractions, state.selectedIds, favIds);
    UI.renderPagination(slot.page, slot.totalPages);
    // 顶部也渲染分页（复用同一函数，写到不同的容器）
    const topPager = UI.$('#pagination-top');
    if (slot.totalPages > 1) {
      topPager.innerHTML = `
        <button data-page="${slot.page - 1}" ${slot.page <= 1 ? 'disabled' : ''}>‹</button>
        <span class="page-info">${slot.page} / ${slot.totalPages}</span>
        <button data-page="${slot.page + 1}" ${slot.page >= slot.totalPages ? 'disabled' : ''}>›</button>
      `;
    } else {
      topPager.innerHTML = '';
    }
  }

  function toggleSelect(id) {
    let att;
    if (state.activeCity === CUSTOM_KEY) {
      att = state.customAttractions.find(a => a.id === id);
    } else {
      const slot = state.pool[state.activeCity];
      att = slot && slot.attractions.find(a => a.id === id);
    }
    if (!att) return;
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
      state.selectedAttractions = state.selectedAttractions.filter(a => a.id !== id);
    } else {
      state.selectedIds.add(id);
      state.selectedAttractions.push(att);
    }
    const card = UI.$(`#attraction-grid .attraction-card[data-id="${id}"]`);
    if (card) card.classList.toggle('selected', state.selectedIds.has(id));
    UI.renderPoolCTA(state.selectedIds.size);
    saveCurrentTrip();
  }

  function toggleHeart(id) {
    let att;
    if (state.activeCity === CUSTOM_KEY) {
      att = state.customAttractions.find(a => a.id === id);
    } else {
      const slot = state.pool[state.activeCity];
      att = slot && slot.attractions.find(a => a.id === id);
    }
    if (!att) return;
    const nowFav = Data.toggleFavorite(att);
    att.isFavorite = nowFav;
    const heart = UI.$(`#attraction-grid .heart-btn[data-fav="${id}"]`);
    if (heart) heart.classList.toggle('active', nowFav);
    UI.toast(nowFav ? '已加入收藏' : '已取消收藏');
  }

  /* =========================================================
     行程优化
     ========================================================= */
  async function optimizeAndGo() {
    const spots = state.selectedAttractions;
    if (spots.length < 1) {
      UI.toast('请至少选 1 个景点');
      return;
    }
    if (spots.length === 1) {
      state.itinerary = {
        days: [spots], flat: spots,
        matrix: { time: [[0]], dist: [[0]] }
      };
      state.currentDay = 0;
      state.segCache = {};
      UI.renderTimelinePage(state);
      UI.showPage('#page-timeline');
      return;
    }

    UI.showLoading('正在为你规划最佳路线…', '准备中');
    try {
      const result = await Route.planRoute(spots, state.trip.days, (stage, prog) => {
        if (stage === 'matrix') {
          UI.updateLoading('正在计算景点间驾驶时间…', `已完成 ${Math.round(prog * 100)}%`);
        } else if (stage === 'tsp') {
          UI.updateLoading('正在求解最优顺序…', '');
        } else if (stage === 'split') {
          UI.updateLoading('正在分配每天行程…', '');
        }
      });
      state.itinerary = {
        days: result.days,
        flat: result.order.map(i => spots[i]),
        matrix: result.matrix
      };
      state.currentDay = 0;
      state.segCache = {};
      saveCurrentTrip();          // ★ 优化完自动保存
      UI.renderTimelinePage(state);
      UI.hideLoading();
      UI.showPage('#page-timeline');
    } catch (e) {
      console.error(e);
      UI.hideLoading();
      UI.toast('路线计算失败：' + e.message);
    }
  }

  /* =========================================================
     PAGE 4: 时间轴 + 多模态展开
     ========================================================= */
  function setupTimeline() {
    UI.$('#timeline-back').addEventListener('click', () => UI.showPage('#page-pool'));

    // 重置（新建行程）
    UI.$('#timeline-reset').addEventListener('click', () => {
      // 确保当前行程已保存
      saveCurrentTrip();
      if (confirm('开始一段新的行程？当前行程已自动保存，可在首页恢复。')) {
        resetAll();
      }
    });

    UI.$('#day-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.day-tab');
      if (!btn) return;
      state.currentDay = parseInt(btn.dataset.day);
      UI.renderTimelinePage(state);
      saveCurrentTrip();
    });

    // 时间轴所有点击的事件委托
    UI.$('#timeline-list').addEventListener('click', async e => {
      // 编辑时长按钮
      const editBtn = e.target.closest('.card-edit-btn');
      if (editBtn) {
        e.stopPropagation();
        const card = editBtn.closest('.timeline-card');
        if (!card) return;
        const day = state.itinerary.days[state.currentDay];
        const spot = day.find(s => s.id === card.dataset.spotId);
        if (!spot) return;
        state.editingSpotId = spot.id;
        UI.showEditDurationModal(spot.name, spot.duration || CONFIG.DEFAULT_VISIT_DURATION);
        return;
      }
      // 路段导航按钮
      const navBtn = e.target.closest('.seg-nav-btn');
      if (navBtn) {
        e.stopPropagation();
        const seg = navBtn.closest('.road-segment');
        if (seg) openSegmentNavigation(seg);
        return;
      }
      // 路段模式行（点击设为主显方式）
      const modeRow = e.target.closest('.mode-row');
      if (modeRow && !modeRow.classList.contains('loading') && !modeRow.classList.contains('failed')) {
        e.stopPropagation();
        const seg = modeRow.closest('.road-segment');
        const mode = modeRow.dataset.mode;
        if (seg && mode) pickSegmentPrimaryMode(seg, mode);
        return;
      }
      // 路段汇总（除导航按钮以外的区域）→ 展开/折叠
      const segHead = e.target.closest('[data-action="toggle"]');
      if (segHead) {
        const seg = segHead.closest('.road-segment');
        if (!seg) return;
        const expanding = !seg.classList.contains('expanded');
        seg.classList.toggle('expanded');
        if (expanding) await loadSegmentModes(seg);
        return;
      }
      // 景点卡 → 唤起导航
      const card = e.target.closest('.timeline-card');
      if (card) {
        const day = state.itinerary.days[state.currentDay];
        const spot = day.find(s => s.id === card.dataset.spotId);
        if (spot) openNavigation(spot);
      }
    });

    UI.$('#timeline-map').addEventListener('click', () => {
      UI.showPage('#page-map');
      const day = state.itinerary.days[state.currentDay];
      MapView.ensureMap('map-container', day[0].location);
      MapView.drawDay(day);
      UI.$('#map-header-info').textContent = `Day ${state.currentDay + 1} · 共 ${day.length} 站`;
    });

    UI.$('#map-close').addEventListener('click', () => UI.showPage('#page-timeline'));

    // 保存按钮
    UI.$('#timeline-save').addEventListener('click', () => {
      // 自动生成默认名字
      const dest = state.trip.destinations.map(d => d.name).join(' · ');
      const days = state.itinerary.days.length;
      const defaultName = `${state.trip.origin || ''} → ${dest}（${days}天）`;
      // 看当前是否已经在收藏中
      const dupTrip = Data.getSavedTrips().find(t =>
        t.snapshot.trip.origin === state.trip.origin &&
        JSON.stringify((t.snapshot.trip.destinations || []).map(d=>d.name).sort()) ===
        JSON.stringify(state.trip.destinations.map(d=>d.name).sort())
      );
      UI.showSaveModal(
        dupTrip ? dupTrip.title : defaultName,
        dupTrip ? !!dupTrip.favorite : false
      );
    });
    UI.$('#save-cancel').addEventListener('click', UI.hideSaveModal);
    UI.$('#save-modal-backdrop').addEventListener('click', UI.hideSaveModal);
    UI.$('#save-confirm').addEventListener('click', () => {
      const title = UI.$('#save-name-input').value.trim() || '未命名行程';
      const favorite = UI.$('#save-fav-check').checked;
      const trip = saveCurrentTrip({ title, favorite });
      UI.hideSaveModal();
      if (trip) {
        UI.toast(favorite ? '已保存并加入收藏 ⭐' : '已保存');
      } else {
        UI.toast('保存失败');
      }
    });

    // 编辑时长 modal 相关
    setupDurationModal();
    // 行程列表 modal
    setupTripsModal();
  }

  function setupDurationModal() {
    let workingHours = CONFIG.DEFAULT_VISIT_DURATION;
    const numEl = UI.$('#duration-num');
    function setH(h) {
      h = Math.max(0.5, Math.min(12, Math.round(h * 2) / 2));
      workingHours = h;
      UI.setDurationValue(h);
    }
    UI.$('#duration-minus').addEventListener('click', () => setH(workingHours - 0.5));
    UI.$('#duration-plus').addEventListener('click', () => setH(workingHours + 0.5));
    UI.$$('.duration-presets button').forEach(b => {
      b.addEventListener('click', () => setH(parseFloat(b.dataset.h)));
    });
    UI.$('#edit-cancel').addEventListener('click', UI.hideEditDurationModal);
    UI.$('#edit-modal-backdrop').addEventListener('click', UI.hideEditDurationModal);
    UI.$('#edit-save').addEventListener('click', () => {
      if (!state.editingSpotId) return UI.hideEditDurationModal();
      // 更新 itinerary 中的 spot.duration
      let updated = false;
      state.itinerary.days.forEach(day => {
        day.forEach(s => {
          if (s.id === state.editingSpotId) { s.duration = workingHours; updated = true; }
        });
      });
      // 同步更新 selectedAttractions / customAttractions
      [state.selectedAttractions, state.customAttractions].forEach(arr => {
        const a = arr.find(x => x.id === state.editingSpotId);
        if (a) a.duration = workingHours;
      });
      if (updated) {
        UI.renderTimelinePage(state);
        UI.toast('时长已更新');
        saveCurrentTrip();
      }
      state.editingSpotId = null;
      UI.hideEditDurationModal();
    });
    // 同步初值
    const observer = new MutationObserver(() => {
      const txt = numEl.textContent;
      const v = parseFloat(txt);
      if (!isNaN(v)) workingHours = v;
    });
    observer.observe(numEl, { childList: true });
  }

  function setupTripsModal() {
    UI.$('#trips-modal-backdrop').addEventListener('click', UI.hideTripsModal);
    UI.$('#trips-close').addEventListener('click', UI.hideTripsModal);
    UI.$('#trips-list').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'restore') {
        const trips = Data.getSavedTrips();
        const t = trips.find(x => x.id === id);
        if (t) {
          restoreFromSaved(t);
          UI.hideTripsModal();
          UI.renderTimelinePage(state);
          UI.showPage('#page-timeline');
        }
      } else if (btn.dataset.action === 'delete') {
        if (confirm('确定删除这条行程？')) {
          Data.deleteTrip(id);
          UI.renderTripsList(Data.getSavedTrips());
        }
      }
    });
  }

  /**
   * 路段展开时按需加载 5 种交通方式
   * 缓存到 state.segCache，下次秒开
   */
  async function loadSegmentModes(segEl) {
    const fromId = segEl.dataset.fromId;
    const toId = segEl.dataset.toId;
    const cacheKey = `${fromId}->${toId}`;
    const primaryMode = state.segPrimaryMode[cacheKey]
      || (state.trip.transport === 'public' ? 'transit' : 'driving');
    if (state.segCache[cacheKey]) {
      UI.renderSegmentModes(segEl.id, state.segCache[cacheKey], primaryMode);
      return;
    }
    const day = state.itinerary.days[state.currentDay];
    const from = day.find(s => s.id === fromId);
    const to = day.find(s => s.id === toId);
    if (!from || !to) return;
    const cityName = from.city || (state.trip.destinations[0] && state.trip.destinations[0].name) || '';
    try {
      const modes = await Route.getAllModes(from.location, to.location, cityName);
      state.segCache[cacheKey] = modes;
      UI.renderSegmentModes(segEl.id, modes, primaryMode);
    } catch (e) {
      console.error(e);
      UI.toast('部分交通方式查询失败');
    }
  }

  /**
   * 用户在路段展开里点选某种交通方式 → 设为该路段的主显方式
   */
  function pickSegmentPrimaryMode(segEl, mode) {
    const fromId = segEl.dataset.fromId;
    const toId = segEl.dataset.toId;
    const cacheKey = `${fromId}->${toId}`;
    state.segPrimaryMode[cacheKey] = mode;
    const data = state.segCache[cacheKey] && state.segCache[cacheKey][mode];
    UI.updateSegmentPrimary(segEl.id, mode, data);
    // ★ 实时刷新 Day Summary 的"路上 / 总用时"
    UI.renderDaySummary(state);
    UI.toast(`已设为${{driving:'自驾',transit:'公交',taxi:'打车',riding:'骑行',walking:'步行'}[mode]}`);
    saveCurrentTrip();
  }

  /**
   * 路段导航按钮：在新窗口打开高德地图导航（两个景点之间）
   * mode 参数对应高德 URI 的 mode：car / bus / walk / ride
   */
  function openSegmentNavigation(segEl) {
    const fromId = segEl.dataset.fromId;
    const toId = segEl.dataset.toId;
    const cacheKey = `${fromId}->${toId}`;
    const day = state.itinerary.days[state.currentDay];
    const from = day.find(s => s.id === fromId);
    const to = day.find(s => s.id === toId);
    if (!from || !to) return;
    const mode = state.segPrimaryMode[cacheKey]
      || (state.trip.transport === 'public' ? 'transit' : 'driving');
    // 高德 mode 映射
    const amapMode = { driving: 'car', taxi: 'car', transit: 'bus', riding: 'ride', walking: 'walk' }[mode] || 'car';
    const url = `https://uri.amap.com/navigation` +
      `?from=${from.location[0]},${from.location[1]},${encodeURIComponent(from.name)}` +
      `&to=${to.location[0]},${to.location[1]},${encodeURIComponent(to.name)}` +
      `&mode=${amapMode}&policy=1&src=travel-planner&coordinate=gaode&callnative=1`;
    window.open(url, '_blank');
  }

  function openNavigation(spot) {
    const [lng, lat] = spot.location;
    const url = `https://uri.amap.com/marker?position=${lng},${lat}` +
                `&name=${encodeURIComponent(spot.name)}&src=travel-planner&coordinate=gaode&callnative=1`;
    window.open(url, '_blank');
  }

  /* =========================================================
     手动添加景点 modal（用地图点选位置）
     ========================================================= */
  let _manualMap = null;
  let _manualMarker = null;
  let _manualPos = null;
  let _manualDuration = CONFIG.DEFAULT_VISIT_DURATION;

  function setupManualAddModal() {
    // 入口按钮（在 attraction-grid 中动态渲染，所以用事件委托）
    UI.$('#attraction-grid').addEventListener('click', e => {
      // 打开手动添加 modal
      if (e.target.closest('#open-manual-add')) {
        e.stopPropagation();
        openManualAddModal();
        return;
      }
      // 删除我的景点
      const rmBtn = e.target.closest('.my-place-remove');
      if (rmBtn) {
        e.stopPropagation();
        e.preventDefault();
        removeMyPlace(rmBtn.dataset.id);
        return;
      }
    });

    // 关闭按钮
    UI.$('#manual-cancel').addEventListener('click', closeManualAddModal);
    UI.$('#manual-modal-backdrop').addEventListener('click', closeManualAddModal);

    // 时长 ± 按钮
    UI.$('#manual-dur-minus').addEventListener('click', () => {
      _manualDuration = Math.max(0.5, +(_manualDuration - 0.5).toFixed(1));
      UI.$('#manual-dur-num').textContent = _manualDuration;
    });
    UI.$('#manual-dur-plus').addEventListener('click', () => {
      _manualDuration = Math.min(12, +(_manualDuration + 0.5).toFixed(1));
      UI.$('#manual-dur-num').textContent = _manualDuration;
    });

    // 坐标输入：跳到这个坐标
    const latInput = UI.$('#manual-lat');
    const lngInput = UI.$('#manual-lng');
    UI.$('#manual-coord-jump').addEventListener('click', jumpToTypedCoord);
    // 回车也触发
    [latInput, lngInput].forEach(el => {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') jumpToTypedCoord();
      });
      // 输错时清掉红色标记
      el.addEventListener('input', () => el.classList.remove('invalid'));
    });

    // 保存按钮
    UI.$('#manual-save').addEventListener('click', saveManualAttraction);

    // ========== 搜索：在高德里搜索 → 一键填入 ==========
    const searchInput = UI.$('#manual-search');
    const searchDd = UI.$('#manual-search-dd');
    let searchTimer = null;
    let manualSearchTips = [];

    searchInput.addEventListener('input', () => {
      const v = searchInput.value.trim();
      clearTimeout(searchTimer);
      if (v.length < 1) { hideManualSearchDd(); return; }
      searchTimer = setTimeout(async () => {
        searchDd.innerHTML = `<div class="ac-loading">搜索中…</div>`;
        searchDd.classList.add('show');
        try {
          // 不限 cityOnly：城市 + POI + Geocoder 全要
          const tips = await Data.searchAutoComplete(v);
          manualSearchTips = tips;
          if (!tips.length) {
            searchDd.innerHTML = `<div class="ac-empty">没找到 — 用下面的方式手动加</div>`;
          } else {
            searchDd.innerHTML = tips.slice(0, 10).map((t, i) => `
              <div class="ac-item ${t.isCity ? 'is-city' : ''}" data-idx="${i}">
                <div class="ac-icon ${t.isCity ? 'city-icon' : ''}">${t.isCity ? '🏙' : '📍'}</div>
                <div class="ac-text">
                  <div class="ac-name">${t.name}</div>
                  <div class="ac-district">${t.district || t.address || '点击填入'}</div>
                </div>
              </div>
            `).join('');
          }
        } catch (e) {
          searchDd.innerHTML = `<div class="ac-empty">搜索失败 — 请检查网络</div>`;
        }
      }, 300);
    });

    // 选中候选 → 一键填入名字、坐标、地址、地图 marker
    searchDd.addEventListener('click', e => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      const idx = parseInt(item.dataset.idx);
      const tip = manualSearchTips[idx];
      if (!tip) return;
      applyTipToManualForm(tip);
      hideManualSearchDd();
      searchInput.value = '';
    });

    // 点击外部关闭搜索下拉
    document.addEventListener('click', e => {
      if (!UI.$('.manual-search-wrap').contains(e.target)) hideManualSearchDd();
    });

    function hideManualSearchDd() { searchDd.classList.remove('show'); }
  }

  /**
   * 把搜索到的 tip 一键填入手动添加表单的所有字段
   */
  function applyTipToManualForm(tip) {
    if (!tip) return;
    // 名字（如果用户已输 → 不覆盖）
    const nameInput = UI.$('#manual-name');
    if (!nameInput.value.trim()) nameInput.value = tip.name;
    // 地址
    const addrInput = UI.$('#manual-address');
    if (!addrInput.value.trim()) addrInput.value = tip.district || tip.address || '';
    // 坐标 + marker
    if (tip.location) {
      _manualPos = tip.location.slice();
      UI.$('#manual-lat').value = _manualPos[1].toFixed(6);
      UI.$('#manual-lng').value = _manualPos[0].toFixed(6);
      UI.$('#manual-lat').classList.remove('invalid');
      UI.$('#manual-lng').classList.remove('invalid');
      UI.$('#manual-coords').textContent = `已标记 · ${_manualPos[1].toFixed(4)}, ${_manualPos[0].toFixed(4)}`;
      UI.$('#manual-coords').classList.add('has-coord');
      // 同步到地图
      if (!_manualMap) initManualMap();
      if (_manualMap) {
        if (!_manualMarker) {
          _manualMarker = new AMap.Marker({ position: _manualPos, map: _manualMap });
        } else {
          _manualMarker.setPosition(_manualPos);
        }
        _manualMap.setZoomAndCenter(15, _manualPos);
      }
      UI.toast(`✓ 已填入"${tip.name}"，可在地图上微调`);
    } else {
      // 没坐标的 tip → 用 Geocoder 兜底
      Data.geocodeCity(tip.name).then(g => {
        applyTipToManualForm({ ...tip, location: g.location });
      }).catch(() => {
        UI.toast('找到了名字但定不了位，请在地图上手动点选');
      });
    }
  }

  /**
   * 把输入框里的纬度/经度同步到地图：移动 marker、居中、反向解析地址
   */
  function jumpToTypedCoord() {
    const latInput = UI.$('#manual-lat');
    const lngInput = UI.$('#manual-lng');
    const lat = parseFloat(latInput.value.trim());
    const lng = parseFloat(lngInput.value.trim());
    let bad = false;
    if (isNaN(lat) || lat < -90 || lat > 90) { latInput.classList.add('invalid'); bad = true; }
    if (isNaN(lng) || lng < -180 || lng > 180) { lngInput.classList.add('invalid'); bad = true; }
    if (bad) {
      UI.toast('坐标格式不对：纬度 -90~90，经度 -180~180');
      return;
    }
    if (!_manualMap) initManualMap();
    if (!_manualMap) { UI.toast('地图还没加载'); return; }
    _manualPos = [lng, lat];   // 高德是 [lng, lat] 顺序
    if (!_manualMarker) {
      _manualMarker = new AMap.Marker({ position: _manualPos, map: _manualMap });
    } else {
      _manualMarker.setPosition(_manualPos);
    }
    _manualMap.setZoomAndCenter(14, _manualPos);
    UI.$('#manual-coords').textContent = `已标记 · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    UI.$('#manual-coords').classList.add('has-coord');
    // 同步地址（如果地址栏空）
    Data.reverseGeocode(_manualPos).then(addr => {
      const addrInput = UI.$('#manual-address');
      if (addrInput && !addrInput.value && addr) addrInput.value = addr;
    }).catch(() => {});
  }

  function openManualAddModal() {
    // 重置表单
    UI.$('#manual-name').value = '';
    UI.$('#manual-address').value = '';
    UI.$('#manual-lat').value = '';
    UI.$('#manual-lng').value = '';
    UI.$('#manual-search').value = '';
    UI.$('#manual-search-dd').classList.remove('show');
    UI.$('#manual-lat').classList.remove('invalid');
    UI.$('#manual-lng').classList.remove('invalid');
    UI.$('#manual-coords').textContent = '还没标记位置';
    UI.$('#manual-coords').classList.remove('has-coord');
    _manualPos = null;
    _manualDuration = CONFIG.DEFAULT_VISIT_DURATION;
    UI.$('#manual-dur-num').textContent = _manualDuration;

    // 显示弹窗
    UI.$('#manual-modal-backdrop').classList.add('show');
    UI.$('#manual-modal').classList.add('show');

    // 等弹窗动画完，再初始化地图（保证容器有尺寸）
    setTimeout(() => initManualMap(), 350);
  }

  function closeManualAddModal() {
    UI.$('#manual-modal-backdrop').classList.remove('show');
    UI.$('#manual-modal').classList.remove('show');
    // 清掉 marker，但保留 map 实例下次复用
    if (_manualMarker) {
      _manualMarker.setMap(null);
      _manualMarker = null;
    }
    _manualPos = null;
  }

  function initManualMap() {
    if (_manualMap) {
      // 已经初始化过 → resize 一下保证布局正确
      _manualMap.resize();
      return;
    }
    if (!window.AMap) return;
    // 默认中心：当前目的地中心；没有则用中国中心
    const dest = state.trip.destinations && state.trip.destinations[0];
    const center = dest && dest.location ? dest.location : [104, 35];
    const zoom = dest && dest.location ? 11 : 4;

    _manualMap = new AMap.Map('manual-map-container', {
      zoom,
      center,
      mapStyle: 'amap://styles/whitesmoke',
      viewMode: '2D'
    });

    _manualMap.on('click', e => {
      _manualPos = [e.lnglat.getLng(), e.lnglat.getLat()];
      if (!_manualMarker) {
        _manualMarker = new AMap.Marker({
          position: _manualPos,
          map: _manualMap
        });
      } else {
        _manualMarker.setPosition(_manualPos);
      }
      // 更新坐标显示
      UI.$('#manual-coords').textContent =
        `已标记 · ${_manualPos[1].toFixed(4)}, ${_manualPos[0].toFixed(4)}`;
      UI.$('#manual-coords').classList.add('has-coord');
      // ★ 双向同步：把坐标填回输入框
      UI.$('#manual-lat').value = _manualPos[1].toFixed(6);
      UI.$('#manual-lng').value = _manualPos[0].toFixed(6);
      UI.$('#manual-lat').classList.remove('invalid');
      UI.$('#manual-lng').classList.remove('invalid');
      // 自动反向解析地址
      Data.reverseGeocode(_manualPos).then(addr => {
        const addrInput = UI.$('#manual-address');
        if (addrInput && !addrInput.value && addr) addrInput.value = addr;
      }).catch(() => {});
    });
  }

  function saveManualAttraction() {
    const name = UI.$('#manual-name').value.trim();
    if (!name) {
      UI.toast('请输入景点名字');
      UI.$('#manual-name').focus();
      return;
    }
    if (!_manualPos) {
      UI.toast('请在地图上点击标记位置');
      return;
    }
    const att = {
      id: 'manual-' + Date.now(),
      name,
      location: _manualPos.slice(),
      address: UI.$('#manual-address').value.trim(),
      type: '自定义',
      city: '',
      photoUrl: null,
      duration: _manualDuration,
      placeholder: 'placeholder-default',
      isFavorite: false
    };
    // 加入当前会话
    state.customAttractions.unshift(att);
    // 持久化到我的景点库
    Data.addMyPlace(att);
    // 自动选中
    state.selectedIds.add(att.id);
    state.selectedAttractions.push(att);
    // 重新渲染 + 关闭弹窗
    UI.renderCustomPoolView(state.customAttractions, state.selectedIds);
    UI.renderPoolCTA(state.selectedIds.size);
    closeManualAddModal();
    UI.toast(`✓ 已添加"${name}"`);
  }

  function removeMyPlace(id) {
    if (!id) return;
    // 从持久化库移除
    Data.removeMyPlace(id);
    // 从当前会话移除
    state.customAttractions = state.customAttractions.filter(a => a.id !== id);
    // 如果已选中也取消
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
      state.selectedAttractions = state.selectedAttractions.filter(a => a.id !== id);
    }
    UI.renderCustomPoolView(state.customAttractions, state.selectedIds);
    UI.renderPoolCTA(state.selectedIds.size);
    UI.toast('已从我的景点库移除');
  }

  /* =========================================================
     启动
     ========================================================= */
  function bootstrap(retries = 30) {
    if (!window.AMap) {
      if (retries > 0) {
        setTimeout(() => bootstrap(retries - 1), 100);
        return;
      }
      UI.toast('地图加载失败，请检查 Key 与白名单', 5000);
      return;
    }
    setupOnboarding();
    setupPreferences();
    setupPool();
    setupTimeline();
    setupManualAddModal();

    // 检查是否有保存的行程
    const trips = Data.getSavedTrips();
    if (trips.length > 0) {
      UI.renderSavedTripBanner(trips[0]);
      // 顶部"我的行程"按钮
      const myBtn = UI.$('#my-trips-btn');
      if (myBtn) {
        myBtn.style.display = 'flex';
        UI.$('#my-trips-count').textContent = trips.length;
        myBtn.addEventListener('click', () => {
          UI.renderTripsList(Data.getSavedTrips());
          UI.showTripsModal();
        });
      }
      // banner 上加"查看更多"逻辑
      const banner = UI.$('#saved-banner');
      if (trips.length > 1 && banner && !banner.querySelector('.saved-all-link')) {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'saved-all-link';
        link.textContent = `还有 ${trips.length - 1} 条…`;
        link.onclick = (e) => {
          e.preventDefault();
          UI.renderTripsList(Data.getSavedTrips());
          UI.showTripsModal();
        };
        banner.querySelector('.saved-text').appendChild(link);
      }
    }

    UI.showPage('#page-onboarding');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => bootstrap());
  } else {
    bootstrap();
  }
})();
