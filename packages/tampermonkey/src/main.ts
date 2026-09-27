import type { FetchOrgsResponse, OrgInfo, PanelMessage } from './types'
import { requestOrganizations } from './api'
import { installPageInterceptor, PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE } from './page-interceptor'

// TODO: Replace this with the production API domain after deployment.
const API_BASE = 'http://localhost:3000'
const FETCH_FAILURE_COOLDOWN_MS = 60_000
const PANEL_WAIT_MS = 8_000
const SECTION_DISCOVERY_WINDOW_MS = 12_000
const SCAN_DEBOUNCE_MS = 80
const MORE_TEXT_RE = /^\+\s*\d+\s+more$/iu
const VIEW_ALL_TEXT_RE = /^view\s+all$/iu
const ORG_HINT_SELECTOR = 'a[href$="?tab=organizations"], a[href="/settings/organizations"], h2, h3'
const LOG_STYLE = 'color:#0969da;font-weight:600'

interface ProfileRoute {
  key: string
  username: string
}

type EntryKind = 'self' | 'other'

interface OrgSection {
  container: HTMLElement
  entry: HTMLElement
  kind: EntryKind
}

interface InjectedState {
  container: HTMLElement
  entry: HTMLElement
  insertedNodes: ChildNode[]
  previousEntryDisplay: string
}

interface InjectionResult {
  shown: number
  injected: number
}

interface DiagnosticSummary {
  status: string
  source: string
  total: number
  shown: number
  injected: number
  detail: string
}

/** Single-segment top-level GitHub routes that cannot be user or organization names. */
const RESERVED_PATHS = new Set([
  'about',
  'account',
  'apps',
  'collections',
  'contact',
  'copilot',
  'codespaces',
  'customer-stories',
  'dashboard',
  'education',
  'enterprise',
  'events',
  'explore',
  'features',
  'feed',
  'gist',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'organizations',
  'orgs',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'sessions',
  'settings',
  'site',
  'solutions',
  'sponsors',
  'stars',
  'team',
  'topics',
  'trending',
  'users',
  'watching',
])

installPageInterceptor()

function getProfileRoute(): ProfileRoute | false {
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length !== 1)
    return false

  try {
    const username = decodeURIComponent(segments.join(''))
    if (!username || RESERVED_PATHS.has(username.toLowerCase()))
      return false
    return {
      key: `${location.pathname}${location.search}`,
      username,
    }
  }
  catch {
    return false
  }
}

function resolveContainer(node: Element): HTMLElement | false {
  let current = node.parentElement
  for (let depth = 0; current && depth < 6; depth++) {
    if (current.querySelector('img'))
      return current
    current = current.parentElement
  }
  return false
}

function isViewAllEntry(element: HTMLElement): boolean {
  return element.matches('a[href="/settings/organizations"]')
    && VIEW_ALL_TEXT_RE.test(element.textContent?.trim() ?? '')
}

function findEntry(container: HTMLElement): { element: HTMLElement, kind: EntryKind } | false {
  for (const viewAll of container.querySelectorAll<HTMLElement>('a[href="/settings/organizations"]')) {
    if (isViewAllEntry(viewAll))
      return { element: viewAll, kind: 'self' }
  }

  for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href$="?tab=organizations"]')) {
    if (MORE_TEXT_RE.test(link.textContent?.trim() ?? ''))
      return { element: link, kind: 'other' }
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
  let element = walker.nextNode()
  while (element) {
    if (element instanceof HTMLElement
      && element.childElementCount === 0
      && MORE_TEXT_RE.test(element.textContent?.trim() ?? '')) {
      return { element, kind: 'other' }
    }
    element = walker.nextNode()
  }
  return false
}

function findOrgSection(): OrgSection | false {
  // A literal "View all" settings link identifies the signed-in user's own page.
  for (const viewAll of document.querySelectorAll<HTMLElement>('a[href="/settings/organizations"]')) {
    if (!isViewAllEntry(viewAll))
      continue
    const container = resolveContainer(viewAll)
    if (container)
      return { container, entry: viewAll, kind: 'self' }
  }

  // Other profiles expose the collapsed organization count as "+N more".
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href$="?tab=organizations"]')) {
    if (!MORE_TEXT_RE.test(link.textContent?.trim() ?? ''))
      continue
    const container = resolveContainer(link)
    if (container)
      return { container, entry: link, kind: 'other' }
  }

  // GitHub can render the entry shortly after the heading, so retain a scoped fallback.
  for (const heading of document.querySelectorAll<HTMLElement>('h2, h3')) {
    if (heading.textContent?.trim() !== 'Organizations')
      continue
    const container = resolveContainer(heading)
    if (!container)
      continue
    const entry = findEntry(container)
    if (entry)
      return { container, entry: entry.element, kind: entry.kind }
  }
  return false
}

function loginFromHref(href: string): string | false {
  try {
    const url = new URL(href, location.origin)
    const segments = url.pathname.split('/').filter(Boolean)
    if (url.origin !== location.origin || segments.length !== 1)
      return false
    return decodeURIComponent(segments.join(''))
  }
  catch {
    return false
  }
}

function existingLogins(container: HTMLElement): Set<string> {
  const logins = new Set<string>()
  for (const link of container.querySelectorAll<HTMLAnchorElement>('a.avatar-group-item[href]')) {
    const login = loginFromHref(link.getAttribute('href') ?? '')
    if (login)
      logins.add(login.toLowerCase())
  }
  return logins
}

function orgsFromPanel(options: Array<{ label: string, value: number }>): OrgInfo[] {
  return options
    .filter(option => option.label.length > 0 && Number.isSafeInteger(option.value) && option.value > 0)
    .map(option => ({
      username: option.label,
      lable: option.label,
      avatar: `https://avatars.githubusercontent.com/u/${option.value}?s=64&v=4`,
    }))
}

function parsePanelOptions(value: unknown): Array<{ label: string, value: number }> | false {
  if (!Array.isArray(value))
    return false

  const options: Array<{ label: string, value: number }> = []
  for (const item of value) {
    if (!item || typeof item !== 'object')
      continue
    const candidate = item as { label?: unknown, value?: unknown }
    if (typeof candidate.label === 'string' && typeof candidate.value === 'number')
      options.push({ label: candidate.label, value: candidate.value })
  }
  return options
}

let inflight: { username: string, promise: Promise<FetchOrgsResponse> } | false = false

function fetchOrgs(username: string): Promise<FetchOrgsResponse> {
  if (inflight && inflight.username === username)
    return inflight.promise

  const promise = requestOrganizations(username, API_BASE)
  inflight = { username, promise }
  const clearInflight = (): void => {
    if (inflight && inflight.promise === promise)
      inflight = false
  }
  void promise.then(clearInflight, clearInflight)
  return promise
}

function avatarUrl(source: string): string {
  try {
    const url = new URL(source)
    url.searchParams.set('s', '64')
    return url.href
  }
  catch {
    return source
  }
}

function createOrgLink(org: OrgInfo): HTMLAnchorElement {
  const link = document.createElement('a')
  link.className = 'avatar-group-item'
  link.href = `/${encodeURIComponent(org.username)}`
  link.setAttribute('aria-label', org.lable || org.username)
  link.setAttribute('itemprop', 'follows')
  link.setAttribute('data-hovercard-type', 'organization')
  link.setAttribute('data-hovercard-url', `/orgs/${encodeURIComponent(org.username)}/hovercard`)
  link.setAttribute('data-octo-click', 'hovercard-link-click')
  link.setAttribute('data-octo-dimensions', 'link_type:self')

  const image = document.createElement('img')
  image.className = 'avatar'
  image.alt = `@${org.username}`
  image.width = 32
  image.height = 32
  image.loading = 'lazy'
  image.decoding = 'async'
  image.fetchPriority = 'low'
  image.setAttribute('size', '32')
  image.src = avatarUrl(org.avatar)
  link.append(image)
  return link
}

function topLevelWrapper(element: HTMLElement, container: HTMLElement): Element {
  let wrapper: Element = element
  while (wrapper.parentElement && wrapper.parentElement !== container)
    wrapper = wrapper.parentElement
  return wrapper
}

let state: InjectedState | false = false

function isStateAlive(value: InjectedState): boolean {
  return value.container.isConnected
    && value.entry.isConnected
    && value.insertedNodes.length > 0
    && value.insertedNodes.every(node => node.isConnected)
}

function teardownInjection(): void {
  if (!state)
    return
  state.entry.style.display = state.previousEntryDisplay
  for (const node of state.insertedNodes)
    node.remove()
  state = false
}

function injectOrganizations(section: OrgSection, orgs: OrgInfo[]): InjectionResult {
  const shown = existingLogins(section.container)
  const extra = orgs.filter(org => !shown.has(org.username.toLowerCase()))
  if (extra.length === 0)
    return { shown: shown.size, injected: 0 }

  const fragment = document.createDocumentFragment()
  const insertedNodes: ChildNode[] = []
  for (const org of extra) {
    const link = createOrgLink(org)
    const spacer = document.createTextNode(' ')
    fragment.append(link, spacer)
    insertedNodes.push(link, spacer)
  }

  const marker = topLevelWrapper(section.entry, section.container)
  section.container.insertBefore(fragment, marker)
  const previousEntryDisplay = section.entry.style.display
  section.entry.style.display = 'none'
  state = {
    container: section.container,
    entry: section.entry,
    insertedNodes,
    previousEntryDisplay,
  }
  return { shown: shown.size, injected: extra.length }
}

let activeRouteKey = ''
let activeUsername = ''
let currentSectionKind: EntryKind | '' = ''
let latestPanelOptions: Array<{ label: string, value: number }> = []
let hasLatestPanelOptions = false
let panelPageRouteKey = ''
let panelWaitUsername = ''
let panelUnavailableRouteKey = ''
let panelWaitTimer = 0
let scanTimer = 0
let discoveryTimer = 0
let scanToken = 0
let lastFetched: { routeKey: string, username: string, orgs: OrgInfo[] } | false = false
let loggedRouteKey = ''
let routeStartedAt = performance.now()
const failedUntil = new Map<string, number>()

function logDiagnostic(route: ProfileRoute, summary: DiagnosticSummary): void {
  if (loggedRouteKey === route.key)
    return

  loggedRouteKey = route.key
  console.groupCollapsed(`%c[GUO] ${route.username} · ${summary.status}`, LOG_STYLE)
  console.info('Page', route.key)
  console.info('Data source', summary.source)
  console.info('Organizations', `Fetched ${summary.total} / Displayed ${summary.shown} / Injected ${summary.injected}`)
  if (summary.detail)
    console.info('Details', summary.detail)
  console.info('Duration', `${Math.round(performance.now() - routeStartedAt)}ms`)
  console.groupEnd()
}

const domObserver = new MutationObserver((records) => {
  if (!getProfileRoute())
    return

  if (state) {
    if (!isStateAlive(state))
      scheduleScan()
    return
  }
  if (panelWaitUsername || (inflight && inflight.username === activeUsername))
    return

  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof Element
        && (node.matches(ORG_HINT_SELECTOR) || node.querySelector(ORG_HINT_SELECTOR))) {
        scheduleScan()
        return
      }
    }
  }
})

function stopObservingDom(): void {
  clearTimeout(discoveryTimer)
  discoveryTimer = 0
  domObserver.disconnect()
}

function observeForSection(route: ProfileRoute): void {
  stopObservingDom()
  const root = document.body ?? document.documentElement
  if (!root) {
    document.addEventListener('DOMContentLoaded', () => scheduleScan(0), { once: true })
    return
  }

  domObserver.observe(root, { childList: true, subtree: true })
  discoveryTimer = setTimeout(() => {
    if (activeRouteKey === route.key && !state) {
      domObserver.disconnect()
      logDiagnostic(route, {
        status: 'Organization section not found',
        source: 'None',
        total: 0,
        shown: 0,
        injected: 0,
        detail: 'The page may not list any organizations, or GitHub may have changed its page structure',
      })
    }
  }, SECTION_DISCOVERY_WINDOW_MS)
}

function observeInjectedState(injectedState: InjectedState): void {
  stopObservingDom()
  const root = injectedState.container.parentElement ?? injectedState.container
  domObserver.observe(root, { childList: true, subtree: true })
}

function clearPanelWait(): void {
  clearTimeout(panelWaitTimer)
  panelWaitTimer = 0
  panelWaitUsername = ''
}

function resetRouteState(route: ProfileRoute | false): void {
  scanToken++
  clearTimeout(scanTimer)
  scanTimer = 0
  stopObservingDom()
  clearPanelWait()
  teardownInjection()

  activeRouteKey = route ? route.key : ''
  activeUsername = route ? route.username : ''
  currentSectionKind = ''
  latestPanelOptions = []
  hasLatestPanelOptions = false
  panelPageRouteKey = ''
  panelUnavailableRouteKey = ''
  lastFetched = false
  loggedRouteKey = ''
  routeStartedAt = performance.now()
}

function syncRoute(): ProfileRoute | false {
  const route = getProfileRoute()
  if ((route ? route.key : '') !== activeRouteKey)
    resetRouteState(route)
  return route
}

function beginPanelWait(route: ProfileRoute): void {
  if (panelWaitUsername === route.username || panelUnavailableRouteKey === route.key)
    return

  clearPanelWait()
  panelWaitUsername = route.username
  window.postMessage({ type: PANEL_REQUEST_TYPE, routeKey: route.key }, location.origin)
  panelWaitTimer = setTimeout(() => {
    if (activeRouteKey !== route.key || panelWaitUsername !== route.username)
      return
    panelWaitUsername = ''
    panelUnavailableRouteKey = route.key
    logDiagnostic(route, {
      status: 'Timed out waiting for data',
      source: 'GitHub side-panel',
      total: 0,
      shown: 0,
      injected: 0,
      detail: `No organization data received within ${PANEL_WAIT_MS}ms`,
    })
  }, PANEL_WAIT_MS)
}

async function scan(): Promise<void> {
  const route = syncRoute()
  if (!route)
    return
  if (state && isStateAlive(state))
    return
  if (panelWaitUsername === route.username || (inflight && inflight.username === route.username))
    return

  const token = ++scanToken
  teardownInjection()
  stopObservingDom()

  const section = findOrgSection()
  currentSectionKind = section ? section.kind : ''
  if (!section) {
    observeForSection(route)
    return
  }

  let orgs: OrgInfo[]
  let source = 'Custom API'
  if (section.kind === 'self') {
    source = 'GitHub side-panel'
    if (hasLatestPanelOptions && panelPageRouteKey === route.key) {
      orgs = orgsFromPanel(latestPanelOptions)
      latestPanelOptions = []
      hasLatestPanelOptions = false
      clearPanelWait()
    }
    else {
      beginPanelWait(route)
      return
    }
  }
  else if (lastFetched && lastFetched.routeKey === route.key && lastFetched.username === route.username) {
    orgs = lastFetched.orgs
  }
  else {
    latestPanelOptions = []
    hasLatestPanelOptions = false
    panelPageRouteKey = ''
    if ((failedUntil.get(route.username) ?? 0) > Date.now()) {
      logDiagnostic(route, {
        status: 'Request cooldown active',
        source,
        total: 0,
        shown: 0,
        injected: 0,
        detail: 'A previous request failed; skipping repeat requests during the cooldown period',
      })
      return
    }

    const response = await fetchOrgs(route.username)
    if (token !== scanToken || activeRouteKey !== route.key)
      return
    if (!response.ok) {
      failedUntil.set(route.username, Date.now() + FETCH_FAILURE_COOLDOWN_MS)
      logDiagnostic(route, {
        status: 'Failed to fetch organizations',
        source,
        total: 0,
        shown: 0,
        injected: 0,
        detail: response.error,
      })
      return
    }
    orgs = response.data
    lastFetched = { routeKey: route.key, username: route.username, orgs }
  }

  if (token !== scanToken || activeRouteKey !== route.key)
    return
  if (!section.container.isConnected || !section.entry.isConnected) {
    scheduleScan()
    return
  }

  const result = injectOrganizations(section, orgs)
  logDiagnostic(route, {
    status: result.injected > 0 ? 'Enhancement complete' : 'Page already complete',
    source,
    total: orgs.length,
    shown: result.shown,
    injected: result.injected,
    detail: result.injected > 0
      ? 'Injected organizations use GitHub native hovercards'
      : 'No additional organizations need to be injected',
  })
  if (state)
    observeInjectedState(state)
}

function scheduleScan(delay = SCAN_DEBOUNCE_MS): void {
  clearTimeout(scanTimer)
  scanTimer = setTimeout(() => {
    scanTimer = 0
    void scan()
  }, delay)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || !event.data)
    return

  const message = event.data as Partial<PanelMessage>
  if (message.type !== PANEL_MESSAGE_TYPE || typeof message.routeKey !== 'string')
    return

  const route = getProfileRoute()
  if (!route
    || activeRouteKey !== route.key
    || currentSectionKind !== 'self'
    || message.routeKey !== route.key) {
    return
  }

  const options = parsePanelOptions(message.data?.userStatus?.organizationOptions)
  if (!options)
    return

  latestPanelOptions = options
  panelPageRouteKey = route.key
  hasLatestPanelOptions = true
  panelUnavailableRouteKey = ''
  clearPanelWait()
  scheduleScan(0)
})

const onNavigate = (): void => {
  const route = getProfileRoute()
  if ((route ? route.key : '') !== activeRouteKey)
    resetRouteState(route)
  else if (state && !isStateAlive(state))
    teardownInjection()
  scheduleScan(0)
}

const navigationEvents = ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const
for (const type of navigationEvents)
  addEventListener(type, onNavigate, true)

scheduleScan(0)
