import type { OrgInfo, PanelMessage, ProfileRoute } from './types'
import { requestOrganizations } from './api'
import { findOrgSection, getProfileRoute, ORG_HINT_SELECTOR, renderOrganizations } from './dom'
import { installPageInterceptor, PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE } from './page-interceptor'

installPageInterceptor()

let activeRoute: ProfileRoute | false = false
let routeToken = 0
let discoveryObserver: MutationObserver | null = null
let renderHandle: ReturnType<typeof renderOrganizations> = false
let renderObserver: MutationObserver | null = null
const panelData = new Map<string, OrgInfo[]>()
const panelRequests = new Set<string>()

function parsePanelOptions(value: unknown): OrgInfo[] | false {
  if (!Array.isArray(value))
    return false
  const result: OrgInfo[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object')
      continue
    const candidate = item as { label?: unknown, value?: unknown }
    if (typeof candidate.label !== 'string' || candidate.label.length === 0
      || typeof candidate.value !== 'number' || !Number.isSafeInteger(candidate.value) || candidate.value <= 0) {
      continue
    }
    result.push({
      username: candidate.label,
      lable: candidate.label,
      avatar: `https://avatars.githubusercontent.com/u/${candidate.value}?s=64&v=4`,
    })
  }
  return result
}

function stopDiscovery(): void {
  discoveryObserver?.disconnect()
  discoveryObserver = null
}

function cleanupRender(): void {
  renderObserver?.disconnect()
  renderObserver = null
  if (renderHandle)
    renderHandle.dispose()
  renderHandle = false
}

function reset(route: ProfileRoute | false): void {
  routeToken++
  stopDiscovery()
  cleanupRender()
  panelData.clear()
  panelRequests.clear()
  activeRoute = route
}

function requestPanel(route: ProfileRoute): void {
  if (panelData.has(route.key) || panelRequests.has(route.key))
    return
  panelRequests.add(route.key)
  window.postMessage({ type: PANEL_REQUEST_TYPE, routeKey: route.key }, location.origin)
}

async function loadOrganizations(route: ProfileRoute, isSelf: boolean): Promise<OrgInfo[] | false> {
  if (isSelf) {
    // "View all" belongs to the signed-in user's profile. GitHub already
    // fetches the complete list in user.json; request a replay of that
    // intercepted response instead of querying the public API.
    requestPanel(route)
    return panelData.get(route.key) ?? false
  }

  // A "+N more" entry is another user's profile, so its complete public
  // organization list must come from the GitHub organizations endpoint.
  const response = await requestOrganizations(route.username)
  return response.ok ? response.data : false
}

function observeRenderedSection(route: ProfileRoute, container: HTMLElement): void {
  if (!renderHandle)
    return
  const root = container.parentElement ?? container
  renderObserver = new MutationObserver(() => {
    if (activeRoute && activeRoute.key === route.key && renderHandle && !renderHandle.isConnected())
      start(route)
  })
  // Watch only the rendered section and its direct parent. GitHub replaces
  // this small part of the profile during navigation; observing the whole
  // profile subtree makes every unrelated update expensive.
  renderObserver.observe(container, { childList: true, subtree: true })
  if (root !== container)
    renderObserver.observe(root, { childList: true })
}

async function enhance(route: ProfileRoute): Promise<boolean> {
  const token = routeToken
  const section = findOrgSection()
  if (!section)
    return false
  stopDiscovery()
  if (!section.entryWrapper)
    return false

  const orgs = await loadOrganizations(route, section.isSelf)
  if (token !== routeToken || !activeRoute || activeRoute.key !== route.key)
    return true
  if (!orgs)
    return false

  // The profile section can be replaced while the public API request is in
  // flight. Re-discover it before rendering so a response is never applied
  // to a detached section or leaves a newly rendered "+N more" entry behind.
  const currentSection = findOrgSection()
  if (!currentSection?.entryWrapper || !currentSection.container.isConnected)
    return false

  cleanupRender()
  renderHandle = renderOrganizations(currentSection, orgs)
  observeRenderedSection(route, currentSection.container)
  return true
}

function observeUntilReady(route: ProfileRoute): void {
  if (discoveryObserver)
    return
  const root = document.querySelector('main') ?? document.body ?? document.documentElement
  let scheduled = false
  discoveryObserver = new MutationObserver((records) => {
    if (scheduled)
      return
    const relevant = records.some(record => [...record.addedNodes].some(node =>
      node instanceof Element && (node.matches(ORG_HINT_SELECTOR) || Boolean(node.querySelector(ORG_HINT_SELECTOR))),
    ))
    if (!relevant)
      return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      if (activeRoute && activeRoute.key === route.key)
        void enhance(route)
    })
  })
  discoveryObserver.observe(root, { childList: true, subtree: true })
}

function start(route: ProfileRoute): void {
  routeToken++
  stopDiscovery()
  cleanupRender()
  void enhance(route).then((found) => {
    if (!found && activeRoute && activeRoute.key === route.key)
      observeUntilReady(route)
  })
}

function onNavigate(): void {
  const route = getProfileRoute()
  if ((route ? route.key : '') !== (activeRoute ? activeRoute.key : ''))
    reset(route)
  if (route)
    requestPanel(route)
  if (route && !(renderHandle && renderHandle.isConnected()))
    start(route)
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || !event.data)
    return
  const message = event.data as Partial<PanelMessage>
  if (message.type !== PANEL_MESSAGE_TYPE || typeof message.routeKey !== 'string')
    return
  const orgs = parsePanelOptions(message.data?.userStatus?.organizationOptions)
  if (!orgs)
    return
  if (!activeRoute || activeRoute.key !== message.routeKey)
    return
  panelData.clear()
  panelData.set(message.routeKey, orgs)
  start(activeRoute)
})

for (const eventName of ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const)
  addEventListener(eventName, onNavigate, true)

onNavigate()
