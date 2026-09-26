/**
 * MV3 service worker that proxies organization data requests.
 *
 * In MV3, fetch requests from the content script use the page origin
 * (https://github.com) and are subject to CORS restrictions. Requests from the
 * background service worker use the manifest's host_permissions and are not
 * subject to those restrictions, so organization requests are forwarded to the
 * custom API here.
 */

// TODO(M4): Replace this with the production API domain after deployment and
// allow it to be overridden through chrome.storage.sync.
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
          error: `API request failed: HTTP ${res.status}`,
        } satisfies FetchResponse)
        return
      }
      const data = await res.json() as object[]
      if (!Array.isArray(data)) {
        sendResponse({ ok: false, error: 'Unexpected API response format' } satisfies FetchResponse)
        return
      }
      sendResponse({ ok: true, data } satisfies FetchResponse)
    })
    .catch(() => {
      sendResponse({ ok: false, error: 'API request failed' } satisfies FetchResponse)
    })

  return true // Keep the message channel open for the asynchronous sendResponse call.
})
