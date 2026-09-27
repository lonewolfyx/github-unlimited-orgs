import type { OrgInfo, PanelMessage } from './types'

export const PANEL_MESSAGE_TYPE = 'guo:side-panel'
export const PANEL_REQUEST_TYPE = 'guo:panel-request'

export type PanelOptions = PanelMessage['data']['userStatus']['organizationOptions']

export function parsePanelOptions(value: PanelOptions | false): OrgInfo[] | false {
  if (!value || !Array.isArray(value))
    return false
  const result: OrgInfo[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object')
      continue
    if (typeof item.label !== 'string' || item.label.length === 0
      || typeof item.value !== 'number' || !Number.isSafeInteger(item.value) || item.value <= 0) {
      continue
    }
    result.push({
      username: item.label,
      lable: item.label,
      avatar: `https://avatars.githubusercontent.com/u/${item.value}?s=64&v=4`,
    })
  }
  return result
}

/**
 * Runs inside GitHub's page context (MAIN world). Keep this function fully
 * self-contained: the tampermonkey build serializes it with .toString() into
 * an injected script element, so it must not reference any outer scope.
 *
 * When a signed-in user visits a profile, GitHub requests side-panel data from
 * "/_side-panels/user.json". The response's userStatus.organizationOptions
 * contains the profile user's complete organization list. Responsibilities:
 * 1. Patch window.fetch to intercept the response, read from a clone, and
 *    forward the data to the content script via postMessage.
 * 2. Tag every payload with the route key of the page that triggered it, so
 *    stale data from a previously visited profile can be rejected.
 * 3. Cache payloads per route key and replay them on a panel request message,
 *    so data intercepted before the content script attached is never lost.
 */
export function mainWorldInterceptor(panelMessageType: string, panelRequestType: string): void {
  const marker = '__guoPanelInterceptorInstalled__'
  const pageWindow = window as typeof window & Record<string, boolean>
  if (pageWindow[marker])
    return
  pageWindow[marker] = true

  const panelUrlRe = /\/_side-panels\/user\.json(?:[?#]|$)/u
  const panelMessages = new Map<string, { type: string, routeKey: string, data: object }>()
  const maxPanelMessages = 2

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

      if (panelUrlRe.test(url)) {
        const routeKey = currentRouteKey()
        if (routeKey) {
          void promise
            .then(response => response.clone().json())
            .then((data) => {
              const message = { type: panelMessageType, routeKey, data: data as object }
              panelMessages.set(routeKey, message)
              while (panelMessages.size > maxPanelMessages)
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
    if (event.origin !== location.origin || !event.data)
      return

    const request = event.data as { type?: string, routeKey?: string }
    if (request.type !== panelRequestType || typeof request.routeKey !== 'string')
      return
    const message = panelMessages.get(request.routeKey)
    if (message)
      window.postMessage(message, location.origin)
  })
}
