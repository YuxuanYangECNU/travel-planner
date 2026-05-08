/**
 * map.js
 * 地图视图：显示行程的景点 + 路线 polyline
 */

const MapView = (() => {
  let amap = null;

  function ensureMap(containerId, center) {
    if (!amap) {
      amap = new AMap.Map(containerId, {
        zoom: 8,
        center: center || [104.06, 30.67],
        mapStyle: 'amap://styles/whitesmoke',  // 苹果风浅色
        features: ['bg', 'road', 'building']
      });
    }
    return amap;
  }

  function clear() {
    if (amap) amap.clearMap();
  }

  /**
   * 在地图上画一天的行程
   * @param {Array} day  当天景点数组（按访问顺序）
   */
  function drawDay(day) {
    if (!amap || day.length === 0) return;
    clear();

    // 1) 自定义图钉
    day.forEach((spot, idx) => {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.textContent = idx + 1;
      const marker = new AMap.Marker({
        position: spot.location,
        content: el,
        offset: new AMap.Pixel(-15, -15),
        title: spot.name,
        map: amap
      });
      marker.on('click', () => {
        new AMap.InfoWindow({
          content: `
            <div style="padding:6px 10px; font-family: -apple-system, sans-serif; min-width: 140px;">
              <div style="font-weight:700; font-size:15px; color:#1C1E21;">${spot.name}</div>
              <div style="font-size:12px; color:#888; margin-top:4px;">${spot.address || ''}</div>
            </div>
          `,
          offset: new AMap.Pixel(0, -16)
        }).open(amap, spot.location);
      });
    });

    // 2) 折线连接
    if (day.length >= 2) {
      new AMap.Polyline({
        path: day.map(s => s.location),
        strokeColor: '#C73E1D',
        strokeWeight: 4,
        strokeStyle: 'solid',
        strokeOpacity: 0.85,
        lineJoin: 'round',
        showDir: true,
        map: amap
      });
    }

    // 3) 自适应视野
    amap.setFitView(null, false, [60, 60, 60, 60]);
  }

  /**
   * 多天行程总览：用不同颜色画每一天
   */
  function drawAllDays(days) {
    if (!amap) return;
    clear();
    const palette = ['#C73E1D', '#4A90E2', '#2D5F3E', '#E8B86A', '#6E5798', '#2C5F8D'];

    days.forEach((day, dayIdx) => {
      const color = palette[dayIdx % palette.length];
      day.forEach((spot, idx) => {
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.borderColor = color;
        el.style.color = color;
        el.textContent = idx + 1;
        new AMap.Marker({
          position: spot.location,
          content: el,
          offset: new AMap.Pixel(-15, -15),
          title: `Day ${dayIdx + 1} · ${spot.name}`,
          map: amap
        });
      });
      if (day.length >= 2) {
        new AMap.Polyline({
          path: day.map(s => s.location),
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.85,
          lineJoin: 'round',
          showDir: true,
          map: amap
        });
      }
    });

    amap.setFitView(null, false, [60, 60, 60, 60]);
  }

  function destroy() {
    if (amap) {
      amap.destroy();
      amap = null;
    }
  }

  return {
    ensureMap,
    clear,
    drawDay,
    drawAllDays,
    destroy
  };
})();
