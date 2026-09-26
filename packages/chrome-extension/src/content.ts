/**
 * GitHub Unlimited Orgs — content script（子项目独立实现，不依赖 workspace 其他包）
 *
 * 页面分类（本次需求的核心判定，封装在 findOrgSection/findEntry 中）：
 * - self  ：登录用户访问自身主页。特征是组织区块尾部出现 "View all" 链接
 *   （href=/settings/organizations）。组织数据来自劫持的 GitHub 自有接口
 *   /_side-panels/user.json（见 main-world.ts），不调用自建 API。
 * - other ：三方用户页面。特征是组织区块尾部出现 "+N more" 文本。
 *   组织数据来自自建 API（实时请求，不做任何缓存）。
 * - none  ：两种入口都不存在（页面已展示全部组织），不做任何事。
 *
 * 劫持驱动时机：main-world.js 以 MAIN world + document_start 注入，
 * 在页面开始加载时就 patch 好 fetch，保证 GitHub 首次发出 side-panel
 * 请求时即可拦截到响应（postMessage 转发给本脚本）。
 *
 * 注入规则：先过滤掉页面已展示的组织，再按 GitHub 原生 DOM 结构注入
 * 剩余组织头像 —— 携带 data-hovercard-url，悬停卡片由 GitHub 原生事件
 * 委托处理（本脚本不绑定任何 hover 事件、不实现卡片）；头像之间补
 * 空白文本节点以保持原生 inline-block 间距；注入后自动展开并隐藏入口。
 */

interface OrgInfo {
  username: string
  lable: string
  avatar: string
  description?: string
  html_url?: string
  join_time?: string
}

/** /_side-panels/user.json 响应中与本扩展相关的部分 */
interface SidePanelData {
  userStatus?: {
    organizationOptions?: Array<{
      label: string
      value: number
      globalRelayId: string
    }>
  }
}

const RESCAN_DEBOUNCE_MS = 300
/** 三方页面 API 失败后的内存级冷却（防 MutationObserver 反复触发打爆接口） */
const FETCH_FAILURE_COOLDOWN_MS = 60_000
const PANEL_MESSAGE_TYPE = 'guo:side-panel'
const PANEL_REQUEST_TYPE = 'guo:panel-request'
/** 自身页面等待劫持数据到达的最长时间，超时放弃（不回落自建 API） */
const PANEL_WAIT_MS = 8_000

// ---------------------------------------------------------------------------
// 诊断日志：DevTools Console 按 [GUO] 过滤
// ---------------------------------------------------------------------------

const log = (...args: unknown[]): void => console.info('%c[GUO]', 'color:#0969da;font-weight:bold', ...args)

declare const __GUO_BUILD__: string
log(`content script 已加载（build ${__GUO_BUILD__}）`)

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

/** 展开入口类型：self = View all（登录用户自身页面）；other = +N more（三方用户页面） */
type EntryKind = 'self' | 'other'

interface OrgSection {
  /** 包含原生组织头像与展开入口的容器元素 */
  container: HTMLElement
  /** 入口元素（"View all" 链接或 "+N more" 文本） */
  entry: HTMLElement
  kind: EntryKind
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

/**
 * 识别组织区块的展开入口（页面分类的核心判定）：
 * - "+N more" 最内层文本元素 → other（三方用户页面）
 * - "View all" 链接（登录用户看自己主页时才有）→ self
 */
function findEntry(container: HTMLElement): { el: HTMLElement, kind: EntryKind } | null {
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0)
      continue
    if (MORE_TEXT_RE.test(el.textContent?.trim() ?? ''))
      return { el, kind: 'other' }
  }
  const viewAll = container.querySelector<HTMLElement>('a[href="/settings/organizations"]')
  if (viewAll)
    return { el: viewAll, kind: 'self' }
  return null
}

function findOrgSection(): OrgSection | null {
  // 策略 1："+N more" 链接（部分登录态下 href 以 ?tab=organizations 结尾）
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href$="?tab=organizations"]')) {
    if (MORE_TEXT_RE.test(link.textContent?.trim() ?? '')) {
      const container = resolveContainer(link)
      if (container)
        return { container, entry: link, kind: 'other' }
    }
  }

  // 策略 2：真实 DOM 的 <h2>Organizations</h2>（匿名态与新版页面均无 tab 链接）
  for (const heading of document.querySelectorAll<HTMLElement>('h2, h3')) {
    if ((heading.textContent?.trim() ?? '') === 'Organizations') {
      const container = resolveContainer(heading)
      if (container) {
        const entry = findEntry(container)
        if (entry)
          return { container, entry: entry.el, kind: entry.kind }
      }
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

/** 容器内已展示的组织 login 集合（注入前过滤用） */
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
// 数据通道 A（self 页面）：劫持的 side-panel 数据
// ---------------------------------------------------------------------------

/** 最近一次劫持到的 organizationOptions（消费后置空，避免串页复用） */
let latestPanelOptions: Array<{ label: string, value: number }> | null = null
/** 劫持数据所属的页面用户名（消费前校验，防止跨页串数据） */
let panelPageUsername: string | null = null
/** 首次进入等待流程的时间戳，用于超时放弃 */
let panelWaitStart = 0

// ---------------------------------------------------------------------------
// 注入状态（声明在消息监听之前，供其引用）
// ---------------------------------------------------------------------------

let state: InjectedState | null = null
let enhancedUsername: string | null = null

window.addEventListener('message', (e) => {
  if (e.source !== window || (e.data as { type?: string } | null)?.type !== PANEL_MESSAGE_TYPE)
    return
  // 已注入（或正在处理）时忽略重复响应，避免 GitHub 重发导致反复重建
  if (state)
    return
  // 劫持数据只对自身页面（View all 入口）有意义：
  // 三方页面（+N more）走自建 API，忽略 panel 响应，不让它触发重扫
  const section = findOrgSection()
  if (!section || section.kind !== 'self')
    return
  const data = (e.data as { data?: SidePanelData }).data
  const options = data?.userStatus?.organizationOptions
  if (!Array.isArray(options))
    return
  latestPanelOptions = options.map(o => ({ label: o.label, value: o.value }))
  panelPageUsername = getProfileUsername()
  log(`劫持 side-panel 响应：${latestPanelOptions.length} 个组织`)
  // 请求晚于 scan 时由此触发下一轮扫描
  scheduleScan()
})

/** 丢弃当前持有的 side-panel 数据：跨页导航后旧数据已无效，非 self 页面也不应消费 */
function dropPanelOptions(): void {
  latestPanelOptions = null
}

/** organizationOptions → OrgInfo[]：label 即 login，value 即组织数据库 ID（可拼头像） */
function orgsFromPanel(options: Array<{ label: string, value: number }>): OrgInfo[] {
  return options.map(o => ({
    username: o.label,
    lable: o.label,
    avatar: `https://avatars.githubusercontent.com/u/${o.value}?s=64&v=4`,
  }))
}

// ---------------------------------------------------------------------------
// 数据通道 B（other 页面）：自建 API，实时请求、不缓存。
// content script 的 fetch 以 github.com 源发起、受 CORS 限制，
// 实际请求由 background service worker 代理（见 background.ts）
// ---------------------------------------------------------------------------

/** 进行中的 API 请求（同用户并发 scan 共享同一 Promise，避免重复请求） */
let inflight: { username: string, promise: Promise<OrgInfo[]> } | null = null

function fetchOrgs(username: string): Promise<OrgInfo[]> {
  if (inflight?.username === username)
    return inflight.promise

  const promise = (async () => {
    const res = await chrome.runtime.sendMessage({ type: 'guo:fetch-orgs', username })
    if (!res?.ok)
      throw new Error(res?.error ?? 'background 未响应（扩展可能刚重载，请刷新页面）')
    const data = res.data as OrgInfo[]
    if (!Array.isArray(data))
      throw new Error('API 响应格式异常')
    return data
  })()

  inflight = { username, promise }
  void promise.finally(() => {
    if (inflight?.promise === promise)
      inflight = null
  })
  return promise
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

/** 入口元素在 container 内的顶层包装（原生为一个 div），作为插入点 */
function topLevelWrapper(el: HTMLElement, container: HTMLElement): Element {
  let node: Element = el
  while (node.parentElement && node.parentElement !== container)
    node = node.parentElement
  return node
}

interface InjectedState {
  container: HTMLElement
  entryEl: HTMLElement
  insertMarker: Element | null
  orgs: OrgInfo[]
  injected: HTMLAnchorElement[]
  expanded: boolean
  onEntryClick: ((e: MouseEvent) => void) | null
}

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
  s.entryEl.style.display = 'none'
  s.expanded = true
  log(`展开：注入 ${s.injected.length} 个头像`)
}

function collapse(s: InjectedState): void {
  for (const a of s.injected)
    a.remove()
  s.injected = []
  s.entryEl.style.display = ''
  s.expanded = false
}

function bindEntryInteraction(s: InjectedState): void {
  const el = s.entryEl
  // 原生 span 无任何交互样式，补一个指针光标；a/button 本身可聚焦则不动
  if (!(el instanceof HTMLAnchorElement) && !(el instanceof HTMLButtonElement))
    el.style.cursor = 'pointer'

  s.onEntryClick = (e) => {
    if (e.defaultPrevented)
      return
    // 修饰键点击 a 时保留原生跳转
    if (el instanceof HTMLAnchorElement && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))
      return
    e.preventDefault()
    e.stopPropagation()
    if (s.expanded)
      collapse(s)
    else
      expand(s)
  }
  el.addEventListener('click', s.onEntryClick, true)
}

function teardown(): void {
  if (state) {
    try {
      if (state.onEntryClick)
        state.entryEl.removeEventListener('click', state.onEntryClick, true)
      state.entryEl.style.display = ''
      state.entryEl.style.cursor = ''
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
const failedUntil = new Map<string, number>()
/** self 页面进入等待态的用户名：等待期间 observer 触发的扫描直接跳过 */
let panelWaitUsername: string | null = null
/** 本次页面会话内最近一次 API 拉取结果（仅用于同页重渲染自愈，跨导航/刷新即失效） */
let lastFetched: { username: string, orgs: OrgInfo[] } | null = null

async function scan(): Promise<void> {
  const username = getProfileUsername()

  // 守卫 1：同一主页且注入仍然完整存活时跳过；
  // 若页面重渲染撕掉了注入头像（容器还在），守卫失效以触发自愈重注入
  if (username && username === enhancedUsername && state
    && state.injected.length > 0 && state.injected.every(a => a.isConnected)
    && !latestPanelOptions) {
    return
  }
  // 守卫 2：self 页面已进入等待态，劫持数据到达前无需重扫（消息到达会主动触发）
  if (username && username === panelWaitUsername && !latestPanelOptions && !state)
    return
  // 守卫 3：该页面的 API 请求正在飞行中，本轮 scan 等它返回后自然完成注入，无需并发重扫
  if (username && inflight?.username === username && !latestPanelOptions)
    return

  // 通过守卫后才登记本轮 token：被守卫拦下的扫描不得使在飞结果失效
  const token = ++scanToken

  teardown()
  panelWaitStart = 0
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

  let orgs: OrgInfo[] | undefined

  if (section.kind === 'self') {
    // 自身登录页面：只消费劫持数据，不调用自建 API
    if (latestPanelOptions && panelPageUsername === username) {
      orgs = orgsFromPanel(latestPanelOptions)
      latestPanelOptions = null
      panelWaitUsername = null
      log(`劫持数据通道：${orgs.length} 个组织`)
    }
    else if (!panelWaitStart) {
      panelWaitStart = Date.now()
      panelWaitUsername = username
      // 主动向 main-world 索取回放：劫持可能发生在本脚本注入之前（页面加载早期）
      window.postMessage({ type: PANEL_REQUEST_TYPE }, '*')
      log('等待 GitHub side-panel 数据…')
      return // 回放/新响应到达后 scheduleScan 会再次进入
    }
    else {
      log(`等待超时（${PANEL_WAIT_MS}ms），放弃注入（自身页面不调用自建 API）`)
      panelWaitUsername = null
      return
    }
  }
  else {
    // 三方用户页面：实时调用自建 API（不缓存）。
    // 例外：同一次页面会话内刚拉取过（GitHub 重渲染撕掉了注入需要自愈），
    // 复用本次会话的数据直接重注入，不算缓存、跨导航/刷新后必然重新请求。
    if (lastFetched && lastFetched.username === username) {
      orgs = lastFetched.orgs
      log(`复用本次会话数据：${orgs.length} 个组织`)
    }
    else {
      // 手上若还持有别的页面劫持的 panel 数据，在这里一并丢弃，
      // 否则它会一直让"已注入跳过"守卫失效，导致反复 teardown + 重复请求。
      dropPanelOptions()
      if ((failedUntil.get(username) ?? 0) > Date.now()) {
        log('API 失败冷却期内，本轮跳过')
        return
      }
      try {
        orgs = await fetchOrgs(username)
        lastFetched = { username, orgs }
      }
      catch (err) {
        console.error('[GUO] API 失败：', err)
        failedUntil.set(username, Date.now() + FETCH_FAILURE_COOLDOWN_MS)
        return
      }
    }
  }

  if (token !== scanToken)
    return // 扫描期间发生了导航，丢弃本次结果
  if (!orgs)
    return // 两条通道都未产出数据（理论上不可达）

  // 结果日志在 token 校验之后打，保证即使并发 scan 共享了同一请求也只记录一次
  if (section.kind === 'other')
    log(`API 实时返回：${orgs.length} 个组织`)

  // 过滤掉页面已展示的组织，只注入缺失部分
  const shown = existingLogins(section.container)
  const extra = orgs.filter(o => !shown.has(o.username.toLowerCase()))
  if (extra.length === 0) {
    log(`共 ${orgs.length} 个组织，页面已全部展示`)
    return
  }

  state = {
    container: section.container,
    entryEl: section.entry,
    insertMarker: topLevelWrapper(section.entry, section.container),
    orgs: extra,
    injected: [],
    expanded: false,
    onEntryClick: null,
  }
  bindEntryInteraction(state)
  enhancedUsername = username
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
  const currentUsername = getProfileUsername()
  const samePage = currentUsername !== null
    && (currentUsername === enhancedUsername || currentUsername === panelWaitUsername)
  teardown()
  if (!samePage) {
    // 跨页导航：旧页面的劫持数据与等待态一并作废；
    // 同页软导航噪音（用户名未变）则全部保留，避免反复重置等待态
    dropPanelOptions()
    panelWaitUsername = null
  }
  scheduleScan()
}
const navEvents = ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const
for (const type of navEvents)
  addEventListener(type, onNavigate, true)

void scan()
