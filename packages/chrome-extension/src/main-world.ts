/**
 * MAIN world 注入脚本（document_start，先于页面脚本注册补丁）。
 *
 * GitHub 登录态会在浏览用户主页时请求右侧面板数据 "/_side-panels/user.json"，
 * 响应中 userStatus.organizationOptions 携带该用户的完整组织列表。
 * 匿名访问时 GitHub 不发起该请求，因此以此作为登录场景的数据源。
 *
 * 职责：
 * 1. patch window.fetch 拦截该响应（clone 后读取，不影响页面自身消费），
 *    缓存最近一份数据并 postMessage 转发给 isolated world 的 content script；
 * 2. 该请求可能早于 content script 注入（页面加载早期），转发无人接收会丢，
 *    因此同时缓存数据 —— content script 就绪后会发 "guo:panel-request" 消息，
 *    这里把缓存回放给它，保证"页面一访问就劫持到的数据"绝不丢失。
 */

const PANEL_URL_RE = /\/_side-panels\/user\.json(?:[?#]|$)/
const PANEL_MESSAGE_TYPE = 'guo:side-panel'
const PANEL_REQUEST_TYPE = 'guo:panel-request'

/** 最近一次劫持到的 side-panel JSON（回放用） */
let lastPanelData: object | false = false

const originalFetch = window.fetch.bind(window)
window.fetch = (...args: Parameters<typeof window.fetch>) => {
  const promise = originalFetch(...args)
  try {
    const input = args[0]
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : ''
    if (PANEL_URL_RE.test(url)) {
      void promise.then((res) => {
        try {
          void res.clone().json().then((data) => {
            lastPanelData = data as object
            window.postMessage({ type: PANEL_MESSAGE_TYPE, data }, location.origin)
          })
        }
        catch {}
      }).catch(() => {})
    }
  }
  catch {}
  return promise
}

// content script 就绪后主动索取回放（解决"劫持早于注入导致数据丢失"的时序问题）
window.addEventListener('message', (e) => {
  if (e.source !== window)
    return
  const message = e.data as { type: string }
  if (!e.data || message.type !== PANEL_REQUEST_TYPE)
    return
  if (lastPanelData)
    window.postMessage({ type: PANEL_MESSAGE_TYPE, data: lastPanelData }, location.origin)
})
