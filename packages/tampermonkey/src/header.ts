/**
 * Tampermonkey 元数据头，构建时由 tsdown 以 banner 注入产物顶部。
 * 发布后需补充 @downloadURL / @updateURL 并保证版本号严格递增。
 */
export const userscriptHeader = `// ==UserScript==
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
// ==/UserScript==
`
