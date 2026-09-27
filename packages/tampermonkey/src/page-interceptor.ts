import { mainWorldInterceptor, PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE } from '@github-unlimited-orgs/core'

export function installPageInterceptor(): void {
  const source = `;(${mainWorldInterceptor.toString()})(${JSON.stringify(PANEL_MESSAGE_TYPE)},${JSON.stringify(PANEL_REQUEST_TYPE)});`
  const script = GM_addElement('script', { textContent: source })
  script?.remove()
}
