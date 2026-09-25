import type { OrgInfo } from '../types'
import type { OrgSection } from './discover'
import { loginFromHref } from './discover'
import { scheduleHide, scheduleShow } from './hover-card'

const AVATAR_SIZE = 32

export interface OrgListHandle {
  expand: () => void
  collapse: () => void
  readonly expanded: boolean
  /** 展开容器是否仍连接在文档中（用于自愈判断） */
  isAlive: () => boolean
  dispose: () => void
}

export function createOrgList(section: OrgSection, orgs: OrgInfo[], options: { autoExpand?: boolean } = {}): OrgListHandle {
  const { container, moreLink } = section
  let wrapper: HTMLDivElement | null = null

  function buildWrapper(): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'guo-extra-orgs'
    el.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;'
    for (const org of orgs) {
      const link = document.createElement('a')
      link.href = org.html_url
      link.setAttribute('data-guo-org', org.username)
      link.style.cssText = 'display:inline-flex;'
      const img = document.createElement('img')
      img.src = org.avatar
      img.alt = org.lable || org.username
      img.width = AVATAR_SIZE
      img.height = AVATAR_SIZE
      img.style.cssText = `width:${AVATAR_SIZE}px;height:${AVATAR_SIZE}px;border-radius:6px;`
      link.append(img)
      el.append(link)
    }
    return el
  }

  function expand(): void {
    if (!wrapper) {
      wrapper = buildWrapper()
      // 有 "+X more" 链接时插入到其之前（该链接同时被隐藏），否则追加到容器末尾
      if (moreLink?.parentElement)
        moreLink.parentElement.insertBefore(wrapper, moreLink)
      else
        container.append(wrapper)
    }
    if (moreLink)
      moreLink.style.display = 'none'
  }

  function collapse(): void {
    wrapper?.remove()
    wrapper = null
    if (moreLink)
      moreLink.style.display = ''
  }

  function isAlive(): boolean {
    return wrapper?.isConnected ?? false
  }

  // 点击 "+X more" 原位展开/收起；Ctrl/Cmd/Shift 点击保留原生跳转
  function onMoreClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey)
      return
    e.preventDefault()
    if (wrapper)
      collapse()
    else
      expand()
  }
  moreLink?.addEventListener('click', onMoreClick, true)

  if (options.autoExpand)
    expand()

  return {
    expand,
    collapse,
    get expanded() {
      return wrapper !== null
    },
    isAlive,
    dispose() {
      collapse()
      moreLink?.removeEventListener('click', onMoreClick, true)
    },
  }
}

/**
 * 在容器上以事件委托方式绑定组织头像的悬停卡片：
 * 覆盖原生头像与注入头像，login 能在 orgs 数据中命中才显示。
 * 返回解绑函数。
 */
export function bindOrgHover(container: HTMLElement, orgs: OrgInfo[]): () => void {
  const byLogin = new Map(orgs.map(org => [org.username.toLowerCase(), org]))

  const onOver = (e: MouseEvent): void => {
    const target = e.target instanceof Element ? e.target.closest('a[href]') : null
    if (!target || !container.contains(target))
      return
    const login = loginFromHref(target.getAttribute('href') ?? '')
    const org = login ? byLogin.get(login.toLowerCase()) : undefined
    if (org)
      scheduleShow(org, target)
  }
  const onOut = (e: MouseEvent): void => {
    const target = e.target instanceof Element ? e.target.closest('a[href]') : null
    if (target)
      scheduleHide()
  }

  container.addEventListener('mouseover', onOver)
  container.addEventListener('mouseout', onOut)
  return () => {
    container.removeEventListener('mouseover', onOver)
    container.removeEventListener('mouseout', onOut)
    scheduleHide()
  }
}
