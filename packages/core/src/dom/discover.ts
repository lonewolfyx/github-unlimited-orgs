// 所有与 GitHub DOM 结构耦合的选择器与正则集中在本文件，页面改版时只需调整这里

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

/** "+N more" 文案（兼容本地化空白差异，不匹配具体语言） */
const MORE_LINK_RE = /^\+\d+\s*more$/u

export function getProfileUsername(pathname: string = location.pathname): string | null {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first || RESERVED_PATHS.has(first.toLowerCase()))
    return null
  return decodeURIComponent(first)
}

export interface OrgSection {
  /** 包含原生组织头像与 "+X more" 链接的容器元素 */
  container: HTMLElement
  /** "+X more" 链接，通过标题回退定位时为 null */
  moreLink: HTMLAnchorElement | null
}

export function findOrganizationsSection(root: ParentNode = document): OrgSection | null {
  // 策略 1：通过 "+N more" 链接定位（href 以 ?tab=organizations 结尾，不受界面本地化影响）
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href$="?tab=organizations"]')) {
    if (MORE_LINK_RE.test(link.textContent?.trim() ?? '')) {
      const container = resolveContainer(link)
      if (container)
        return { container, moreLink: link }
    }
  }

  // 策略 2：回退到 "Organizations" 标题定位
  for (const heading of root.querySelectorAll<HTMLElement>('h2, h3')) {
    if ((heading.textContent?.trim() ?? '') === 'Organizations') {
      const container = resolveContainer(heading)
      if (container)
        return { container, moreLink: null }
    }
  }

  return null
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

/** 从站内单段路径链接（如 /{org}）解析 login */
export function loginFromHref(href: string): string | null {
  try {
    const url = new URL(href, location.origin)
    if (url.origin !== location.origin)
      return null
    const segments = url.pathname.split('/').filter(Boolean)
    const [first] = segments
    return segments.length === 1 && first ? decodeURIComponent(first) : null
  }
  catch {
    return null
  }
}
