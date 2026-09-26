/**
 * MV3 service worker：代理组织数据请求。
 *
 * MV3 中 content script 的 fetch 以页面源（https://github.com）发起、受 CORS 限制，
 * 而 background 携带 manifest 的 host_permissions 发起请求不受此限制，
 * 因此由这里统一转发到自建 API。
 */

// TODO(M4): 生产部署后替换为正式 API 域名，并通过 chrome.storage.sync 支持覆盖
const API_BASE = 'http://localhost:3000'

interface FetchOrgsMessage {
  type: 'guo:fetch-orgs'
  username: string
}

interface FetchResponse {
  ok: boolean
  data?: unknown
  error?: string
}

const log = (...args: unknown[]): void => console.info('%c[GUO:bg]', 'color:#8250df;font-weight:bold', ...args)

chrome.runtime.onMessage.addListener((message: Partial<FetchOrgsMessage>, _sender, sendResponse) => {
  if (message?.type !== 'guo:fetch-orgs' || !message.username)
    return

  const url = `${API_BASE}/${encodeURIComponent(message.username)}`
  log(`收到请求，转发到 ${url}`)
  fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        log(`API 返回 ${res.status}`)
        sendResponse({ ok: false, error: `API 请求失败：HTTP ${res.status}` } satisfies FetchResponse)
        return
      }
      const data = await res.json()
      log(`API 成功：${Array.isArray(data) ? `${data.length} 个组织` : '格式异常'}`)
      sendResponse({ ok: true, data } satisfies FetchResponse)
    })
    .catch((err: unknown) => {
      console.error('[GUO:bg] fetch 失败（dev server 是否在运行？）', err)
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies FetchResponse)
    })

  return true // 保持消息通道开启以支持异步 sendResponse
})
