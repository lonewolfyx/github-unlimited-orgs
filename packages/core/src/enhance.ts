import type { OrgListHandle } from './dom/org-list'
import type { OrgInfo } from './types'
import { fetchOrgs } from './api'
import { findOrganizationsSection, getProfileUsername } from './dom/discover'
import { hideHoverCard } from './dom/hover-card'
import { bindOrgHover, createOrgList } from './dom/org-list'

export interface EnhanceOptions {
  /** API 服务基地址，例如 https://your-api.example.com */
  apiBase: string
  /** 是否自动展开全部组织，默认点击 "+X more" 展开 */
  autoExpand?: boolean
}

const RESCAN_DEBOUNCE_MS = 300
const FETCH_FAILURE_COOLDOWN_MS = 60_000

/**
 * 总入口：扫描当前页面的 Organizations 区块并完成展开交互与悬停卡片装配。
 * 宿主（扩展 / 油猴）只需调用一次；返回的函数用于完全清理注入与监听。
 */
export function enhanceOrganizations(options: EnhanceOptions): () => void {
  const { apiBase, autoExpand = false } = options

  const orgCache = new Map<string, OrgInfo[]>()
  const failedUntil = new Map<string, number>()
  let scanToken = 0
  let scanTimer: ReturnType<typeof setTimeout> | undefined
  let handle: OrgListHandle | null = null
  let unbindHover: (() => void) | null = null
  let enhancedUsername: string | null = null

  function teardownPage(): void {
    try {
      handle?.dispose()
    }
    catch {}
    try {
      unbindHover?.()
    }
    catch {}
    handle = null
    unbindHover = null
    enhancedUsername = null
    hideHoverCard()
  }

  async function scan(): Promise<void> {
    const token = ++scanToken
    const username = getProfileUsername()

    // 同一主页且注入仍然存活时跳过（自身注入触发的 MutationObserver 会再次进入这里）
    if (username && username === enhancedUsername && handle?.isAlive())
      return

    teardownPage()
    if (!username)
      return

    const section = findOrganizationsSection()
    if (!section)
      return

    let orgs = orgCache.get(username)
    if (!orgs) {
      if ((failedUntil.get(username) ?? 0) > Date.now())
        return
      try {
        orgs = await fetchOrgs(username, apiBase)
        orgCache.set(username, orgs)
      }
      catch {
        // 静默降级：保留原生 "+X more"，冷却期内不再重试
        failedUntil.set(username, Date.now() + FETCH_FAILURE_COOLDOWN_MS)
        return
      }
    }
    if (token !== scanToken)
      return // 扫描期间发生了导航，丢弃本次结果

    handle = createOrgList(section, orgs, { autoExpand })
    unbindHover = bindOrgHover(section.container, orgs)
    enhancedUsername = username
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
    enhancedUsername = null
    scheduleScan()
  }
  const navEvents = ['turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'] as const
  for (const type of navEvents)
    addEventListener(type, onNavigate, true)

  void scan()

  return () => {
    clearTimeout(scanTimer)
    observer.disconnect()
    for (const type of navEvents)
      removeEventListener(type, onNavigate, true)
    teardownPage()
  }
}
