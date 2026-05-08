/**
 * ui.js
 * UI 渲染：各页面的视图生成（不修改业务状态）
 */

const UI = (() => {

  /* =========================================================
     通用工具
     ========================================================= */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  function showPage(pageId) {
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(pageId).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(msg, duration = 2000) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), duration);
  }

  function showLoading(text = '加载中…', progress = '') {
    $('#loading-text').textContent = text;
    $('#loading-progress').textContent = progress;
    $('#loading-screen').classList.remove('hidden');
  }
  function updateLoading(text, progress) {
    if (text !== undefined)     $('#loading-text').textContent = text;
    if (progress !== undefined) $('#loading-progress').textContent = progress;
  }
  function hideLoading() {
    $('#loading-screen').classList.add('hidden');
  }

  /* =========================================================
     PAGE 1: Onboarding
     ========================================================= */
  function renderOriginCity(originCity) {
    $('#origin-input').value = originCity || '';
  }

  function renderDestinationTags(destinations) {
    const wrap = $('#destination-tags');
    wrap.querySelectorAll('.city-tag').forEach(t => t.remove());
    destinations.forEach((d, idx) => {
      const tag = document.createElement('span');
      tag.className = 'city-tag';
      tag.innerHTML = `
        <span>${d.name}</span>
        <button class="tag-remove" data-idx="${idx}" aria-label="移除">✕</button>
      `;
      wrap.insertBefore(tag, $('#destination-input'));
    });
  }

  function setOnboardingCTAEnabled(enabled) {
    $('#onboarding-next').disabled = !enabled;
  }

  /* 上次行程恢复条 */
  function renderSavedTripBanner(saved) {
    if (!saved || !saved.trip) return;
    const banner = $('#saved-banner');
    if (!banner) return;
    const dest = (saved.trip.destinations || []).map(d => d.name).join(' · ') || '—';
    const days = (saved.itinerary && saved.itinerary.days) ? saved.itinerary.days.length : 0;
    const ago = _formatTimeAgo(saved.savedAt);
    $('#saved-title').textContent = '上次的行程';
    $('#saved-sub').textContent = `${saved.trip.origin || '?'} → ${dest} · ${days} 天 · ${ago}`;
    banner.classList.remove('hidden');
  }
  function hideSavedTripBanner() {
    const banner = $('#saved-banner');
    if (banner) banner.classList.add('hidden');
  }
  function _formatTimeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} 天前`;
    return new Date(iso).toLocaleDateString('zh-CN');
  }

  /* 日期选择器：根据起止日期更新摘要 */
  function renderDateSummary(startDate, endDate) {
    const summary = $('#date-summary');
    if (!summary) return;
    if (!startDate || !endDate) {
      summary.textContent = '还没选日期';
      summary.classList.remove('valid');
      return;
    }
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) {
      summary.textContent = '返回日期不能早于出发日期';
      summary.classList.remove('valid');
      return;
    }
    const days = Math.round((e - s) / 86400000) + 1;
    summary.textContent = `共 ${days} 天 · ${_formatDateChs(s)} → ${_formatDateChs(e)}`;
    summary.classList.add('valid');
  }
  function _formatDateChs(d) {
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }

  /* 已保存行程列表 modal */
  function renderTripsList(trips) {
    const list = $('#trips-list');
    if (!list) return;
    if (!trips || trips.length === 0) {
      list.innerHTML = `<div class="trips-empty">还没有保存的行程<br/>规划完一段就会自动保存到这里</div>`;
      return;
    }
    list.innerHTML = trips.map(t => `
      <div class="trip-row ${t.favorite ? 'is-favorite' : ''}" data-id="${t.id}">
        <div class="trip-icon">${t.favorite ? '⭐' : '📌'}</div>
        <div class="trip-info">
          <div class="trip-title">${t.title || '未命名行程'}</div>
          <div class="trip-meta">${_formatTimeAgo(t.savedAt)}${t.favorite ? ' · 已收藏' : ''}</div>
        </div>
        <div class="trip-actions">
          <button class="trip-restore" data-action="restore" data-id="${t.id}">恢复</button>
          <button class="trip-delete" data-action="delete" data-id="${t.id}" aria-label="删除">✕</button>
        </div>
      </div>
    `).join('');
  }

  function showTripsModal() {
    $('#trips-modal-backdrop').classList.add('show');
    $('#trips-modal').classList.add('show');
  }
  function hideTripsModal() {
    $('#trips-modal-backdrop').classList.remove('show');
    $('#trips-modal').classList.remove('show');
  }

  /* 编辑时长 modal */
  function showEditDurationModal(spotName, currentHours) {
    $('#edit-spot-name').textContent = spotName;
    $('#duration-num').textContent = currentHours;
    _highlightPreset(currentHours);
    $('#edit-modal-backdrop').classList.add('show');
    $('#edit-modal').classList.add('show');
  }
  function hideEditDurationModal() {
    $('#edit-modal-backdrop').classList.remove('show');
    $('#edit-modal').classList.remove('show');
  }
  function setDurationValue(h) {
    $('#duration-num').textContent = h;
    _highlightPreset(h);
  }
  function _highlightPreset(h) {
    document.querySelectorAll('.duration-presets button').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.h) === h);
    });
  }

  /* 保存对话框 */
  function showSaveModal(defaultName, isFavorite) {
    $('#save-name-input').value = defaultName || '';
    $('#save-fav-check').checked = !!isFavorite;
    $('#save-modal-backdrop').classList.add('show');
    $('#save-modal').classList.add('show');
    setTimeout(() => $('#save-name-input').focus(), 300);
  }
  function hideSaveModal() {
    $('#save-modal-backdrop').classList.remove('show');
    $('#save-modal').classList.remove('show');
  }

  /* AutoComplete 下拉 */
  function renderAutoComplete(tips, options = {}) {
    let dd = $('#destination-ac');
    if (!dd) return;
    if (options.loading) {
      dd.innerHTML = `<div class="ac-loading">搜索中…</div>`;
      dd.classList.add('show');
      return;
    }
    if (!tips || tips.length === 0) {
      dd.innerHTML = `<div class="ac-empty">没有找到，换个关键词试试</div>`;
      dd.classList.add('show');
      return;
    }
    dd.innerHTML = tips.slice(0, 10).map((t, i) => {
      const isCity = t.isCity;
      const iconSvg = isCity
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/>
           </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
             <circle cx="12" cy="10" r="3"/>
           </svg>`;
      const subText = t.district || t.address || '';
      const cityBadge = isCity ? `<span class="ac-badge">${t.district || '城市'}</span>` : '';
      return `
        <div class="ac-item ${isCity ? 'is-city' : ''}" data-idx="${i}">
          <div class="ac-icon ${isCity ? 'city-icon' : ''}">${iconSvg}</div>
          <div class="ac-text">
            <div class="ac-name">${t.name}${cityBadge}</div>
            <div class="ac-district">${isCity ? '点击添加为目的地' : subText}</div>
          </div>
        </div>
      `;
    }).join('');
    dd.classList.add('show');
  }

  function hideAutoComplete() {
    const dd = $('#destination-ac');
    if (dd) dd.classList.remove('show');
  }

  /* 出发地下拉（单选），样式复用 .ac-item */
  function renderOriginAutoComplete(tips, options = {}) {
    const dd = $('#origin-ac');
    if (!dd) return;
    if (options.loading) {
      dd.innerHTML = `<div class="ac-loading">搜索中…</div>`;
      dd.classList.add('show');
      return;
    }
    if (!tips || tips.length === 0) {
      dd.innerHTML = `<div class="ac-empty">没有找到，可以直接输入名字</div>`;
      dd.classList.add('show');
      return;
    }
    dd.innerHTML = tips.slice(0, 10).map((t, i) => {
      const cityBadge = t.isCity ? `<span class="ac-badge">${t.district || '城市'}</span>` : '';
      return `
        <div class="ac-item ${t.isCity ? 'is-city' : ''}" data-idx="${i}">
          <div class="ac-icon ${t.isCity ? 'city-icon' : ''}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/>
            </svg>
          </div>
          <div class="ac-text">
            <div class="ac-name">${t.name}${cityBadge}</div>
            <div class="ac-district">${t.isCity ? '点击设为出发地' : (t.district || t.address || '')}</div>
          </div>
        </div>
      `;
    }).join('');
    dd.classList.add('show');
  }
  function hideOriginAutoComplete() {
    const dd = $('#origin-ac');
    if (dd) dd.classList.remove('show');
  }

  /* =========================================================
     PAGE 2: 偏好选项
     ========================================================= */
  function setPreferenceSelected(question, value) {
    $$(`[data-prefs="${question}"] .option-chip`).forEach(c => {
      c.classList.toggle('selected', c.dataset.value === String(value));
    });
  }

  function renderBudget(value) {
    $('#budget-input').value = value || '';
  }

  function renderPrefsSummary(state) {
    const dest = state.trip.destinations.map(d => d.name).join(' · ') || '—';
    $('#prefs-route').textContent = `${state.trip.origin || '出发地'} → ${dest}`;
  }

  function setPrefsCTAEnabled(enabled) {
    $('#prefs-next').disabled = !enabled;
  }

  /* =========================================================
     PAGE 3: 景点池（横向长卡片）
     ========================================================= */
  function renderCityTabs(destinations, activeCity) {
    const tabs = $('#city-tabs');
    const cityHtml = destinations.map(d => `
      <button class="city-tab-btn ${d.name === activeCity ? 'active' : ''}" data-city="${d.name}">
        ${d.name}
      </button>
    `).join('');
    // 末尾加 "自己加" tab
    const customHtml = `
      <button class="city-tab-btn custom-tab ${activeCity === '__custom__' ? 'active' : ''}" data-city="__custom__">
        + 自己加
      </button>
    `;
    tabs.innerHTML = cityHtml + customHtml;
  }

  function renderSkeletons(count = 5) {
    const grid = $('#attraction-grid');
    grid.className = 'skeleton-grid';
    grid.innerHTML = Array(count).fill(0).map(() =>
      `<div class="skeleton-card"></div>`
    ).join('');
    $('#pagination').innerHTML = '';
  }

  function renderEmpty(title, sub) {
    $('#attraction-grid').className = '';
    $('#attraction-grid').innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-icon">🗺</div>
        <div class="empty-title">${title}</div>
        <div class="empty-sub">${sub}</div>
      </div>
    `;
    $('#pagination').innerHTML = '';
  }

  /**
   * 横向长卡片（一行一个）
   */
  function renderAttractionGrid(attractions, selectedIds, favIds) {
    const grid = $('#attraction-grid');
    grid.className = 'attraction-grid';
    if (attractions.length === 0) {
      renderEmpty('这里暂时没有景点', '换一页或者换一个城市');
      return;
    }

    const favSet = new Set(favIds);
    // 收藏置顶
    const sorted = [...attractions].sort((a, b) => {
      const af = favSet.has(a.id) ? 1 : 0;
      const bf = favSet.has(b.id) ? 1 : 0;
      return bf - af;
    });

    grid.innerHTML = sorted.map((a, i) => {
      // 主类型 - 高德 type 形如 "风景名胜;旅游景点;公园"，取末段
      const typeTag = (a.type || '').split(';').pop() || '';
      // 图片：有真实图就用，没有就用占位渐变
      const imgHtml = a.photoUrl
        ? `<img class="card-img-real" src="${a.photoUrl}" alt="${a.name}" loading="lazy"
                 onload="this.classList.add('loaded')"
                 onerror="this.style.display='none'">`
        : '';
      return `
        <div class="attraction-card ${selectedIds.has(a.id) ? 'selected' : ''}"
             data-id="${a.id}"
             style="animation-delay: ${i * 0.04}s">
          <div class="card-image ${a.placeholder}">
            ${imgHtml}
            <button class="heart-btn ${a.isFavorite ? 'active' : ''}" data-fav="${a.id}" aria-label="收藏">
              <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
          </div>
          <div class="card-content">
            <div class="card-name">${a.name}</div>
            <div class="card-address">${a.address || ''}</div>
            ${typeTag ? `<div class="card-meta-tags"><span class="meta-tag">${typeTag}</span></div>` : ''}
          </div>
          <div class="check-badge">✓</div>
        </div>
      `;
    }).join('');
  }

  function renderPagination(currentPage, totalPages) {
    if (totalPages <= 1) {
      $('#pagination').innerHTML = '';
      return;
    }
    $('#pagination').innerHTML = `
      <button data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span class="page-info">${currentPage} / ${totalPages}</span>
      <button data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    `;
  }

  function renderPoolCTA(selectedCount) {
    const btn = $('#pool-optimize');
    const info = $('#pool-cta-info');
    info.innerHTML = `已选 <strong>${selectedCount}</strong> 个景点`;
    btn.disabled = selectedCount < 1;
  }

  /**
   * 自定义景点视图：搜索框 + 已添加列表
   */
  function renderCustomPoolView(customAttractions, selectedIds) {
    const grid = $('#attraction-grid');
    grid.className = '';
    $('#pagination').innerHTML = '';
    const list = customAttractions || [];

    grid.innerHTML = `
      <div class="custom-pool-view">
        <div class="custom-search-block">
          <input id="custom-search" class="custom-search-input" type="text"
                 placeholder="搜索任何地点 / 景点 / 地标，例如：埃菲尔铁塔、东京塔"/>
          <div class="custom-search-hint">
            国内景点建议在城市 tab 里挑（数据更全）；这里用来手动加任何高德能搜到的地方，包括国外大城市的知名景点。
          </div>
          <div class="custom-search-dropdown" id="custom-search-dropdown"></div>
        </div>

        <button class="manual-add-prompt" id="open-manual-add" type="button">
          <div class="manual-add-prompt-icon">📍</div>
          <div class="manual-add-prompt-text">
            <div class="manual-add-prompt-title">完全手动添加（高德搜不到的地方）</div>
            <div class="manual-add-prompt-sub">自己输入名字 + 在地图上点击标记位置 — 国外/小众景点用这个</div>
          </div>
          <div class="manual-add-prompt-arrow">›</div>
        </button>

        ${list.length === 0 ? `
          <div class="custom-empty">
            <div class="empty-icon">📍</div>
            <div class="empty-title">还没有自己加的景点</div>
            <div class="empty-sub">用上面任一方式添加进来<br/>添加后会自动选中，参与路线优化</div>
          </div>
        ` : `
          <div class="custom-list-title">已添加（${list.length}）</div>
          <div class="attraction-grid">
            ${list.map((a, i) => {
              const imgHtml = a.photoUrl
                ? `<img class="card-img-real" src="${a.photoUrl}" alt="${a.name}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
                : '';
              return `
                <div class="attraction-card ${selectedIds.has(a.id) ? 'selected' : ''}"
                     data-id="${a.id}"
                     style="animation-delay: ${i * 0.04}s">
                  <div class="card-image ${a.placeholder}">
                    ${imgHtml}
                    <button class="heart-btn ${a.isFavorite ? 'active' : ''}" data-fav="${a.id}" aria-label="收藏">
                      <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <button class="my-place-remove" data-action="remove-mine" data-id="${a.id}" aria-label="从我的景点库移除" title="从我的景点库移除">✕</button>
                  </div>
                  <div class="card-content">
                    <div class="card-name">${a.name}</div>
                    <div class="card-address">${a.address || ''}</div>
                    <div class="card-meta-tags"><span class="meta-tag">自己加的</span></div>
                  </div>
                  <div class="check-badge">✓</div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderCustomSearchDropdown(tips, options = {}) {
    const dd = $('#custom-search-dropdown');
    if (!dd) return;
    if (options.loading) {
      dd.innerHTML = `<div class="ac-loading">搜索中…</div>`;
      dd.classList.add('show');
      return;
    }
    if (!tips || tips.length === 0) {
      dd.innerHTML = `<div class="ac-empty">没找到，换个关键词试试</div>`;
      dd.classList.add('show');
      return;
    }
    dd.innerHTML = tips.slice(0, 10).map((t, i) => `
      <div class="ac-item" data-idx="${i}">
        <div class="ac-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="ac-text">
          <div class="ac-name">${t.name}</div>
          <div class="ac-district">${t.district || t.address || ''}</div>
        </div>
      </div>
    `).join('');
    dd.classList.add('show');
  }

  function hideCustomSearchDropdown() {
    const dd = $('#custom-search-dropdown');
    if (dd) dd.classList.remove('show');
  }

  /* =========================================================
     PAGE 4: 时间轴（多模态路段）
     ========================================================= */
  // 模式图标映射（与 route.js 的 MODES 一致）
  const MODE_META = {
    driving: { icon: '🚗', name: '自驾',  costLabel: '油费' },
    transit: { icon: '🚇', name: '公交',  costLabel: '票价' },
    taxi:    { icon: '🚖', name: '打车',  costLabel: '估算' },
    riding:  { icon: '🚴', name: '骑行',  costLabel: '免费' },
    walking: { icon: '🚶', name: '步行',  costLabel: '免费' }
  };

  function renderTimelinePage(state) {
    const dest = state.trip.destinations.map(d => d.name).join(' · ');
    $('#timeline-route').textContent = `${state.trip.origin || ''} → ${dest}`;

    const tabs = $('#day-tabs');
    tabs.innerHTML = state.itinerary.days.map((d, i) => `
      <button class="day-tab ${i === state.currentDay ? 'active' : ''}" data-day="${i}">
        Day ${i + 1} · ${d.length} 站
      </button>
    `).join('');

    renderDaySummary(state);
    renderTimelineList(state);
  }

  function renderDaySummary(state) {
    const day = state.itinerary.days[state.currentDay];
    const visitSec = day.reduce((s, a) => s + (a.duration || CONFIG.DEFAULT_VISIT_DURATION) * 3600, 0);
    const transitSec = _computeDayTransitSec(state, day);
    const totalSec = visitSec + transitSec;
    const route = day.map(s => s.name).join(' · ');
    $('#day-summary').innerHTML = `
      <div class="summary-meta">DAY ${state.currentDay + 1}</div>
      <div class="summary-route">${route}</div>
      <div class="summary-stats four-cols">
        <div class="stat-block">
          <div class="stat-value">${day.length}</div>
          <div class="stat-label">个景点</div>
        </div>
        <div class="stat-block">
          <div class="stat-value">${_fmtHM(visitSec)}</div>
          <div class="stat-label">游玩</div>
        </div>
        <div class="stat-block">
          <div class="stat-value">${_fmtHM(transitSec)}</div>
          <div class="stat-label">路上</div>
        </div>
        <div class="stat-block">
          <div class="stat-value">${_fmtHM(totalSec)}</div>
          <div class="stat-label">总用时</div>
        </div>
      </div>
    `;
  }

  /** 计算某一天的通勤总时间（秒），优先用用户选的主显方式，没有则用 driving 矩阵 */
  function _computeDayTransitSec(state, day) {
    if (!state.itinerary.matrix) return 0;
    const flat = state.itinerary.flat || [];
    const idxMap = new Map(flat.map((s, i) => [s.id, i]));
    let total = 0;
    for (let i = 0; i < day.length - 1; i++) {
      const segKey = `${day[i].id}->${day[i+1].id}`;
      const userMode = state.segPrimaryMode && state.segPrimaryMode[segKey];
      const cached = userMode && state.segCache && state.segCache[segKey] && state.segCache[segKey][userMode];
      if (cached && !cached.error && cached.time) {
        total += cached.time;
      } else {
        // fallback：driving 矩阵
        const a = idxMap.get(day[i].id);
        const b = idxMap.get(day[i+1].id);
        if (a !== undefined && b !== undefined) {
          total += state.itinerary.matrix.time[a][b] || 0;
        }
      }
    }
    return total;
  }

  /** 秒数 → 'Xh Ym' 形式 */
  function _fmtHM(sec) {
    const m = Math.round(sec / 60);
    if (m < 1) return '0m';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h === 0) return `${mm}m`;
    if (mm === 0) return `${h}h`;
    return `${h}h${mm}m`;
  }

  function renderTimelineList(state) {
    const day = state.itinerary.days[state.currentDay];
    const list = $('#timeline-list');
    list.innerHTML = '';

    const segTimes = _extractDaySegmentTimes(state, day);
    const primaryMode = state.trip.transport === 'public' ? 'transit' : 'driving';

    day.forEach((spot, idx) => {
      // 景点卡片
      const li = document.createElement('li');
      li.className = 'timeline-card';
      li.dataset.spotId = spot.id;
      li.style.animationDelay = `${idx * 0.08}s`;
      const imgHtml = spot.photoUrl
        ? `<img class="card-img-real" src="${spot.photoUrl}" alt="${spot.name}" loading="lazy"
                 style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0"
                 onload="this.classList.add('loaded')"
                 onerror="this.style.display='none'">`
        : '';
      li.innerHTML = `
        <div class="card-image ${spot.placeholder}">
          ${imgHtml}
          <div class="card-step-badge">第 ${idx + 1} 站</div>
          <button class="card-edit-btn" data-action="edit-duration" aria-label="编辑时长">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <div class="card-duration-badge">⏱ ${spot.duration || CONFIG.DEFAULT_VISIT_DURATION}h</div>
          <div class="card-name-overlay">
            <div class="card-name">${spot.name}</div>
            <div class="card-address">${spot.address || ''}</div>
          </div>
        </div>
        <div class="card-body">
          <div class="card-action-row">
            <span>👆</span>
            <span>点击在地图中导航</span>
            <span class="arrow-icon">›</span>
          </div>
        </div>
      `;
      list.appendChild(li);

      // 路段（除最后一个）
      if (idx < day.length - 1) {
        const next = day[idx + 1];
        const t = segTimes[idx];
        const segId = `seg-${spot.id}-${next.id}`;
        const segKey = `${spot.id}->${next.id}`;
        // 当前显示用哪种交通方式（用户在 segPrimaryMode 中保存的偏好；默认按 trip.transport）
        const curMode = (state.segPrimaryMode && state.segPrimaryMode[segKey])
          || (state.trip.transport === 'public' ? 'transit' : 'driving');
        const seg = document.createElement('div');
        seg.className = 'road-segment';
        seg.id = segId;
        seg.dataset.fromId = spot.id;
        seg.dataset.toId = next.id;

        const summaryStr = t
          ? _formatSegSummary(curMode, t.time, t.distance)
          : '<span class="seg-loading">路程数据缺失</span>';

        seg.innerHTML = `
          <div class="segment-summary">
            <div class="road-icon" data-action="toggle">${MODE_META[curMode].icon}</div>
            <div class="seg-info" data-action="toggle">${summaryStr}</div>
            <button class="seg-nav-btn" data-action="navigate" aria-label="导航">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
            </button>
            <div class="seg-toggle" data-action="toggle">
              <span>更多方式</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="segment-modes">
            ${Object.keys(MODE_META).map(m => `
              <div class="mode-row loading ${m === curMode ? 'is-primary' : ''}" data-mode="${m}" data-action="pick-mode">
                <div class="mode-icon">${MODE_META[m].icon}</div>
                <div class="mode-name">${MODE_META[m].name}<span class="mode-pick-mark">已选</span></div>
                <div class="mode-time">--</div>
                <div class="mode-detail">--</div>
                <div class="mode-cost">--</div>
              </div>
            `).join('')}
          </div>
        `;
        list.appendChild(seg);
      }
    });
  }

  /**
   * 把已经加载到的多模态数据填进展开区
   * 同时如果某模式是当前 primary，更新外部摘要
   */
  function renderSegmentModes(segId, modesData, primaryMode) {
    const seg = document.getElementById(segId);
    if (!seg) return;
    Object.keys(MODE_META).forEach(m => {
      const row = seg.querySelector(`.mode-row[data-mode="${m}"]`);
      if (!row) return;
      const data = modesData[m];
      if (!data || data.error) {
        row.classList.add('failed');
        row.classList.remove('loading');
        row.querySelector('.mode-time').textContent = '—';
        row.querySelector('.mode-detail').textContent = data && data.error ? '不可用' : '—';
        row.querySelector('.mode-cost').textContent = '—';
        return;
      }
      row.classList.remove('loading', 'failed');
      const min = Math.round(data.time / 60);
      const h = Math.floor(min / 60);
      const mm = min % 60;
      const timeStr = h > 0 ? `${h}h${mm}m` : `${min}min`;
      row.querySelector('.mode-time').textContent = timeStr;
      const detailEl = row.querySelector('.mode-detail');
      detailEl.textContent = data.detail || '';
      // 公交线路丰富显示时缩字号
      detailEl.classList.toggle('lines-rich', m === 'transit' && (data.detail || '').includes('→'));
      const costEl = row.querySelector('.mode-cost');
      if (data.cost > 0) {
        costEl.textContent = `¥${data.cost}`;
        costEl.classList.remove('free');
      } else {
        costEl.textContent = '免费';
        costEl.classList.add('free');
      }
    });
    // 如果有 primaryMode 且数据可用，同步更新外部摘要
    if (primaryMode && modesData[primaryMode] && !modesData[primaryMode].error) {
      _updateSegmentSummaryUI(seg, primaryMode, modesData[primaryMode]);
    }
  }

  /** 更新路段折叠时显示的摘要 */
  function updateSegmentPrimary(segId, mode, data) {
    const seg = document.getElementById(segId);
    if (!seg) return;
    // 切换 is-primary 高亮
    seg.querySelectorAll('.mode-row').forEach(r => {
      r.classList.toggle('is-primary', r.dataset.mode === mode);
    });
    if (data && !data.error) {
      _updateSegmentSummaryUI(seg, mode, data);
    } else {
      // 数据还没 → 先改图标和名字
      const summary = seg.querySelector('.segment-summary');
      summary.querySelector('.road-icon').textContent = MODE_META[mode].icon;
      summary.querySelector('.seg-info').innerHTML =
        `<span>${MODE_META[mode].name}</span><span class="sep">·</span><span class="seg-loading">数据加载中…</span>`;
    }
  }

  function _updateSegmentSummaryUI(seg, mode, data) {
    const summary = seg.querySelector('.segment-summary');
    if (!summary) return;
    summary.querySelector('.road-icon').textContent = MODE_META[mode].icon;
    summary.querySelector('.seg-info').innerHTML = _formatSegSummary(mode, data.time, data.distance);
  }

  function _formatSegSummary(mode, time, distance) {
    const min = Math.round(time / 60);
    const h = Math.floor(min / 60);
    const mm = min % 60;
    const timeStr = h > 0 ? `${h}h${mm}m` : `${min} min`;
    const distStr = `${(distance / 1000).toFixed(1)} km`;
    return `<span>${MODE_META[mode].name}</span><span class="sep">·</span><span>${timeStr}</span><span class="sep">·</span><span>${distStr}</span>`;
  }

  function _extractDaySegmentTimes(state, day) {
    if (!state.itinerary.matrix) return day.slice(0, -1).map(() => null);
    const { time, dist } = state.itinerary.matrix;
    const flatList = state.itinerary.flat || [];
    const idxMap = new Map(flatList.map((s, i) => [s.id, i]));
    const result = [];
    for (let i = 0; i < day.length - 1; i++) {
      const a = idxMap.get(day[i].id);
      const b = idxMap.get(day[i + 1].id);
      if (a !== undefined && b !== undefined) {
        result.push({ time: time[a][b], distance: dist[a][b] });
      } else {
        result.push(null);
      }
    }
    return result;
  }

  /* =========================================================
     公开接口
     ========================================================= */
  return {
    $, $$,
    showPage, toast,
    showLoading, updateLoading, hideLoading,
    renderOriginCity,
    renderDestinationTags,
    setOnboardingCTAEnabled,
    renderAutoComplete,
    hideAutoComplete,
    renderOriginAutoComplete,
    hideOriginAutoComplete,
    renderSavedTripBanner,
    hideSavedTripBanner,
    renderDateSummary,
    renderTripsList,
    showTripsModal,
    hideTripsModal,
    showEditDurationModal,
    hideEditDurationModal,
    setDurationValue,
    showSaveModal,
    hideSaveModal,
    setPreferenceSelected,
    renderBudget,
    renderPrefsSummary,
    setPrefsCTAEnabled,
    renderCityTabs,
    renderSkeletons,
    renderEmpty,
    renderAttractionGrid,
    renderPagination,
    renderPoolCTA,
    renderCustomPoolView,
    renderCustomSearchDropdown,
    hideCustomSearchDropdown,
    renderTimelinePage,
    renderDaySummary,
    renderTimelineList,
    renderSegmentModes,
    updateSegmentPrimary
  };
})();
