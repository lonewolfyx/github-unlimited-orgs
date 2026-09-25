# packages/chrome-extension —— Chrome 扩展（MV3）

## 技术选型

- MV3，MVP 仅 content script（无 background、无 popup，M4 再补设置 UI）
- 构建：tsdown（单入口 IIFE）+ 构建后复制 manifest 到 dist；`--watch` 模式开发
- 数据与 UI 全部来自 `@github-unlimited-orgs/core`（workspace:*）

## 目录规划

```
packages/chrome-extension/
  src/
    manifest.json
    content.ts          # 调 core 的 enhanceOrganizations()，监听导航清理重建
    background.ts       # （可选，M4）API 代理路线，规避 CORS
  tsdown.config.ts
  dist/                 # 构建产物：chrome://extensions 加载或打包 zip 发布
```

## manifest 草案

```json
{
  "manifest_version": 3,
  "name": "GitHub Unlimited Orgs",
  "version": "0.1.0",
  "description": "Expand all organizations on GitHub profiles with hover cards.",
  "content_scripts": [
    {
      "matches": ["https://github.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "permissions": ["storage"],
  "host_permissions": [
    "https://<API 部署域名>/*",
    "http://localhost:3000/*"
  ]
}
```

要点：
- github.com 页面直连自有 API 依赖其 CORS（已在 `nitro.config.ts` 开启），无需额外权限
- `host_permissions` 声明 API 域名，用于读取响应头及未来 background 代理路线
- 默认 API 地址以常量写入 `content.ts`，M4 用 `chrome.storage.sync` 覆盖

## 任务清单

### M3 主体

- [ ] 包初始化：添加 core workspace 依赖；`tsdown.config.ts`（iife、单入口）；package.json 增加
  `"build": "tsdown && cp src/manifest.json dist/"`、`"dev": "tsdown --watch"`；
  根目录补 `"build:ext"` 代理脚本
- [ ] `content.ts`：
  - 调用 `enhanceOrganizations({ apiBase })`
  - 软导航处理：优先监听 GitHub 的 `soft-nav:end`（探测 `document` 支持性），兜底 URL 变更轮询；导航时调用清理函数后重建
- [ ] 本地联调：`pnpm server:dev` 启动 API（:3000）+ chrome://extensions 加载 dist（load unpacked），
  验证展开列表、悬停卡片、亮暗主题、多用户主页切换
- [ ] 降级验证：停掉 API 后原生 "+X more" 仍可正常跳转，无控制台报错

### M4 打磨与发布

- [ ] popup/options 设置页：API 地址、自动展开开关（chrome.storage.sync）
- [ ] （可选）background 代理：content 发消息 → service worker fetch，彻底规避 CORS
- [ ] 版本号管理 + zip 打包脚本
- [ ] 发布：Chrome Web Store 开发者账号（$5 一次性费用），提交审核

## 验收标准

- [ ] `github.com/{username}` 页面 Organizations 区块 "+X more" 点击后原位展开全部组织
- [ ] 悬停任意注入头像约 150ms 后出现信息卡，含 avatar / label / description / join_time / 链接
- [ ] 亮色、暗色主题显示均正常
- [ ] API 不可用时页面功能不受影响（无损降级）
- [ ] 个人主页与组织主页互切、连续切换多个用户主页时注入状态正确重建
