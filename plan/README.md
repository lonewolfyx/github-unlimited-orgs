# github-unlimited-orgs 制作清单与模块计划

## 一、项目目标

GitHub 用户主页左侧 "Organizations" 区域默认只展示少量组织，其余折叠为 "+X more" 文案，必须跳转到 `?tab=organizations` 才能看到全部。本项目通过浏览器端注入解决：

1. **就地展开全部组织**：点击（或自动）展开 "+X more"，不再跳转
2. **悬停信息卡**：鼠标滑过任意组织头像时，展示 GitHub 风格 tooltip 卡片（avatar / 名称 / 描述 / 主页链接 / join_time）
3. **两种载体**：Chrome 扩展（MV3）+ Tampermonkey 油猴脚本，共用同一套核心逻辑与同一个自建 API

## 二、现状盘点

| 模块 | 状态 | 说明 |
|---|---|---|
| `packages/api` | 基本完成 | Nitro 3，`GET /:username` 返回 `{username, lable, avatar, description, html_url}`；已开 CORS |
| `packages/core` | 缺失（建议新增） | 存放两端共享的类型、API client、DOM 定位、卡片渲染 |
| `packages/chrome-extension` | 空壳 | 仅有 package.json + tsconfig |
| `packages/tampermonkey` | 空壳 | 仅有 package.json + tsconfig |

### API 侧待补任务（M0）

- [ ] 返回 `join_time` 字段：批量并发请求 `GET /orgs/{org}` 组织详情获取（带 GITHUB_TOKEN，控制并发数，失败降级为 null）
- [ ] 生产部署并启用 ISR 缓存（`nitro.config.ts` routeRules 中 6h 缓存已注释待开）
- [ ] `lable` 拼写为已定型字段，保持不变；前端展示以 `username` 为准

## 三、总体架构

```
GitHub 页面（github.com/{username}）
        │  content script / userscript（共用 packages/core）
        ▼
┌────────────────────────────────┐
│ 1. DOM 定位：Organizations 区块  │
│ 2. 就地展开：替换 "+X more"      │
│ 3. 悬停卡片：Shadow DOM 组件     │
└────────────────┬───────────────┘
                 │ fetch GET /{username}（API 已开 CORS）
                 ▼
          packages/api（Nitro）
                 │ Octokit + GITHUB_TOKEN
                 ▼
           GitHub REST API
```

## 四、模块与文档索引

| 文档 | 模块 | 优先级 |
|---|---|---|
| [core.md](./core.md) | `packages/core` 共享核心 | P0（先行） |
| [chrome-extension.md](./chrome-extension.md) | Chrome 扩展 MV3 | P1 |
| [tampermonkey.md](./tampermonkey.md) | 油猴脚本 | P1（与扩展并行） |

> 说明：`packages/core` 是为了消除扩展与油猴两端重复代码而新增的共享包，属于强烈建议项。
> 若坚持只保留两个包，则将 core.md 中的内容分别复制进两个包，代价是双份维护。

## 五、里程碑（按顺序推进，不含时间估计）

- [ ] **M0** API 补全：`join_time`、部署、启用缓存
- [ ] **M1** core 数据层与 DOM 定位：类型、API client、选择器发现
- [ ] **M2** core UI 注入：展开组织列表 + 悬停卡片（Shadow DOM）
- [ ] **M3** chrome-extension：manifest + 构建 + 装配联调
- [ ] **M3**（并行）tampermonkey：userscript 头 + 构建 + 装配联调
- [ ] **M4** 打磨：设置项（API 地址 / 自动展开）、亮暗主题、错误态、发布（Chrome Web Store / GreasyFork）

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| GitHub DOM 改版（React 重构频繁） | 选择器集中在 core 单文件；`href` 匹配优先于文本匹配（规避界面本地化）；MutationObserver 自愈重扫 |
| SPA 软导航后注入丢失 | 探测 `soft-nav:end` / `turbo:load` 事件，URL 变更轮询兜底；导航时销毁重建注入 |
| API 不可用或限流 | 完整保留原生 "+X more" 作降级；卡片错误态提示；客户端 sessionStorage 缓存 30min；服务端 ISR 缓存 |
| 样式互相污染 | 全部注入 UI 置于 Shadow DOM 隔离；颜色取 GitHub CSS 变量 + fallback 值，天然适配亮暗主题 |
| MV3 跨域 fetch | API 已开 CORS 可直连；预留 background service worker 代理路线 |
| 无障碍 | 卡片 `role="tooltip"` + 目标元素 `aria-describedby` |
