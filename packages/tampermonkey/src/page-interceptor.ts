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
  let lastMessage: { type: string, routeKey: string, data: unknown } | false = false

  function currentRouteKey(): string {
    try {
      const segments = location.pathname.split('/').filter(Boolean)
      return segments.length === 1 ? `/${decodeURIComponent(segments[0]!).toLowerCase()}` : ''
    }
    catch {
      return ''
    }
  }

  const originalFetch = window.fetch
  window.fetch = new Proxy(originalFetch, {
    apply(target, thisArg, args: Parameters<typeof window.fetch>) {
      const routeKey = currentRouteKey()
      const promise = Reflect.apply(target, thisArg, args) as ReturnType<typeof window.fetch>

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
              lastMessage = { type: panelMessageType, routeKey, data }
              window.postMessage(lastMessage, location.origin)
            })
            .catch(() => {})
        }
      }
      catch {}

      return promise
    },
  })

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || !event.data)
      return

    const request = event.data as { type?: unknown, routeKey?: unknown }
    if (request.type !== panelRequestType || typeof request.routeKey !== 'string')
      return
    if (lastMessage && lastMessage.routeKey === request.routeKey)
      window.postMessage(lastMessage, location.origin)
  })
}

export function installPageInterceptor(): void {
  const source = `;(${mainWorldInterceptor.toString()})(${JSON.stringify(PANEL_MESSAGE_TYPE)},${JSON.stringify(PANEL_REQUEST_TYPE)});`
  const script = GM_addElement('script', { textContent: source })
  script?.remove()
}
