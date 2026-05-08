# 旅行规划 · Travel Planner

苹果美学风格的极简旅行规划网页，基于高德地图 JS API。  
**全国任意城市自由搭配**，多选景点后自动求最优驾驶路线（TSP 算法），按天数智能切分行程。

## ✨ 主要功能

- 🌍 **全国 + 国外（半自动）**：国内用高德 PlaceSearch 自动拉景点；国外/小众景点用"+ 自己加"手动搜索导入（高德 AutoComplete 能搜到的都能加，包括埃菲尔铁塔、东京塔等知名地标）
- 🔍 **目的地搜索**：必须从下拉候选选择，避免输错卡死
- 📍 **多目的地**：标签式输入，一次规划跨城游
- 📅 **日期选择**：用出发/返回日期，自动算出天数
- 🖼 **真实景点配图**：高德 POI 提供的图片自动展示
- ❤️ **景点收藏**:心形按钮存浏览器本地，下次自动置顶
- 🧠 **路径优化**：选好景点后自动求 TSP 最优顺序
- 🗓 **智能分天**：按"每天 ≤ 9 小时"自动切分到多天
- ⏱ **逐景点调时长**：在时间轴点编辑按钮可改任意景点的游玩时长，行程会自动重排
- 🚦 **多种交通方式**：每段路可展开查看自驾/公交/打车/骑行/步行 5 种方式的时间、距离、价格（**像高德的方案一/二/三**）
- 🗺 **地图视图**：折线 + 编号图钉一目了然
- 🚗 **唤起导航**：点击景点卡片直接跳到高德地图 App
- 💾 **多档存档（账号意义上的本地保存）**：每次优化路线会自动存档，最多保留 20 条；首页有"上次的行程"快捷恢复，"还有 N 条…"可看完整列表

## 📂 文件结构

```
travel-planner/
├── index.html              ← 页面骨架
├── css/
│   └── styles.css          ← 所有样式（iOS + 川西色调）
├── js/
│   ├── config.example.js   ← Key 配置模板（提交到 GitHub）
│   ├── config.js           ← 真实 Key（已被 .gitignore 忽略）
│   ├── data.js             ← 高德 POI 搜索 + localStorage 收藏
│   ├── route.js            ← TSP 路径优化算法
│   ├── map.js              ← 地图视图
│   ├── ui.js               ← 页面渲染
│   └── app.js              ← 主入口、状态管理、事件绑定
├── .gitignore
└── README.md
```

## 🚀 本地运行

由于高德 SDK 不允许 `file://` 协议，**不能直接双击 index.html**。

### 用 Python 起服务（推荐）

```bash
cd travel-planner
python -m http.server 8000
```

然后浏览器访问 `http://localhost:8000`。`Ctrl + C` 关闭。

### 用 VS Code Live Server

安装 "Live Server" 插件 → 右键 `index.html` → "Open with Live Server"。

## 🌐 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "init: travel planner"
git branch -M main
git remote add origin https://github.com/YuxuanYangECNU/travel-planner.git
git push -u origin main
```

到 GitHub 仓库 → **Settings → Pages → Source: Deploy from a branch → Branch: main**。

1-2 分钟后访问：`https://yuxuanyangecnu.github.io/travel-planner/`

> ⚠️ `js/config.js` 已被 `.gitignore` 忽略，**不会上传**。
> 部署到 GitHub 后，你需要：把 `config.example.js` 复制为 `config.js` 并填入 Key，**然后单独把 config.js 推上去**（这一次绕过 gitignore）：
> ```bash
> git add -f js/config.js
> git commit -m "add config for github pages"
> git push
> ```

## 🔑 第一次配置 API Key

1. 打开 https://lbs.amap.com/ 注册开发者账号（实名）
2. 创建应用，添加 Key：
   - **服务平台**：`Web端(JS API)`
   - **域名白名单**：`localhost` + `yuxuanyangecnu.github.io`
   - **数字签名**：开启（会生成"安全密钥"）
3. 复制 Key + 安全密钥
4. 把 `js/config.example.js` 复制为 `js/config.js`，填入两个值

## 🛠️ 自定义指南

### 调整每页景点数量
编辑 `js/config.js` 里的 `PAGE_SIZE`（默认 15）。

### 调整每天最大游玩时长
编辑 `js/config.js` 里的 `MAX_HOURS_PER_DAY`（默认 9 小时）。

### 改变默认游玩时长
编辑 `js/config.js` 里的 `DEFAULT_VISIT_DURATION`（默认 2 小时）。
高德 POI 不返回此字段，所有景点统一用此值。

### 修改主题颜色
编辑 `css/styles.css` 顶部 `:root` 里的 CSS 变量。

### 修改景点搜索类型
编辑 `js/data.js` 的 `_initServices` 里 `type` 字段。当前是 `'风景名胜|文化场所|公园广场'`，可以加美食、购物等。

## 🔮 后续可加的功能

下面这些已经留好了接入位，要做时增量改即可：

| 功能 | 改哪里 |
|---|---|
| 接 LLM 改行程（DeepSeek / 智谱） | 加 `js/ai.js`，在 `app.js` 里挂浮动按钮 |
| 编辑景点游玩时长 / 门票 | `ui.js` 的 timeline 卡片加编辑入口 |
| 长按拖拽换顺序 | 引入 SortableJS，挂在 `#timeline-list` 上 |
| 真实景点图片 | `data.js` 拼高德"周边图"接口或对接 Unsplash |
| 火车 / 飞机线路 | 起点的 `transport` 已留字段，加 `route_train.js` |
| 一键生成行程长图 | 用 html2canvas，`app.js` 加分享按钮 |

## 🐛 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 地图区域空白 | 域名白名单没加好，去高德控制台加 `localhost` |
| 景点搜索不出来 | Key 没启用 PlaceSearch 插件 / 安全密钥填错 |
| 控制台报 `INVALID_USER_KEY` | Key 错了或被禁用 |
| 控制台报 `INVALID_USER_SCODE` | 安全密钥填错 |
| 控制台报 `USERKEY_PLAT_NOMATCH` | Key 类型不是 Web端(JS API) |
| 双击文件报错 | 高德拒绝 file://，必须用 http.server |
| 一直转圈 | 看浏览器控制台报错，多半是网络或 Key 问题 |

## 📐 算法说明

### 路径优化（TSP）

景点数 ≤ 10：用 **Held-Karp 动态规划**，时间复杂度 O(N²·2ᴺ)，**保证求得全局最优**。  
景点数 > 10：用 **最近邻贪心 + 2-opt 改进**，结果是次优解但极快。

### 距离矩阵

调用高德 `AMap.Driving.search()` 计算每对景点的真实驾驶时间。N 个景点需要 N(N-1)/2 次请求（对称）：
- 6 个景点 = 15 次
- 8 个景点 = 28 次
- 10 个景点 = 45 次

每次大约 200-500ms，串行执行避免触发频率限制。**全程在高德免费额度内**（5000/天）。

### 多天切分

按"完成成本 = 上一站游玩时长 + 路上时间"贪心累加，超过 9 小时开新一天。
最后如果天数不够用户要求，把最忙的天对半切。

## 📝 License

MIT
