import type { OrgInfo, PanelMessage, ProfileRoute } from './types'
import { requestOrganizations } from './api'
import { containsOrgHint, findOrgSection, getProfileRoute, renderOrganizations } from './dom'

const PANEL_MESSAGE_TYPE = 'guo:side-panel'
const PANEL_REQUEST_TYPE = 'guo:panel-request'
const SECTION_DISCOVERY_WINDOW_MS = 10_000

let activeRoute: ProfileRoute | false = false
let routeToken = 0
let discoveryObserver: MutationObserver | false = false
let discoveryTimer = 0
let renderHandle: ReturnType<typeof renderOrganizations> = false
let renderObserver: MutationObserver | false = false
let navigationFrame = 0
const panelData = new Map<string, OrgInfo[]>()
const panelRequests = new Set<string>()

type PanelOptions = PanelMessage['data']['userStatus']['organizationOptions']

function parsePanelOptions(value: PanelOptions | false): OrgInfo[] | false {
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

function stopDiscovery(): void {
  clearTimeout(discoveryTimer)
  discoveryTimer = 0
  if (discoveryObserver)
    discoveryObserver.disconnect()
  discoveryObserver = false
}

function cleanupRender(): void {
  if (renderObserver)
    renderObserver.disconnect()
  renderObserver = false
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

  // A "+N more" entry is another user's profile, so request its complete
  // public organization list from the configured project API.
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
  renderObserver.observe(container, { childList: true })
  if (root !== container)
    renderObserver.observe(root, { childList: true })
}

function containsRelevantAddition(records: MutationRecord[]): boolean {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof Element && containsOrgHint(node))
        return true
    }
  }
  return false
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
  // flight. Re-discover only when the captured section became stale.
  const currentSection = section.container.isConnected && section.entryWrapper.isConnected
    ? section
    : findOrgSection()
  if (!currentSection || !currentSection.entryWrapper || !currentSection.container.isConnected)
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
    if (!containsRelevantAddition(records))
      return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      if (activeRoute && activeRoute.key === route.key)
        void enhance(route)
    })
  })
  discoveryObserver.observe(root, { childList: true, subtree: true })
  discoveryTimer = window.setTimeout(() => {
    if (activeRoute && activeRoute.key === route.key)
      stopDiscovery()
  }, SECTION_DISCOVERY_WINDOW_MS)
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

function scheduleNavigation(): void {
  if (navigationFrame)
    return
  navigationFrame = requestAnimationFrame(() => {
    navigationFrame = 0
    onNavigate()
  })
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || !event.data)
    return
  const message = event.data as Partial<PanelMessage>
  if (message.type !== PANEL_MESSAGE_TYPE || typeof message.routeKey !== 'string')
    return
  // The payload belongs to the page that triggered user.json; ignore data
  // intercepted for a previously visited profile.
  if (!activeRoute || activeRoute.key !== message.routeKey)
    return
  const orgs = parsePanelOptions(message.data?.userStatus?.organizationOptions ?? false)
  if (!orgs)
    return
  panelData.clear()
  panelData.set(message.routeKey, orgs)
  start(activeRoute)
})

for (const eventName of ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const)
  addEventListener(eventName, scheduleNavigation, true)

onNavigate()
