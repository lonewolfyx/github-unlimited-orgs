import type { OrgInfo, PanelMessage, ProfileRoute } from './types'
import { requestOrganizations } from './api'
import { findOrgSection, getProfileRoute, ORG_HINT_SELECTOR, renderOrganizations } from './dom'
import { installPageInterceptor, PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE } from './page-interceptor'

const DISCOVERY_TIMEOUT_MS = 8_000
const PANEL_GRACE_MS = 1_200

installPageInterceptor()

let activeRoute: ProfileRoute | false = false
let routeToken = 0
let discoveryObserver: MutationObserver | null = null
let discoveryTimer = 0
let renderHandle: ReturnType<typeof renderOrganizations> = false
let renderObserver: MutationObserver | null = null
const panelData = new Map<string, OrgInfo[]>()
const panelWaiters = new Map<string, Set<(orgs: OrgInfo[]) => void>>()

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
  clearTimeout(discoveryTimer)
  discoveryTimer = 0
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
  activeRoute = route
}

function waitForPanel(route: ProfileRoute): Promise<OrgInfo[] | false> {
  const cached = panelData.get(route.key)
  if (cached)
    return Promise.resolve(cached)

  window.postMessage({ type: PANEL_REQUEST_TYPE, routeKey: route.key }, location.origin)
  return new Promise((resolve) => {
    let timer = 0
    const waiter = (orgs: OrgInfo[]): void => {
      clearTimeout(timer)
      panelWaiters.get(route.key)?.delete(waiter)
      resolve(orgs)
    }
    timer = setTimeout(() => {
      panelWaiters.get(route.key)?.delete(waiter)
      resolve(false)
    }, PANEL_GRACE_MS)
    const waiters = panelWaiters.get(route.key) ?? new Set()
    waiters.add(waiter)
    panelWaiters.set(route.key, waiters)
  })
}

async function loadOrganizations(route: ProfileRoute, isSelf: boolean): Promise<OrgInfo[] | false> {
  if (isSelf) {
    const intercepted = await waitForPanel(route)
    if (intercepted)
      return intercepted
  }
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
  renderObserver.observe(root, { childList: true, subtree: true })
}

async function enhance(route: ProfileRoute): Promise<boolean> {
  const token = routeToken
  const section = findOrgSection()
  if (!section)
    return false
  stopDiscovery()
  if (!section.entryWrapper)
    return true

  const orgs = await loadOrganizations(route, section.isSelf)
  if (token !== routeToken || !activeRoute || activeRoute.key !== route.key || !orgs || !section.container.isConnected)
    return true

  cleanupRender()
  renderHandle = renderOrganizations(section, orgs)
  observeRenderedSection(route, section.container)
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
  discoveryTimer = setTimeout(stopDiscovery, DISCOVERY_TIMEOUT_MS)
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
  if (route && !(renderHandle && renderHandle.isConnected()))
    start(route)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || !event.data)
    return
  const message = event.data as Partial<PanelMessage>
  if (message.type !== PANEL_MESSAGE_TYPE || typeof message.routeKey !== 'string')
    return
  const orgs = parsePanelOptions(message.data?.userStatus?.organizationOptions)
  if (!orgs)
    return
  panelData.set(message.routeKey, orgs)
  for (const resolve of panelWaiters.get(message.routeKey) ?? [])
    resolve(orgs)
  panelWaiters.delete(message.routeKey)
  if (activeRoute && activeRoute.key === message.routeKey)
    start(activeRoute)
})

for (const eventName of ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const)
  addEventListener(eventName, onNavigate, true)

onNavigate()
