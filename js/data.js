/**
 * data.js
 * 数据层：高德 POI 搜索 + 自动补全 + 浏览器本地收藏夹
 */

const Data = (() => {
  /* =========================================================
     我的景点库（持久化的自定义景点 - 跨行程保留）
     ========================================================= */
  const MY_PLACES_KEY = 'travel-planner:my-places';
  function getMyPlaces() {
    try {
      const raw = localStorage.getItem(MY_PLACES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function addMyPlace(att) {
    const list = getMyPlaces();
    if (list.some(a => a.id === att.id || a.name === att.name)) return false;
    list.unshift(att);
    if (list.length > 100) list.length = 100;
    localStorage.setItem(MY_PLACES_KEY, JSON.stringify(list));
    return true;
  }
  function removeMyPlace(id) {
    const list = getMyPlaces().filter(a => a.id !== id);
    localStorage.setItem(MY_PLACES_KEY, JSON.stringify(list));
  }

  /* =========================================================
     收藏夹（localStorage）
     ========================================================= */
  const FAV_KEY = 'travel-planner:favorites';
  const TRIPS_KEY = 'travel-planner:trips';

  /* =========================================================
     已保存行程（多档存档，相当于本地"账号")
     ========================================================= */
  function getSavedTrips() {
    try {
      const raw = localStorage.getItem(TRIPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function getLatestTrip() {
    const list = getSavedTrips();
    return list.length > 0 ? list[0] : null;
  }
  function saveTrip(snapshot, options = {}) {
    try {
      const list = getSavedTrips();
      const dest = (snapshot.trip.destinations || []).map(d => d.name).join(' · ');
      const days = (snapshot.itinerary && snapshot.itinerary.days) ? snapshot.itinerary.days.length : 0;
      const autoTitle = `${snapshot.trip.origin || '?'} → ${dest || '?'}${days ? ` (${days}天)` : ''}`;
      // 同 origin+destinations 的旧记录覆盖
      const dupIdx = list.findIndex(t =>
        t.snapshot.trip.origin === snapshot.trip.origin &&
        JSON.stringify((t.snapshot.trip.destinations || []).map(d=>d.name).sort()) ===
        JSON.stringify((snapshot.trip.destinations || []).map(d=>d.name).sort())
      );
      // 保留旧记录的 favorite/title（除非新指定了）
      const oldRecord = dupIdx >= 0 ? list[dupIdx] : null;
      const trip = {
        id: oldRecord ? oldRecord.id : ('trip-' + Date.now()),
        title: options.title || (oldRecord && oldRecord.title) || autoTitle,
        favorite: options.favorite !== undefined ? options.favorite : (oldRecord ? !!oldRecord.favorite : false),
        savedAt: new Date().toISOString(),
        snapshot
      };
      if (dupIdx >= 0) list.splice(dupIdx, 1);
      // 收藏的优先放最前
      if (trip.favorite) list.unshift(trip);
      else {
        // 找到第一个非收藏的位置插入
        const firstNonFav = list.findIndex(t => !t.favorite);
        if (firstNonFav < 0) list.push(trip);
        else list.splice(firstNonFav, 0, trip);
      }
      if (list.length > 30) list.length = 30;
      localStorage.setItem(TRIPS_KEY, JSON.stringify(list));
      return trip;
    } catch (e) {
      console.warn('[Data] 保存行程失败', e);
      return null;
    }
  }
  function toggleTripFavorite(tripId) {
    const list = getSavedTrips();
    const t = list.find(x => x.id === tripId);
    if (!t) return false;
    t.favorite = !t.favorite;
    // 重新排序：收藏的在前
    list.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return new Date(b.savedAt) - new Date(a.savedAt);
    });
    localStorage.setItem(TRIPS_KEY, JSON.stringify(list));
    return t.favorite;
  }
  function deleteTrip(tripId) {
    const list = getSavedTrips().filter(t => t.id !== tripId);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(list));
  }
  function clearAllTrips() {
    localStorage.removeItem(TRIPS_KEY);
  }

  function getFavorites() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[Data] 收藏夹解析失败', e);
      return [];
    }
  }

  function isFavorite(id) {
    return getFavorites().some(f => f.id === id);
  }

  function toggleFavorite(attraction) {
    const list = getFavorites();
    const idx = list.findIndex(f => f.id === attraction.id);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift(attraction);
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
    return idx < 0;
  }

  /* =========================================================
     高德服务实例（懒加载）
     ========================================================= */
  let placeSearch = null;
  let geocoder = null;
  let autoComplete = null;
  let districtSearch = null;

  function _initServices() {
    if (!window.AMap) throw new Error('高德 SDK 未加载');
    if (!placeSearch) {
      placeSearch = new AMap.PlaceSearch({
        type: '风景名胜|文化场所|公园广场',
        pageSize: CONFIG.PAGE_SIZE,
        pageIndex: 1,
        extensions: 'all'   // ★ 改为 all 才会返回 photos[] 等详细字段
      });
    }
    if (!geocoder)     geocoder     = new AMap.Geocoder({});
    if (!autoComplete) autoComplete = new AMap.AutoComplete({});
    if (!districtSearch && AMap.DistrictSearch) {
      districtSearch = new AMap.DistrictSearch({
        level: 'province',  // 从省级开始向下搜
        subdistrict: 0,     // 不返回下级行政区
        extensions: 'base'
      });
    }
  }

  /* =========================================================
     地点自动补全（用于目的地搜索框）
     先查 DistrictSearch（行政区），再查 AutoComplete（POI），合并去重
     行政区结果 isCity=true，会在 UI 中置顶 + 显示 🏙 图标
     如果 options.cityOnly = true，则只返回行政区结果
     ========================================================= */
  function searchAutoComplete(keyword, options = {}) {
    return new Promise((resolve, reject) => {
      _initServices();
      const cityOnly = options.cityOnly === true;
      Promise.all([
        _searchDistricts(keyword),
        cityOnly ? Promise.resolve([]) : _searchPOITips(keyword)
      ]).then(([districts, pois]) => {
        // 合并：行政区在前，POI 在后；按名字去重
        const seen = new Set();
        const merged = [];
        districts.forEach(d => {
          if (!seen.has(d.name)) { seen.add(d.name); merged.push(d); }
        });
        pois.forEach(p => {
          if (!seen.has(p.name)) { seen.add(p.name); merged.push(p); }
        });
        resolve(merged);
      }).catch(reject);
    });
  }

  function _searchPOITips(keyword) {
    return new Promise(resolve => {
      try {
        autoComplete.search(keyword, (status, result) => {
          if (status === 'complete' && result.tips) {
            resolve(result.tips
              .filter(t => t.name && t.id)
              .map(t => ({
                name: t.name,
                district: t.district || '',
                adcode: t.adcode || '',
                address: t.address || '',
                location: t.location ? [t.location.lng, t.location.lat] : null,
                id: t.id,
                isCity: false
              }))
            );
          } else {
            resolve([]);
          }
        });
      } catch (e) { resolve([]); }
    });
  }

  function _searchDistricts(keyword) {
    return new Promise(resolve => {
      // 总是同时跑 DistrictSearch + Geocoder，合并结果
      Promise.all([
        _districtSearchOnly(keyword),
        _geocodeAsCity(keyword)
      ]).then(([districts, geocoded]) => {
        const seen = new Set();
        const merged = [];
        // 城市/区县 优先
        districts.forEach(d => {
          if (!seen.has(d.name)) { seen.add(d.name); merged.push(d); }
        });
        // Geocoder 结果（国外城市等）
        geocoded.forEach(g => {
          if (!seen.has(g.name)) { seen.add(g.name); merged.push(g); }
        });
        resolve(merged);
      }).catch(() => resolve([]));
    });
  }

  function _districtSearchOnly(keyword) {
    return new Promise(resolve => {
      if (!districtSearch) { resolve([]); return; }
      try {
        districtSearch.search(keyword, (status, result) => {
          if (status === 'complete' && result.districtList) {
            resolve(result.districtList
              // 排除根节点（中华人民共和国）
              .filter(d => d.adcode && d.adcode !== '100000' && d.name)
              // ⚠ 排除"街道"级（这是镇/街道，不是城市）
              .filter(d => d.level !== 'street')
              .map(d => ({
                name: d.name,
                district: _districtLevelLabel(d.level),
                adcode: d.adcode,
                address: '',
                location: d.center ? [d.center.lng, d.center.lat] : null,
                id: 'district-' + d.adcode,
                isCity: true,
                level: d.level || ''
              }))
            );
          } else {
            resolve([]);
          }
        });
      } catch (e) { resolve([]); }
    });
  }

  function _geocodeAsCity(keyword) {
    if (!keyword || keyword.length < 2) return Promise.resolve([]);
    return new Promise(resolve => {
      if (!geocoder) { resolve([]); return; }
      try {
        geocoder.getLocation(keyword, (status, result) => {
          if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
            resolve(result.geocodes.slice(0, 3).map((g, i) => ({
              name: g.formattedAddress || keyword,
              district: g.country || g.province || g.city || '搜索结果',
              adcode: g.adcode || '',
              address: '',
              location: g.location ? [g.location.lng, g.location.lat] : null,
              id: 'geo-' + (g.adcode || keyword) + '-' + i,
              isCity: true,
              level: g.level || 'overseas'
            })));
          } else {
            resolve([]);
          }
        });
      } catch (e) { resolve([]); }
    });
  }

  function _districtLevelLabel(level) {
    const map = { country: '国家', province: '省/直辖市', city: '地级市', district: '区/县', street: '街道' };
    return map[level] || '行政区';
  }

  /* =========================================================
     城市地理编码（用户没选下拉项时的兜底）
     ========================================================= */
  function geocodeCity(cityName) {
    return new Promise((resolve, reject) => {
      _initServices();
      geocoder.getLocation(cityName, (status, result) => {
        if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
          const g = result.geocodes[0];
          resolve({
            name: cityName,
            location: [g.location.lng, g.location.lat],
            adcode: g.adcode,
            formatted: g.formattedAddress
          });
        } else {
          reject(new Error(`找不到地点"${cityName}"`));
        }
      });
    });
  }

  /**
   * 反向地理编码：经纬度 → 地址
   * 用于地图点选时自动填充地址栏
   */
  function reverseGeocode(lnglat) {
    return new Promise((resolve, reject) => {
      _initServices();
      if (!geocoder) return reject(new Error('Geocoder 未初始化'));
      geocoder.getAddress(lnglat, (status, result) => {
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '');
        } else {
          reject(new Error('反向解析失败'));
        }
      });
    });
  }

  /* =========================================================
     景点搜索（高德 POI）
     ========================================================= */
  function searchAttractions(city, page = 1, keyword = '景点') {
    return new Promise((resolve, reject) => {
      _initServices();
      placeSearch.setPageIndex(page);
      placeSearch.setCity(city);
      placeSearch.search(keyword || '景点', (status, result) => {
        if (status === 'complete' && result.poiList) {
          const attractions = result.poiList.pois
            .filter(p => p.location)
            .map(_normalizePOI);
          resolve({
            attractions,
            total: result.poiList.count,
            page: result.poiList.pageIndex
          });
        } else if (status === 'no_data') {
          resolve({ attractions: [], total: 0, page });
        } else {
          reject(new Error('景点搜索失败：' + (result || status)));
        }
      });
    });
  }

  /**
   * 归一化 POI（extensions=all 时高德返回更多字段）
   */
  function _normalizePOI(poi) {
    let photoUrl = null;
    if (Array.isArray(poi.photos) && poi.photos.length > 0) {
      // 高德图片可能返回 http://，强制升级 https 避免混合内容警告
      photoUrl = String(poi.photos[0].url || '').replace(/^http:\/\//, 'https://');
    }
    return {
      id: poi.id,
      name: poi.name,
      location: [poi.location.lng, poi.location.lat],
      address: poi.address || `${poi.pname || ''}${poi.cityname || ''}${poi.adname || ''}`,
      type: poi.type || '',
      city: poi.cityname || '',
      tel: poi.tel || '',
      photoUrl,
      duration: CONFIG.DEFAULT_VISIT_DURATION,
      placeholder: _pickPlaceholder(poi.type, poi.name),
      isFavorite: isFavorite(poi.id)
    };
  }

  function _pickPlaceholder(type = '', name = '') {
    const text = (type + name).toLowerCase();
    if (/雪山|冰川|高原|海拔/.test(text))                return 'placeholder-snow';
    if (/温泉|沙漠|火山|戈壁/.test(text))                return 'placeholder-warm';
    if (/森林|公园|植物|生态|湿地/.test(text))           return 'placeholder-forest';
    if (/湖|海|河|江|水库|瀑布|溪/.test(text))           return 'placeholder-water';
    if (/夜|night|酒吧|演出|秀/.test(text))             return 'placeholder-night';
    if (/寺|庙|塔|教堂|清真|博物馆|纪念/.test(text))     return 'placeholder-temple';
    return 'placeholder-default';
  }

  /* =========================================================
     公开接口
     ========================================================= */
  return {
    geocodeCity,
    reverseGeocode,
    searchAttractions,
    searchAutoComplete,
    getFavorites,
    isFavorite,
    toggleFavorite,
    getMyPlaces,
    addMyPlace,
    removeMyPlace,
    getSavedTrips,
    getLatestTrip,
    saveTrip,
    toggleTripFavorite,
    deleteTrip,
    clearAllTrips,
    _normalizePOI
  };
})();
