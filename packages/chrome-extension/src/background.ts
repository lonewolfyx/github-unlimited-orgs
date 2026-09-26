/**
 * MV3 service worker：代理组织数据请求。
 *
 * MV3 中 content script 的 fetch 以页面源（https://github.com）发起、受 CORS 限制，
 * 而 background 携带 manifest 的 host_permissions 发起请求不受此限制，
 * 因此由这里统一转发到自建 API。
 */

// TODO(M4): 生产部署后替换为正式 API 域名，并通过 chrome.storage.sync 支持覆盖
const API_BASE = 'http://localhost:3000'
const API_TIMEOUT_MS = 10_000

interface FetchOrgsMessage {
  type: 'guo:fetch-orgs'
  username: string
}

type FetchResponse
  = | { ok: true, data: object[] }
    | { ok: false, error: string }

const GITHUB_USERNAME_RE = /^[\w-]{1,39}$/u

chrome.runtime.onMessage.addListener((message: FetchOrgsMessage, _sender, sendResponse) => {
  if (!message || message.type !== 'guo:fetch-orgs' || !GITHUB_USERNAME_RE.test(message.username))
    return

  const url = `${API_BASE}/${encodeURIComponent(message.username)}`
  fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
    .then(async (res) => {
      if (!res.ok) {
        sendResponse({
          ok: false,
          error: `API 请求失败：HTTP ${res.status}`,
        } satisfies FetchResponse)
        return
      }
      const data = await res.json() as object[]
      if (!Array.isArray(data)) {
        sendResponse({ ok: false, error: 'API 响应格式异常' } satisfies FetchResponse)
        return
      }
      sendResponse({ ok: true, data } satisfies FetchResponse)
    })
    .catch(() => {
      sendResponse({ ok: false, error: 'API 请求失败' } satisfies FetchResponse)
    })

  return true // 保持消息通道开启以支持异步 sendResponse
})
