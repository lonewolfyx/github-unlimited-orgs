/**
 * MAIN-world injection script. It runs at document_start and installs the patch
 * before page scripts execute.
 *
 * When a signed-in user visits a profile, GitHub requests side-panel data from
 * "/_side-panels/user.json". The response's userStatus.organizationOptions
 * contains the profile user's complete organization list. GitHub does not make
 * this request for anonymous visitors, so it serves as the signed-in data source.
 *
 * Responsibilities:
 * 1. Patch window.fetch to intercept the response. Read from a clone so the
 *    page can consume the original response, cache the latest data, and forward
 *    it to the isolated-world content script via postMessage.
 * 2. The request may finish early in page loading, before the content script is
 *    injected, so an initial postMessage could have no listener. Cache the data
 *    and replay it when the content script sends a "guo:panel-request" message,
 *    ensuring that data intercepted as soon as the page loads is never lost.
 */

const PANEL_URL_RE = /\/_side-panels\/user\.json(?:[?#]|$)/
const PANEL_MESSAGE_TYPE = 'guo:side-panel'
const PANEL_REQUEST_TYPE = 'guo:panel-request'

/** Most recently intercepted side-panel JSON, retained for replay. */
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

// Replay cached data when the content script is ready, avoiding a race where
// interception happens before injection and the initial message is lost.
window.addEventListener('message', (e) => {
  if (e.source !== window)
    return
  const message = e.data as { type: string }
  if (!e.data || message.type !== PANEL_REQUEST_TYPE)
    return
  if (lastPanelData)
    window.postMessage({ type: PANEL_MESSAGE_TYPE, data: lastPanelData }, location.origin)
})
