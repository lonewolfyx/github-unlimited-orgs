# packages/core —— 共享核心模块

## 职责边界

不感知"扩展 vs 油猴"的宿主差异，只负责三件事：**取数、定位 DOM、注入 UI**。
宿主包（chrome-extension / tampermonkey）只做生命周期装配。

## 目录规划

```
packages/core/src/
  types.ts          # OrgInfo 等类型定义
  api.ts            # fetchOrgs() + sessionStorage 缓存
  dom/discover.ts   # 定位 Organizations 区块与 "+X more" 链接（所有选择器集中于此）
  dom/org-list.ts   # 就地展开全部组织头像
  dom/hover-card.ts # 悬停信息卡（Shadow DOM）
  styles.ts         # 卡片/列表样式（注入 Shadow Root）
  enhance.ts        # enhanceOrganizations({ apiBase }) 总入口
```

依赖约定：**零运行时依赖**（vanilla TS），保证油猴产物足够小。两端通过
`"@github-unlimited-orgs/core": "workspace:*"` 引用。

## 任务清单

### M1-a 类型与数据层

- [ ] `types.ts`：`OrgInfo { username, lable, avatar, description, html_url, join_time? }`，与 API 响应字段一一对应
- [ ] `api.ts`：`fetchOrgs(username, apiBase)`
  - 超时 10s（AbortController）
  - 错误分类：网络错误 / 4xx / 429 限流 / 5xx
  - sessionStorage 缓存，key 为 `guo:orgs:{username}`，TTL 30min
- [ ] （可选）vitest + happy-dom 单元测试

### M1-b DOM 发现（dom/discover.ts）

- [ ] 从 URL 解析当前 profile 用户名：一级路径段，排除保留前缀（settings/orgs/notifications/marketplace/explore/search 等）
- [ ] 定位策略（按优先级）：
  1. `a[href$="?tab=organizations"]` 且 href 以当前用户名开头、文本匹配 `/^\+\d+\s*more$/u`（不依赖文案，规避本地化）
  2. 回退：查找标题文本为 "Organizations" 的 h2/h3，向上取 section 容器
- [ ] 注入前提是"找到了区块"，天然避免在 org 主页等无关页面误注入
- [ ] `MutationObserver` 自愈：React 重渲染导致节点丢失后自动重扫重建

### M2 UI 注入

- [ ] `org-list.ts`：展开交互
  - 点击 "+X more" → 拦截跳转，原位追加剩余组织头像（沿用 GitHub 头像尺寸与间距），原链接隐藏
  - 再次点击收起；Ctrl/Cmd+点击 强制保留原生跳转
  - 设置项预留：自动展开（宿主通过 options 传入）
- [ ] `hover-card.ts`：信息卡
  - 内容：avatar(64px) + label/username + description + join_time + "View organization" 链接
  - 定位：目标元素下方展示，视口边界自动翻转（flip）与收拢（clamp）
  - 交互：hover 150ms 延迟出现、150ms 缓冲消失，鼠标可移入卡片
  - 已存在的 GitHub 原生头像保留原生 hovercard；新注入头像统一用自研卡片（是否全量接管留到 M4 决策）
- [ ] `styles.ts`：样式全部限定在 Shadow Root 内
  - 颜色使用 GitHub CSS 变量（`--bgColor-default`、`--fgColor-default` 等）+ fallback 值，自动适配亮暗主题
- [ ] 无障碍：卡片 `role="tooltip"`，头像 `aria-describedby` 指向卡片

### 宿主适配接口

- [ ] `enhance.ts` 仅导出：
  - `enhanceOrganizations(options: { apiBase: string; autoExpand?: boolean }): () => void`
  - 返回清理函数，宿主在导航/卸载时调用

## 设计约定

- 不修改 GitHub 既有节点的属性与子节点，只做**插入兄弟节点 + 隐藏原链接**，保证可随时无损降级
- 所有 CSS 选择器、正则、URL 模式集中在 `dom/discover.ts` 顶部常量区，改版时只动一个文件
- 任何 UI 渲染失败都 catch 并静默降级，绝不抛错影响 GitHub 页面本身
