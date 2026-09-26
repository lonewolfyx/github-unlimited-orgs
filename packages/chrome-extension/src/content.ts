/**
 * GitHub Unlimited Orgs — content script（子项目独立实现，不依赖 workspace 其他包）
 *
 * 基于对 github.com 真实用户主页的分析（2026-09）：
 * - 组织区块是左侧边栏 `<div class="border-top ... clearfix">` 里的
 *   `<h2 class="mb-2 h4">Organizations</h2>` + 若干原生头像链接；
 * - 原生头像链接结构：
 *   `a.avatar-group-item[data-hovercard-type="organization"]`
 *   `[data-hovercard-url="/orgs/{org}/hovercard"][href="/{org}"] > img.avatar`
 * - 隐藏部分在页面里只是一个纯文本元素 `+ N more`（匿名态为 span，无任何交互）；
 * - GitHub 原生悬停卡片靠 `data-hovercard-url` 属性的事件委托驱动，
 *   动态插入且带该属性的元素会自动获得原生 hovercard，无需自己实现卡片。
 *
 * 因此本脚本只做三件事：
 * 1. 定位 Organizations 区块与 "+N more" 元素；
 * 2. 通过 background service worker 调用自建 API 拿到全部公开组织，
 *    过滤掉页面已展示的，得到隐藏组织列表；
 * 3. 点击 "+N more" 时按 GitHub 原生 DOM 结构注入隐藏组织头像
 *    （自带 data-hovercard-url，悬停事件由 GitHub 自己的 JS 处理）。
 */

interface OrgInfo {
  username: string
  lable: string
  avatar: string
  description?: string
  html_url?: string
  join_time?: string
}

// TODO(M4): 生产部署后替换为正式 API 域名
const CACHE_PREFIX = 'guo:orgs:'
const CACHE_TTL_MS = 30 * 60 * 1000
const RESCAN_DEBOUNCE_MS = 300
const FETCH_FAILURE_COOLDOWN_MS = 60_000

// ---------------------------------------------------------------------------
// 用户名解析
// ---------------------------------------------------------------------------

/** GitHub 一级路径中的保留前缀，命中则说明当前不在用户/组织主页 */
const RESERVED_PATHS = new Set([
  'about',
  'account',
  'apps',
  'collections',
  'codespaces',
  'customer-stories',
  'dashboard',
  'enterprise',
  'explore',
  'features',
  'feed',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'settings',
  'site',
  'sponsors',
  'topics',
  'trending',
  'watching',
])

function getProfileUsername(pathname: string = location.pathname): string | null {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first || RESERVED_PATHS.has(first.toLowerCase()))
    return null
  return decodeURIComponent(first)
}

// ---------------------------------------------------------------------------
// Organizations 区块发现（所有与 GitHub DOM 耦合的代码集中在此）
// ---------------------------------------------------------------------------

/** "+N more" 文案（兼容本地化空白差异，不匹配具体语言） */
const MORE_TEXT_RE = /^\+\s*\d+\s+more$/u

interface OrgSection {
  /** 包含原生组织头像与 "+N more" 文本的容器元素 */
  container: HTMLElement
  /** "+N more" 元素（匿名态为 span，登录态可能是 a），找不到时为 null */
  moreEl: HTMLElement | null
}

/** 从锚点/标题向上寻找包含组织头像（img）的最近祖先作为区块容器 */
function resolveContainer(node: Element): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement
  for (let depth = 0; current && depth < 6; depth++) {
    if (current.querySelector('img'))
      return current
    current = current.parentElement
  }
  return null
}

/** 在容器内寻找文本为 "+N more" 的最内层元素 */
function findMoreElement(container: HTMLElement): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0)
      continue
    if (MORE_TEXT_RE.test(el.textContent?.trim() ?? ''))
      return el
  }
  return null
}

function findOrgSection(): OrgSection | null {
  // 策略 1："+N more" 链接（部分登录态下 href 以 ?tab=organizations 结尾）
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href$="?tab=organizations"]')) {
    if (MORE_TEXT_RE.test(link.textContent?.trim() ?? '')) {
      const container = resolveContainer(link)
      if (container)
        return { container, moreEl: link }
    }
  }

  // 策略 2：真实 DOM 的 <h2>Organizations</h2>（匿名态没有 tab 链接，靠它兜底）
  for (const heading of document.querySelectorAll<HTMLElement>('h2, h3')) {
    if ((heading.textContent?.trim() ?? '') === 'Organizations') {
      const container = resolveContainer(heading)
      if (container)
        return { container, moreEl: findMoreElement(container) }
    }
  }

  return null
}

/** 从站内单段路径链接（如 /{org}）解析 login */
function loginFromHref(href: string): string | null {
  try {
    const url = new URL(href, location.origin)
    if (url.origin !== location.origin)
      return null
    const [first] = url.pathname.split('/').filter(Boolean)
    return first ? decodeURIComponent(first) : null
  }
  catch {
    return null
  }
}

/** 容器内已展示的组织 login 集合 */
function existingLogins(container: HTMLElement): Set<string> {
  const set = new Set<string>()
  for (const a of container.querySelectorAll<HTMLAnchorElement>('a.avatar-group-item[href]')) {
    const login = loginFromHref(a.getAttribute('href') ?? '')
    if (login)
      set.add(login.toLowerCase())
  }
  return set
}

// ---------------------------------------------------------------------------
// 数据获取：content script 的 fetch 以 github.com 源发起、受 CORS 限制，
// 因此实际请求由 background service worker 代理（见 background.ts）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 诊断日志：全链路打点，DevTools Console 里按 [GUO] 过滤即可定位失败环节
// ---------------------------------------------------------------------------

const log = (...args: unknown[]): void => console.info('%c[GUO]', 'color:#0969da;font-weight:bold', ...args)

function readCache(username: string): OrgInfo[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + username)
    if (!raw)
      return null
    const entry = JSON.parse(raw) as { time: number, data: OrgInfo[] }
    if (!Array.isArray(entry.data) || Date.now() - entry.time > CACHE_TTL_MS)
      return null
    return entry.data
  }
  catch {
    return null
  }
}

function writeCache(username: string, data: OrgInfo[]): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + username, JSON.stringify({ time: Date.now(), data }))
  }
  catch {
    // 存储不可用（隐私模式等）时静默降级
  }
}

async function fetchOrgs(username: string): Promise<OrgInfo[]> {
  const cached = readCache(username)
  if (cached) {
    log(`命中缓存 ${username}：${cached.length} 个组织`)
    return cached
  }

  log(`请求 API：${username}`)
  try {
    const res = await chrome.runtime.sendMessage({ type: 'guo:fetch-orgs', username })
    if (!res?.ok)
      throw new Error(res?.error ?? 'background 未响应（扩展可能刚重载，请刷新页面）')
    const data = res.data as OrgInfo[]
    if (!Array.isArray(data))
      throw new Error('API 响应格式异常')
    log(`API 成功：${data.length} 个组织`)
    writeCache(username, data)
    return data
  }
  catch (err) {
    console.error('[GUO] API 失败：', err)
    throw err
  }
}

// ---------------------------------------------------------------------------
// 注入：按 GitHub 原生 DOM 结构构造头像链接，悬停完全交给原生 hovercard
// ---------------------------------------------------------------------------

/** 复刻原生 a.avatar-group-item 结构，data-hovercard-url 是原生悬停卡片的入口 */
function createOrgLink(org: OrgInfo): HTMLAnchorElement {
  const login = org.username
  const a = document.createElement('a')
  a.className = 'avatar-group-item'
  a.href = `/${login}`
  a.setAttribute('aria-label', org.lable || login)
  a.setAttribute('itemprop', 'follows')
  a.setAttribute('data-hovercard-type', 'organization')
  a.setAttribute('data-hovercard-url', `/orgs/${login}/hovercard`)
  a.setAttribute('data-octo-click', 'hovercard-link-click')
  a.setAttribute('data-octo-dimensions', 'link_type:self')

  const img = document.createElement('img')
  img.className = 'avatar'
  img.alt = `@${login}`
  img.width = 32
  img.height = 32
  img.setAttribute('size', '32')
  img.src = org.avatar.includes('?') ? `${org.avatar}&s=64` : `${org.avatar}?s=64`
  a.append(img)
  return a
}

/** moreEl 在 container 内的顶层包装（原生为一个 div.d-inline-block），作为插入点 */
function topLevelWrapper(el: HTMLElement, container: HTMLElement): Element {
  let node: Element = el
  while (node.parentElement && node.parentElement !== container)
    node = node.parentElement
  return node
}

interface InjectedState {
  container: HTMLElement
  moreEl: HTMLElement
  insertMarker: Element | null
  orgs: OrgInfo[]
  injected: HTMLAnchorElement[]
  expanded: boolean
  onMoreClick: ((e: MouseEvent) => void) | null
}

let state: InjectedState | null = null
let enhancedUsername: string | null = null

function expand(s: InjectedState): void {
  if (s.expanded)
    return
  const frag = document.createDocumentFragment()
  for (const org of s.orgs) {
    const a = createOrgLink(org)
    s.injected.push(a)
    // 原生头像的水平间距靠元素间空白文本节点（inline-block 空格），必须一并补上
    frag.append(a, ' ')
  }
  if (s.insertMarker)
    s.container.insertBefore(frag, s.insertMarker)
  else
    s.container.append(frag)
  s.moreEl.style.display = 'none'
  s.expanded = true
  log(`展开：注入 ${s.injected.length} 个头像`)
}

function collapse(s: InjectedState): void {
  for (const a of s.injected)
    a.remove()
  s.injected = []
  s.moreEl.style.display = ''
  s.expanded = false
}

function bindMoreInteraction(s: InjectedState): void {
  const el = s.moreEl
  // 原生 span 无任何交互样式，补一个指针光标；a/button 本身可聚焦则不动
  if (!(el instanceof HTMLAnchorElement) && !(el instanceof HTMLButtonElement))
    el.style.cursor = 'pointer'

  s.onMoreClick = (e) => {
    if (e.defaultPrevented)
      return
    // 修饰键点击 a 时保留原生跳转（组织 Tab 页）
    if (el instanceof HTMLAnchorElement && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))
      return
    e.preventDefault()
    e.stopPropagation()
    if (s.expanded)
      collapse(s)
    else
      expand(s)
  }
  el.addEventListener('click', s.onMoreClick, true)
}

function teardown(): void {
  if (state) {
    try {
      if (state.onMoreClick)
        state.moreEl.removeEventListener('click', state.onMoreClick, true)
      state.moreEl.style.display = ''
      state.moreEl.style.cursor = ''
      for (const a of state.injected)
        a.remove()
    }
    catch {}
  }
  state = null
  enhancedUsername = null
}

// ---------------------------------------------------------------------------
// 扫描调度：首次执行 + MutationObserver 自愈 + GitHub 软导航兜底
// ---------------------------------------------------------------------------

let scanToken = 0
let scanTimer: ReturnType<typeof setTimeout> | undefined
const orgCache = new Map<string, OrgInfo[]>()
const failedUntil = new Map<string, number>()

async function scan(): Promise<void> {
  const token = ++scanToken
  const username = getProfileUsername()

  // 同一主页且注入仍然存活时跳过（自身注入触发的 MutationObserver 会再次进入这里）
  if (username && username === enhancedUsername && state?.container.isConnected)
    return

  teardown()
  if (!username) {
    log('非用户主页，跳过')
    return
  }
  log(`扫描：${username}`)

  const section = findOrgSection()
  if (!section) {
    log('未找到 Organizations 区块（页面结构可能变化，或当前页无组织）')
    return
  }
  if (!section.moreEl) {
    log('找到区块但没有 "+N more"，视为已展示全部组织')
    return
  }

  let orgs = orgCache.get(username)
  if (!orgs) {
    if ((failedUntil.get(username) ?? 0) > Date.now()) {
      log('API 失败冷却期内，本轮跳过')
      return
    }
    try {
      orgs = await fetchOrgs(username)
      orgCache.set(username, orgs)
    }
    catch {
      // 静默降级：保留原生 "+N more"，冷却期内不再重试
      failedUntil.set(username, Date.now() + FETCH_FAILURE_COOLDOWN_MS)
      return
    }
  }
  if (token !== scanToken)
    return // 扫描期间发生了导航，丢弃本次结果

  const shown = existingLogins(section.container)
  const extra = orgs.filter(o => !shown.has(o.username.toLowerCase()))
  if (extra.length === 0) {
    log(`API 返回 ${orgs.length} 个组织，页面已全部展示`)
    return
  }

  state = {
    container: section.container,
    moreEl: section.moreEl,
    insertMarker: topLevelWrapper(section.moreEl, section.container),
    orgs: extra,
    injected: [],
    expanded: false,
    onMoreClick: null,
  }
  bindMoreInteraction(state)
  enhancedUsername = username
  // 默认展开：数据到手后立即注入全部隐藏组织，无需点击 "+N more"
  expand(state)
}

function scheduleScan(): void {
  clearTimeout(scanTimer)
  scanTimer = setTimeout(() => {
    void scan()
  }, RESCAN_DEBOUNCE_MS)
}

const observer = new MutationObserver(scheduleScan)
observer.observe(document.body, { childList: true, subtree: true })

// GitHub 软导航事件（多事件并听，运行时探测可用者）+ 浏览器历史导航兜底
const onNavigate = (): void => {
  teardown()
  scheduleScan()
}
const navEvents = ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const
for (const type of navEvents)
  addEventListener(type, onNavigate, true)

void scan()
