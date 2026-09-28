const userscriptUrl = 'https://github.com/lonewolfyx/github-unlimited-orgs/releases/latest/download/github-unlimited-orgs.user.js'

/** Tampermonkey metadata header injected at the top of the bundle by tsdown. */
export function createUserscriptHeader(version: string): string {
  return `// ==UserScript==
// @name         GitHub Unlimited Orgs
// @namespace    https://github.com/lonewolfyx/github-unlimited-orgs
// @version      ${version}
// @description  Expand all organizations on GitHub profiles with hover cards
// @author       lonewolfyx
// @match        https://github.com/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @connect      github-unlimited-orgs.vercel.app
// @noframes
// @homepageURL  https://github.com/lonewolfyx/github-unlimited-orgs
// @supportURL   https://github.com/lonewolfyx/github-unlimited-orgs/issues
// @updateURL    ${userscriptUrl}
// @downloadURL  ${userscriptUrl}
// ==/UserScript==
`
}
