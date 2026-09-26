import type { FetchOrgsResponse, OrgInfo } from './types'

const API_TIMEOUT_MS = 10_000
const GITHUB_USERNAME_RE = /^[\w-]{1,39}$/u

function normalizeOrgInfo(value: unknown): OrgInfo | false {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<OrgInfo>
  if (typeof candidate.username !== 'string' || candidate.username.length === 0)
    return false
  if (typeof candidate.avatar !== 'string' || candidate.avatar.length === 0)
    return false

  return {
    username: candidate.username,
    lable: typeof candidate.lable === 'string' && candidate.lable.length > 0
      ? candidate.lable
      : candidate.username,
    avatar: candidate.avatar,
  }
}

export function requestOrganizations(username: string, apiBase: string): Promise<FetchOrgsResponse> {
  if (!GITHUB_USERNAME_RE.test(username))
    return Promise.resolve({ ok: false, error: 'Invalid GitHub username' })

  const url = `${apiBase.replace(/\/+$/u, '')}/${encodeURIComponent(username)}`

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: FetchOrgsResponse): void => {
      if (settled)
        return
      settled = true
      resolve(result)
    }

    try {
      GM_xmlhttpRequest<unknown>({
        method: 'GET',
        url,
        responseType: 'json',
        timeout: API_TIMEOUT_MS,
        anonymous: true,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            finish({ ok: false, error: `API request failed: HTTP ${response.status}` })
            return
          }

          let payload: unknown = response.response
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload)
            }
            catch {
              finish({ ok: false, error: 'Unexpected API response format' })
              return
            }
          }
          if (!Array.isArray(payload)) {
            finish({ ok: false, error: 'Unexpected API response format' })
            return
          }

          const data = payload
            .map(normalizeOrgInfo)
            .filter((org): org is OrgInfo => Boolean(org))
          finish({ ok: true, data })
        },
        onerror() {
          finish({ ok: false, error: 'API request failed' })
        },
        ontimeout() {
          finish({ ok: false, error: 'API request timed out' })
        },
        onabort() {
          finish({ ok: false, error: 'API request was aborted' })
        },
      })
    }
    catch {
      finish({ ok: false, error: 'Tampermonkey could not start the API request' })
    }
  })
}
