/**
 * Tampermonkey metadata header, injected at the top of the bundle by tsdown as a banner.
 * After publishing, add @downloadURL / @updateURL and keep the version strictly increasing.
 */
export const userscriptHeader = `// ==UserScript==
// @name         GitHub Unlimited Orgs
// @namespace    https://github.com/lonewolfyx/github-unlimited-orgs
// @version      0.2.0
// @description  Expand all organizations on GitHub profiles with hover cards
// @author       lonewolfyx
// @match        https://github.com/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @noframes
// @homepageURL  https://github.com/lonewolfyx/github-unlimited-orgs
// @supportURL   https://github.com/lonewolfyx/github-unlimited-orgs/issues
// ==/UserScript==
`
