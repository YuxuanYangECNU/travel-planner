/**
 * 配置模板 —— 复制本文件为 config.js 并填入你自己的 Key
 *
 * 高德开放平台：https://lbs.amap.com/
 * 1. 注册开发者账号
 * 2. 创建应用，添加 Web端(JS API) 类型的 Key
 * 3. 域名白名单填：localhost  +  你的GitHub用户名.github.io
 * 4. 复制 Key 和 安全密钥 到下面
 */
const CONFIG = {
  AMAP_KEY: "YOUR_AMAP_KEY_HERE",        // Key（公钥）
  AMAP_SECRET: "YOUR_AMAP_SECRET_HERE",  // 安全密钥
  
  // 景点池每页显示数量
  PAGE_SIZE: 15,
  
  // 一天最多游玩小时数（含路上时间）
  MAX_HOURS_PER_DAY: 9,
  
  // 默认游玩时长（小时）—— 高德 PlaceSearch 不返回此字段
  DEFAULT_VISIT_DURATION: 2,
};
