import type { OrgInfo } from '../types'
import { cardStyles } from '../styles'

const SHOW_DELAY_MS = 150
const HIDE_DELAY_MS = 150
const VIEWPORT_MARGIN = 8
const GAP = 8

let host: HTMLDivElement | null = null
let cardEl: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function formatDate(iso?: string | null): string {
  if (!iso)
    return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return `Joined ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}

/** 创建全局唯一的卡片宿主（Shadow DOM 隔离），重复调用直接复用 */
function ensureCard(): HTMLElement {
  if (cardEl)
    return cardEl

  host = document.createElement('div')
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = cardStyles
  shadow.append(style)

  cardEl = document.createElement('div')
  cardEl.className = 'guo-card'
  cardEl.setAttribute('role', 'tooltip')
  cardEl.style.display = 'none'
  // 鼠标移入卡片期间保持显示，移出后按缓冲时间隐藏
  cardEl.addEventListener('mouseenter', () => clearTimeout(hideTimer))
  cardEl.addEventListener('mouseleave', scheduleHide)
  shadow.append(cardEl)

  document.documentElement.append(host)
  return cardEl
}

function renderCard(card: HTMLElement, org: OrgInfo): void {
  const joinText = formatDate(org.join_time)
  card.innerHTML = `
    <img class="guo-card__avatar" src="${escapeHtml(org.avatar)}" alt="">
    <div class="guo-card__body">
      <div class="guo-card__label">${escapeHtml(org.lable || org.username)}</div>
      <div class="guo-card__username">${escapeHtml(org.username)}</div>
      ${org.description ? `<div class="guo-card__desc">${escapeHtml(org.description)}</div>` : ''}
      ${joinText ? `<div class="guo-card__join">${escapeHtml(joinText)}</div>` : ''}
      <a class="guo-card__link" href="${escapeHtml(org.html_url)}" target="_blank" rel="noopener noreferrer">View organization</a>
    </div>`
}

function positionCard(target: Element): void {
  if (!host || !cardEl)
    return
  const rect = target.getBoundingClientRect()
  const width = cardEl.offsetWidth
  const height = cardEl.offsetHeight

  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    Math.max(window.innerWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
  )
  let top = rect.bottom + GAP
  if (top + height > window.innerHeight - VIEWPORT_MARGIN)
    top = Math.max(rect.top - height - GAP, VIEWPORT_MARGIN)

  host.style.left = `${left}px`
  host.style.top = `${top}px`
}

export function showHoverCard(org: OrgInfo, target: Element): void {
  const card = ensureCard()
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  renderCard(card, org)
  card.style.display = 'flex'
  positionCard(target)
}

export function scheduleShow(org: OrgInfo, target: Element): void {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  showTimer = setTimeout(showHoverCard, SHOW_DELAY_MS, org, target)
}

export function scheduleHide(): void {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(hideHoverCard, HIDE_DELAY_MS)
}

export function hideHoverCard(): void {
  clearTimeout(showTimer)
  if (cardEl)
    cardEl.style.display = 'none'
}
