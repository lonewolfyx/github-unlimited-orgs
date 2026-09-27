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
 *    page can consume the original response, and forward the data to the
 *    isolated-world content script via postMessage.
 * 2. Tag every intercepted payload with the route key of the page that
 *    triggered it, so the content script can reject data belonging to a
 *    previously visited profile (SPA navigation never reloads this script).
 * 3. The request may finish before the content script is injected, so an
 *    initial postMessage could have no listener. Cache payloads per route key
 *    and replay them when the content script sends a "guo:panel-request"
 *    message, ensuring data intercepted during page load is never lost.
 */

const PANEL_URL_RE = /\/_side-panels\/user\.json(?:[?#]|$)/
const PANEL_MESSAGE_TYPE = 'guo:side-panel'
const PANEL_REQUEST_TYPE = 'guo:panel-request'
const MAX_PANEL_MESSAGES = 2

interface PanelMessage {
  type: string
  routeKey: string
  data: object
}

const panelMessages = new Map<string, PanelMessage>()

function currentRouteKey(): string {
  try {
    const segments = location.pathname.split('/').filter(Boolean)
    return segments.length === 1 ? `/${decodeURIComponent(segments[0]!).toLowerCase()}` : ''
  }
  catch {
    return ''
  }
}

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
      const routeKey = currentRouteKey()
      if (routeKey) {
        void promise
          .then(response => response.clone().json())
          .then((data) => {
            const message: PanelMessage = { type: PANEL_MESSAGE_TYPE, routeKey, data: data as object }
            panelMessages.set(routeKey, message)
            while (panelMessages.size > MAX_PANEL_MESSAGES)
              panelMessages.delete(panelMessages.keys().next().value as string)
            window.postMessage(message, location.origin)
          })
          .catch(() => {})
      }
    }
  }
  catch {}

  return promise
}

// Replay the cached payload when the content script asks for its route,
// avoiding a race where interception happens before injection.
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data)
    return

  const request = event.data as { type?: string, routeKey?: string }
  if (request.type !== PANEL_REQUEST_TYPE || typeof request.routeKey !== 'string')
    return
  const message = panelMessages.get(request.routeKey)
  if (message)
    window.postMessage(message, location.origin)
})
