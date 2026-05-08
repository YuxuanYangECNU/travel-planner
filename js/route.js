/**
 * route.js
 * 路径优化模块
 *
 * 核心问题：用户挑了 N 个景点，怎么排让总驾驶时间最短？
 * 这是经典的 Traveling Salesman Problem (TSP)
 *
 * 算法选择：
 *   N ≤ 10  → 动态规划（Held-Karp），O(N² · 2ᴺ)，能求最优解
 *   N >  10 → 最近邻贪心 + 2-opt 优化，几乎瞬间出结果（次优解）
 *
 * 距离矩阵来源：高德 AMap.Driving 服务，N×N 个查询
 *   N=8 时大约 56 次请求（不算自身），仍在免费额度内
 */

const Route = (() => {
  /* =========================================================
     步骤 1：构建 N×N 驾驶时间矩阵
     ========================================================= */

  /**
   * 计算所有景点之间的两两驾驶时间
   * @param {Array} points  景点数组，每个对象需有 location: [lng, lat]
   * @param {function(progress)} onProgress  进度回调，参数为 0~1
   * @returns {Promise<{ time: number[][], dist: number[][] }>}
   */
  async function buildDistanceMatrix(points, onProgress) {
    const n = points.length;
    const time = Array.from({ length: n }, () => Array(n).fill(0));
    const dist = Array.from({ length: n }, () => Array(n).fill(0));

    if (!window.AMap) throw new Error('高德 SDK 未加载');
    const driving = new AMap.Driving({
      policy: AMap.DrivingPolicy.LEAST_TIME,
      hideMarkers: true
    });

    // N×N 上三角，对称矩阵省一半请求
    const tasks = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        tasks.push([i, j]);
      }
    }

    let done = 0;
    const total = tasks.length;

    // 串行执行避免触发高德频率限制
    for (const [i, j] of tasks) {
      try {
        const r = await _drivingSearch(driving, points[i].location, points[j].location);
        time[i][j] = time[j][i] = r.time;
        dist[i][j] = dist[j][i] = r.distance;
      } catch (e) {
        console.warn(`[Route] ${points[i].name} → ${points[j].name} 计算失败，使用直线估算`, e);
        const fallback = _haversineEstimate(points[i].location, points[j].location);
        time[i][j] = time[j][i] = fallback.time;
        dist[i][j] = dist[j][i] = fallback.distance;
      }
      done++;
      onProgress && onProgress(done / total);
    }

    return { time, dist };
  }

  function _drivingSearch(driving, from, to) {
    return new Promise((resolve, reject) => {
      driving.search(
        new AMap.LngLat(...from),
        new AMap.LngLat(...to),
        (status, result) => {
          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const r = result.routes[0];
            resolve({ time: r.time, distance: r.distance });
          } else {
            reject(status);
          }
        }
      );
    });
  }

  /**
   * 高德调用失败时的兜底：用 Haversine 距离公式估算
   * 平均时速按 60 km/h 估
   */
  function _haversineEstimate(a, b) {
    const R = 6371;
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const lat1 = a[1] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const x = Math.sin(dLat/2) ** 2 + Math.sin(dLng/2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const km = 2 * R * Math.asin(Math.sqrt(x));
    return {
      distance: km * 1000,
      time: (km / 60) * 3600  // 秒
    };
  }

  /* =========================================================
     步骤 2：TSP 求解
     ========================================================= */

  /**
   * 求解 TSP，返回最优访问顺序
   * @param {number[][]} matrix  时间矩阵 (秒)
   * @param {number} startIdx    起点索引（默认 0）
   * @param {boolean} returnToStart  是否要回到起点（旅行不需要，default false）
   * @returns {number[]}  按访问顺序排列的索引
   */
  function solveTSP(matrix, startIdx = 0, returnToStart = false) {
    const n = matrix.length;
    if (n <= 1) return [0];
    if (n <= 10) {
      return _heldKarp(matrix, startIdx, returnToStart);
    }
    // N>10 时用启发式
    return _nearestNeighborWith2Opt(matrix, startIdx, returnToStart);
  }

  /**
   * Held-Karp 动态规划，O(N²·2ᴺ)
   * 状态：dp[mask][i] = 从 startIdx 出发，经过 mask 中所有点，最后停在 i 的最短时间
   */
  function _heldKarp(matrix, start, returnToStart) {
    const n = matrix.length;
    const N = 1 << n;
    const INF = Infinity;
    const dp = Array.from({ length: N }, () => Array(n).fill(INF));
    const parent = Array.from({ length: N }, () => Array(n).fill(-1));

    dp[1 << start][start] = 0;

    for (let mask = 0; mask < N; mask++) {
      for (let last = 0; last < n; last++) {
        if (!(mask & (1 << last))) continue;
        if (dp[mask][last] === INF) continue;
        for (let next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;
          const newMask = mask | (1 << next);
          const cost = dp[mask][last] + matrix[last][next];
          if (cost < dp[newMask][next]) {
            dp[newMask][next] = cost;
            parent[newMask][next] = last;
          }
        }
      }
    }

    // 找最优终点
    const fullMask = N - 1;
    let bestEnd = -1;
    let bestCost = INF;
    for (let i = 0; i < n; i++) {
      if (i === start) continue;
      const cost = dp[fullMask][i] + (returnToStart ? matrix[i][start] : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestEnd = i;
      }
    }
    if (bestEnd < 0) bestEnd = start; // n=1 边界

    // 回溯路径
    const path = [];
    let cur = bestEnd;
    let mask = fullMask;
    while (cur !== -1) {
      path.push(cur);
      const p = parent[mask][cur];
      mask ^= (1 << cur);
      cur = p;
    }
    return path.reverse();
  }

  /**
   * 启发式：最近邻 + 2-opt 改进
   */
  function _nearestNeighborWith2Opt(matrix, start, returnToStart) {
    const n = matrix.length;
    let order = [start];
    const visited = new Set([start]);
    let cur = start;
    while (visited.size < n) {
      let bestNext = -1;
      let bestT = Infinity;
      for (let i = 0; i < n; i++) {
        if (visited.has(i)) continue;
        if (matrix[cur][i] < bestT) {
          bestT = matrix[cur][i];
          bestNext = i;
        }
      }
      order.push(bestNext);
      visited.add(bestNext);
      cur = bestNext;
    }
    // 2-opt 改进
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < order.length - 2; i++) {
        for (let j = i + 1; j < order.length - 1; j++) {
          const a = order[i - 1], b = order[i];
          const c = order[j], d = order[j + 1];
          const before = matrix[a][b] + matrix[c][d];
          const after  = matrix[a][c] + matrix[b][d];
          if (after + 1e-9 < before) {
            order = [
              ...order.slice(0, i),
              ...order.slice(i, j + 1).reverse(),
              ...order.slice(j + 1)
            ];
            improved = true;
          }
        }
      }
    }
    return order;
  }

  /* =========================================================
     步骤 3：把排好顺序的景点按"每天 ≤ 9 小时"切分到多天
     ========================================================= */

  /**
   * @param {Array} orderedSpots  按 TSP 排好顺序的景点
   * @param {number[][]} timeMatrix  这些景点的时间矩阵（同 order 顺序）
   * @param {number} days  目标天数
   * @returns {Array<Array>}  分好天的二维数组
   */
  function splitIntoDays(orderedSpots, timeMatrix, days) {
    if (days <= 1) return [orderedSpots];

    const n = orderedSpots.length;
    if (n <= days) {
      // 景点比天数还少，每天放一个，剩下天空
      return orderedSpots.map(s => [s]);
    }

    // 计算每相邻景点的"完成成本"= 上一站游玩时长 + 路上时间
    const costs = [];
    for (let i = 0; i < n; i++) {
      const visit = (orderedSpots[i].duration || CONFIG.DEFAULT_VISIT_DURATION) * 3600;
      const drive = i < n - 1 ? timeMatrix[i][i + 1] : 0;
      costs.push(visit + drive);
    }

    // 简单贪心：累加直到超过 day 容量，开新一天
    const cap = CONFIG.MAX_HOURS_PER_DAY * 3600;
    const result = [];
    let cur = [];
    let curCost = 0;

    for (let i = 0; i < n; i++) {
      if (cur.length > 0 && curCost + costs[i] > cap && result.length < days - 1) {
        result.push(cur);
        cur = [];
        curCost = 0;
      }
      cur.push(orderedSpots[i]);
      curCost += costs[i];
    }
    if (cur.length > 0) result.push(cur);

    // 如果分出来的天数少于用户要求的天数，把最忙的一天切开补上
    while (result.length < days) {
      let busiestIdx = 0;
      let maxLen = 0;
      result.forEach((d, i) => {
        if (d.length > maxLen) { maxLen = d.length; busiestIdx = i; }
      });
      if (maxLen <= 1) break; // 没法再切了
      const half = Math.ceil(result[busiestIdx].length / 2);
      const second = result[busiestIdx].splice(half);
      result.splice(busiestIdx + 1, 0, second);
    }

    return result;
  }

  /* =========================================================
     完整流水线（高级 API）
     ========================================================= */

  /**
   * 一站式：景点列表 + 天数 → 分好天的最优行程
   * @param {Array} attractions  景点数组
   * @param {number} days        天数
   * @param {function(stage, progress)} onProgress
   *   stage: 'matrix' | 'tsp' | 'split'
   * @returns {Promise<{ days: Array<Array>, matrix: object, order: number[] }>}
   */
  async function planRoute(attractions, days, onProgress) {
    onProgress && onProgress('matrix', 0);
    const matrix = await buildDistanceMatrix(attractions, p => {
      onProgress && onProgress('matrix', p);
    });

    onProgress && onProgress('tsp', 0);
    const order = solveTSP(matrix.time);
    const orderedSpots = order.map(i => attractions[i]);

    // 重排时间矩阵以匹配新顺序
    const orderedTimeMatrix = order.map((oi, ni) =>
      order.map((oj, nj) => matrix.time[oi][oj])
    );

    onProgress && onProgress('split', 1);
    const dayList = splitIntoDays(orderedSpots, orderedTimeMatrix, days);

    return {
      days: dayList,
      matrix,
      order,
      orderedTimeMatrix
    };
  }

  /* =========================================================
     多模态路段查询（按需）
     用户在时间轴展开路段时调用，懒加载 5 种交通方式
     ========================================================= */

  // 模式定义
  const MODES = [
    { key: 'driving', icon: '🚗', name: '自驾' },
    { key: 'transit', icon: '🚇', name: '公交' },
    { key: 'taxi',    icon: '🚖', name: '打车' },
    { key: 'riding',  icon: '🚴', name: '骑行' },
    { key: 'walking', icon: '🚶', name: '步行' }
  ];

  // 服务实例缓存
  const services = {};

  function _ensure(svc, plugin, opts = {}) {
    if (!services[svc]) services[svc] = new AMap[plugin]({ ...opts, hideMarkers: true });
    return services[svc];
  }

  /**
   * 查询某种方式的单段路径
   * @returns {Promise<{ time, distance, cost?, detail? }>}
   *   time: 秒
   *   distance: 米
   *   cost: 元（可能是估算）
   *   detail: 描述文字
   */
  function getModeRoute(mode, from, to, cityName) {
    return new Promise((resolve, reject) => {
      if (!window.AMap) return reject(new Error('SDK 未加载'));

      const A = new AMap.LngLat(...from);
      const B = new AMap.LngLat(...to);

      switch (mode) {
        case 'driving': {
          const drv = _ensure('driving', 'Driving', { policy: AMap.DrivingPolicy.LEAST_TIME });
          drv.search(A, B, (status, result) => {
            if (status === 'complete' && result.routes && result.routes[0]) {
              const r = result.routes[0];
              const km = r.distance / 1000;
              // 油费估算：7L/100km × 8 元/L
              const fuel = Math.round(km * 0.56);
              resolve({ time: r.time, distance: r.distance, cost: fuel, detail: `${km.toFixed(1)} km` });
            } else { reject(new Error('驾车规划失败')); }
          });
          break;
        }
        case 'taxi': {
          // 打车数据用驾车的距离/时间，价格用估算
          const drv = _ensure('driving', 'Driving', { policy: AMap.DrivingPolicy.LEAST_TIME });
          drv.search(A, B, (status, result) => {
            if (status === 'complete' && result.routes && result.routes[0]) {
              const r = result.routes[0];
              const km = r.distance / 1000;
              const min = r.time / 60;
              // 全国均价估算：起步 13（含 3 km）+ 超出 2.5/km + 0.5/分钟
              const cost = Math.round(13 + Math.max(0, km - 3) * 2.5 + min * 0.5);
              resolve({ time: r.time, distance: r.distance, cost, detail: `${km.toFixed(1)} km` });
            } else { reject(new Error('打车数据失败')); }
          });
          break;
        }
        case 'transit': {
          if (!cityName) return reject(new Error('公交需要城市名'));
          const tr = _ensure('transit', 'Transfer', { city: cityName, policy: AMap.TransferPolicy.LEAST_TIME });
          tr.policy = AMap.TransferPolicy.LEAST_TIME;
          tr.setCity(cityName);
          tr.search(A, B, (status, result) => {
            if (status === 'complete' && result.plans && result.plans[0]) {
              const p = result.plans[0];
              const segs = p.segments || [];
              // 解析具体线路：地铁号 / 公交号
              const lines = [];
              segs.forEach(s => {
                if (s.transit_mode === 'SUBWAY' && s.subway) {
                  lines.push('🚇 ' + (s.subway.name || '地铁'));
                } else if (s.transit_mode === 'BUS' && s.bus && s.bus.lines && s.bus.lines[0]) {
                  lines.push('🚌 ' + (s.bus.lines[0].name || '公交'));
                } else if (s.transit_mode === 'RAILWAY' && s.railway) {
                  lines.push('🚆 ' + (s.railway.name || '火车'));
                }
              });
              const transferCount = lines.length > 1 ? lines.length - 1 : 0;
              const detail = lines.length > 0
                ? lines.join(' → ')
                : ((p.segments || []).length > 0 ? '步行可达' : '直达');
              resolve({
                time: p.time,
                distance: p.distance,
                cost: Math.round(p.cost || 0),
                detail,
                lines,
                transferCount
              });
            } else { reject(new Error('公交规划失败')); }
          });
          break;
        }
        case 'riding': {
          const rd = _ensure('riding', 'Riding', { policy: 0 });
          rd.search(A, B, (status, result) => {
            if (status === 'complete' && result.routes && result.routes[0]) {
              const r = result.routes[0];
              resolve({ time: r.time, distance: r.distance, cost: 0, detail: `${(r.distance/1000).toFixed(1)} km` });
            } else { reject(new Error('骑行规划失败')); }
          });
          break;
        }
        case 'walking': {
          const wk = _ensure('walking', 'Walking', {});
          wk.search(A, B, (status, result) => {
            if (status === 'complete' && result.routes && result.routes[0]) {
              const r = result.routes[0];
              resolve({ time: r.time, distance: r.distance, cost: 0, detail: `${(r.distance/1000).toFixed(1)} km` });
            } else { reject(new Error('步行规划失败')); }
          });
          break;
        }
        default:
          reject(new Error('未知模式：' + mode));
      }
    });
  }

  /**
   * 一次性查询某段路的所有 5 种方式
   * 失败的方式返回 { error }
   */
  async function getAllModes(from, to, cityName) {
    const results = {};
    await Promise.all(MODES.map(async m => {
      try {
        results[m.key] = await getModeRoute(m.key, from, to, cityName);
      } catch (e) {
        results[m.key] = { error: e.message || String(e) };
      }
    }));
    return results;
  }

  /* =========================================================
     公开接口
     ========================================================= */
  return {
    planRoute,
    buildDistanceMatrix,
    solveTSP,
    splitIntoDays,
    getModeRoute,
    getAllModes,
    MODES
  };
})();
