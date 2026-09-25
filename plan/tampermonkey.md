# packages/tampermonkey —— 油猴脚本

## 技术选型

- tsdown 打包为单文件 IIFE，产物 `dist/github-unlimited-orgs.user.js`
- userscript 元数据头由构建时以 banner 注入，不在源码里写死
- `@grant none`：API 已开 CORS，页面上下文直连即可
  （若未来需要绕过 CORS，升级为 `GM_xmlhttpRequest` + `@connect <API 域名>`，core 数据层做注入式适配）

## userscript 元数据头草案

```
// ==UserScript==
// @name         GitHub Unlimited Orgs
// @namespace    https://github.com/lonewolfyx/github-unlimited-orgs
// @version      0.1.0
// @description  Expand all organizations on GitHub profiles with hover cards
// @author       lonewolfyx
// @match        https://github.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @homepageURL  https://github.com/lonewolfyx/github-unlimited-orgs
// @supportURL   https://github.com/lonewolfyx/github-unlimited-orgs/issues
// @downloadURL  <发布后填写 raw 或 GreasyFork 地址>
// @updateURL    <发布后填写>
// ==/UserScript==
```

## 目录规划

```
packages/tampermonkey/
  src/
    header.ts           # 元数据头字符串（tsdown banner 引用）
    main.ts             # 与扩展 content.ts 同构：导航监听 + 装配 core
  tsdown.config.ts
  dist/github-unlimited-orgs.user.js
```

## 任务清单

### M3 主体

- [ ] 包初始化：添加 core workspace 依赖；`tsdown.config.ts`：
  - `format: 'iife'`、`outExtensions` 输出 `.user.js`
  - `banner: header` 注入元数据头
  - package.json 增加 `"build"`、`"dev": "tsdown --watch"`；根目录补 `"build:tm"`
- [ ] `main.ts`：
  - 调用 `enhanceOrganizations({ apiBase })`
  - 软导航处理与扩展版同构（`soft-nav:end` 探测 + URL 兜底）
- [ ] 本地开发方式（二选一）：
  1. Tampermonkey 设置开启"允许访问文件网址"，`@require file:///.../dist/github-unlimited-orgs.user.js`
  2. 直接把 dist 产物拖入 Tampermonkey 安装，改完重新构建 + 刷新页面
- [ ] 联调与降级验证：同 chrome-extension.md 的联调步骤

### M4 打磨与发布

- [ ] 设置入口：`GM_registerMenuCommand` 注册"API 地址 / 自动展开"菜单，存 `GM_setValue`
  （若保持 `@grant none` 则退化为 localStorage，二选一在实现时定）
- [ ] 发布：GreasyFork 或 GitHub raw 链接
  - `@downloadURL` / `@updateURL` 指向发布地址
  - 版本号严格递增以触发用户自动更新
- [ ] GreasyFork 语法检查通过

## 验收标准

- [ ] 与 chrome-extension.md 的验收标准一致
- [ ] 产物为单文件且体积 < 20KB
- [ ] `@noframes` 生效（iframe 中不重复注入）
- [ ] 与 Chrome 扩展同时安装时行为一致、互不冲突
