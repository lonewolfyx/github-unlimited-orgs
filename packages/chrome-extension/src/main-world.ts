/**
 * MAIN world 注入脚本（document_start，先于页面脚本注册补丁）。
 *
 * GitHub 登录态会在浏览用户主页时请求右侧面板数据 `/_side-panels/user.json`，
 * 响应中 `userStatus.organizationOptions` 携带该用户的完整组织列表。
 * 匿名访问时 GitHub 不发起该请求，因此以此作为登录场景的数据源。
 *
 * 这里 patch window.fetch 拦截该响应（clone 后读取，不影响页面自身消费），
 * 通过 postMessage 转发给 isolated world 的 content script（见 content.ts）。
 */

const PANEL_URL_RE = /\/_side-panels\/user\.json(?:[?#]|$)/
const MESSAGE_TYPE = 'guo:side-panel'

const origFetch = window.fetch
window.fetch = function patchedFetch(...args: unknown[]) {
  const promise = origFetch.apply(this, args as Parameters<typeof origFetch>)
  try {
    const input = args[0] as string | URL | Request | undefined
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
            window.postMessage({ type: MESSAGE_TYPE, data }, '*')
          })
        }
        catch {}
      }).catch(() => {})
    }
  }
  catch {}
  return promise
}
