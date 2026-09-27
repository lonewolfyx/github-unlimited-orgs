import type { OrgInfo, ProfileRoute } from './types'

const MORE_TEXT_RE = /^\+\s*\d+\s+more$/iu
const OVERVIEW_PARAMS = new Set(['', 'overview'])
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

const ORG_ENTRY_SELECTOR = 'a.avatar-group-item[data-hovercard-type="organization"], a[href*="tab=organizations"], a[href="/settings/organizations"]'
const ORG_HEADING_SELECTOR = 'h2, h3'

export interface OrgSection {
  container: HTMLElement
  entryWrapper: HTMLElement | false
  isSelf: boolean
}

export interface RenderHandle {
  isConnected: () => boolean
  dispose: () => void
}

function isOrgHeading(element: Element): boolean {
  return element.matches(ORG_HEADING_SELECTOR) && element.textContent?.trim() === 'Organizations'
}

export function containsOrgHint(element: Element): boolean {
  if (element.matches(ORG_ENTRY_SELECTOR) || element.querySelector(ORG_ENTRY_SELECTOR))
    return true
  if (isOrgHeading(element))
    return true
  for (const heading of element.querySelectorAll(ORG_HEADING_SELECTOR)) {
    if (isOrgHeading(heading))
      return true
  }
  return false
}

export function getProfileRoute(url: URL = new URL(location.href)): ProfileRoute | false {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 1)
    return false

  // Never observe repository/star/project tabs: their large dynamic lists caused browser stalls.
  const tab = url.searchParams.get('tab') ?? ''
  if (!OVERVIEW_PARAMS.has(tab.toLowerCase()))
    return false
  if ([...url.searchParams.keys()].some(key => key !== 'tab'))
    return false

  try {
    const username = decodeURIComponent(segments[0]!)
    if (!username || RESERVED_PATHS.has(username.toLowerCase()))
      return false
    return { key: `/${username.toLowerCase()}`, username }
  }
  catch {
    return false
  }
}

function directChildOf(element: HTMLElement, container: HTMLElement): HTMLElement {
  let current = element
  while (current.parentElement && current.parentElement !== container)
    current = current.parentElement
  return current
}

function resolveContainer(element: Element): HTMLElement | false {
  let current = element.parentElement
  for (let depth = 0; current && depth < 6; depth++, current = current.parentElement) {
    if (current.querySelector('a.avatar-group-item img, img'))
      return current
  }
  return false
}

function findEntry(container: HTMLElement): HTMLElement | false {
  const settingsLink = container.querySelector<HTMLElement>('a[href="/settings/organizations"]')
  if (settingsLink)
    return settingsLink

  for (const link of container.querySelectorAll<HTMLElement>('a[href*="tab=organizations"]')) {
    if (MORE_TEXT_RE.test(link.textContent?.trim() ?? ''))
      return link
  }
  for (const element of container.querySelectorAll<HTMLElement>('div, span')) {
    if (element.childElementCount === 0 && MORE_TEXT_RE.test(element.textContent?.trim() ?? ''))
      return element
  }
  return false
}

export function findOrgSection(root: ParentNode = document): OrgSection | false {
  // The signed-in profile exposes a literal View all settings link. Locate it
  // globally first because the heading and the entry are not always siblings
  // in GitHub's rendered profile tree.
  for (const entry of root.querySelectorAll<HTMLElement>('a[href="/settings/organizations"]')) {
    const container = resolveContainer(entry)
    if (container) {
      return {
        container,
        entryWrapper: directChildOf(entry, container),
        isSelf: true,
      }
    }
  }

  // Other profiles expose the collapsed organization count as +N more.
  for (const entry of root.querySelectorAll<HTMLElement>('a[href*="tab=organizations"]')) {
    if (!MORE_TEXT_RE.test(entry.textContent?.trim() ?? ''))
      continue
    const container = resolveContainer(entry)
    if (container) {
      return {
        container,
        entryWrapper: directChildOf(entry, container),
        isSelf: false,
      }
    }
  }

  for (const heading of root.querySelectorAll<HTMLElement>('h2, h3')) {
    if (heading.textContent?.trim() !== 'Organizations')
      continue
    const container = heading.parentElement
    if (!container)
      continue
    const entry = findEntry(container)
    if (entry) {
      return {
        container,
        entryWrapper: directChildOf(entry, container),
        isSelf: Boolean(container.querySelector('a[href="/settings/organizations"]')),
      }
    }
  }

  return false
}

function loginFromHref(href: string): string | false {
  try {
    const url = new URL(href, location.origin)
    const segments = url.pathname.split('/').filter(Boolean)
    return url.origin === location.origin && segments.length === 1
      ? decodeURIComponent(segments[0]!)
      : false
  }
  catch {
    return false
  }
}

function existingLogins(container: HTMLElement): Set<string> {
  const result = new Set<string>()
  for (const link of container.querySelectorAll<HTMLAnchorElement>('a.avatar-group-item[href]')) {
    const login = loginFromHref(link.getAttribute('href') ?? '')
    if (login)
      result.add(login.toLowerCase())
  }
  return result
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
  const login = org.username
  const link = document.createElement('a')
  link.className = 'avatar-group-item'
  link.href = `/${encodeURIComponent(login)}`
  link.setAttribute('aria-label', org.lable || login)
  link.setAttribute('itemprop', 'follows')
  link.setAttribute('data-guo-org', login)
  link.setAttribute('data-hovercard-type', 'organization')
  link.setAttribute('data-hovercard-url', `/orgs/${encodeURIComponent(login)}/hovercard`)
  link.setAttribute('data-octo-click', 'hovercard-link-click')
  link.setAttribute('data-octo-dimensions', 'link_type:self')

  const image = document.createElement('img')
  image.className = 'avatar'
  image.setAttribute('data-view-component', 'true')
  image.src = avatarUrl(org.avatar)
  image.alt = `@${login}`
  image.width = 32
  image.height = 32
  image.loading = 'lazy'
  image.decoding = 'async'
  image.setAttribute('size', '32')
  link.append(image)
  return link
}

export function renderOrganizations(section: OrgSection, orgs: OrgInfo[]): RenderHandle | false {
  const existing = existingLogins(section.container)
  const seen = new Set(existing)
  const missing = orgs.filter((org) => {
    const login = org.username.toLowerCase()
    if (seen.has(login))
      return false
    seen.add(login)
    return true
  })
  if (missing.length === 0)
    return false

  const fragment = document.createDocumentFragment()
  const insertedNodes: ChildNode[] = []
  for (const org of missing) {
    const link = createOrgLink(org)
    const spacer = document.createTextNode(' ')
    fragment.append(link, spacer)
    insertedNodes.push(link, spacer)
  }

  const marker = section.entryWrapper
  if (marker)
    section.container.insertBefore(fragment, marker)
  else
    section.container.append(fragment)

  const previousDisplay = marker ? marker.style.getPropertyValue('display') : ''
  const previousDisplayPriority = marker ? marker.style.getPropertyPriority('display') : ''
  // GitHub's d-inline-block utility uses !important, so a normal inline
  // display:none declaration does not hide the "+N more" wrapper.
  if (marker)
    marker.style.setProperty('display', 'none', 'important')

  return {
    isConnected: () => insertedNodes.every(node => node.isConnected)
      && section.container.isConnected
      && (!marker || (marker.isConnected
        && marker.style.getPropertyValue('display') === 'none'
        && marker.style.getPropertyPriority('display') === 'important')),
    dispose() {
      for (const node of insertedNodes)
        node.remove()
      if (!marker || !marker.isConnected)
        return
      if (previousDisplay)
        marker.style.setProperty('display', previousDisplay, previousDisplayPriority)
      else
        marker.style.removeProperty('display')
    },
  }
}
