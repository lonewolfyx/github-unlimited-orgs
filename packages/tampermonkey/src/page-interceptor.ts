export const PANEL_MESSAGE_TYPE = 'guo:side-panel'
export const PANEL_REQUEST_TYPE = 'guo:panel-request'

/**
 * Runs inside GitHub's MAIN_WORLD. Keep this function self-contained because
 * its source is serialized into an injected script element.
 */
function mainWorldInterceptor(panelMessageType: string, panelRequestType: string): void {
  const marker = '__guoPanelInterceptorInstalled__'
  const pageWindow = window as typeof window & Record<string, unknown>
  if (pageWindow[marker])
    return
  pageWindow[marker] = true

  const panelUrlRe = /\/_side-panels\/user\.json(?:[?#]|$)/u
  const panelMessages = new Map<string, { type: string, routeKey: string, data: unknown }>()
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
    const routeKey = currentRouteKey()
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

      if (routeKey && panelUrlRe.test(url)) {
        void promise
          .then(response => response.clone().json())
          .then((data: unknown) => {
            const message = { type: panelMessageType, routeKey, data }
            panelMessages.set(routeKey, message)
            while (panelMessages.size > maxPanelMessages)
              panelMessages.delete(panelMessages.keys().next().value as string)
            window.postMessage(message, location.origin)
          })
          .catch(() => {})
      }
    }
    catch {}

    return promise
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data)
      return

    const request = event.data as { type?: unknown, routeKey?: unknown }
    if (request.type !== panelRequestType || typeof request.routeKey !== 'string')
      return
    const message = panelMessages.get(request.routeKey)
    if (message)
      window.postMessage(message, location.origin)
  })
}

export function installPageInterceptor(): void {
  const source = `;(${mainWorldInterceptor.toString()})(${JSON.stringify(PANEL_MESSAGE_TYPE)},${JSON.stringify(PANEL_REQUEST_TYPE)});`
  const script = GM_addElement('script', { textContent: source })
  script?.remove()
}
