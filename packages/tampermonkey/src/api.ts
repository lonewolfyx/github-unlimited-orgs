import type { FetchOrgsResponse, OrgInfo } from './types'

const API_TIMEOUT_MS = 10_000
const API_BASE_URL = 'http://localhost:3000'
const CACHE_TTL_MS = 30 * 60 * 1000
const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'guo:orgs:'
const GITHUB_USERNAME_RE = /^[\w-]{1,39}$/u

interface ApiOrg {
  avatar?: string
  lable?: string
  username?: string
}

interface CacheEntry {
  data: OrgInfo[]
  storedAt: number
}

function normalizeOrgInfo(value: ApiOrg): OrgInfo | false {
  if (typeof value.username !== 'string' || value.username.length === 0)
    return false
  if (typeof value.avatar !== 'string' || value.avatar.length === 0)
    return false
  return {
    username: value.username,
    lable: typeof value.lable === 'string' && value.lable.length > 0
      ? value.lable
      : value.username,
    avatar: value.avatar,
  }
}

function cacheKey(username: string): string {
  return `${CACHE_PREFIX}${API_BASE_URL}:${username.toLowerCase()}`
}

function readCache(username: string, maxAge: number): OrgInfo[] | false {
  try {
    const raw = sessionStorage.getItem(cacheKey(username))
    if (!raw)
      return false
    const entry = JSON.parse(raw) as CacheEntry
    if (!Array.isArray(entry.data) || !Number.isFinite(entry.storedAt) || Date.now() - entry.storedAt > maxAge)
      return false
    return entry.data
  }
  catch {
    return false
  }
}

function writeCache(username: string, data: OrgInfo[]): void {
  try {
    sessionStorage.setItem(cacheKey(username), JSON.stringify({ data, storedAt: Date.now() } satisfies CacheEntry))
  }
  catch {}
}

function requestApi(username: string): Promise<FetchOrgsResponse> {
  const url = `${API_BASE_URL}/${encodeURIComponent(username)}`
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: FetchOrgsResponse): void => {
      if (settled)
        return
      settled = true
      resolve(result)
    }

    try {
      GM_xmlhttpRequest<ApiOrg[]>({
        method: 'GET',
        url,
        responseType: 'json',
        timeout: API_TIMEOUT_MS,
        anonymous: true,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            finish({ ok: false, error: `Organization API request failed: HTTP ${response.status}` })
            return
          }

          const payload = response.response
          if (!Array.isArray(payload)) {
            finish({ ok: false, error: 'Unexpected organization API response format' })
            return
          }
          finish({
            ok: true,
            data: payload.map(normalizeOrgInfo).filter((org): org is OrgInfo => Boolean(org)),
          })
        },
        onerror() {
          finish({ ok: false, error: 'Organization API request failed' })
        },
        ontimeout() {
          finish({ ok: false, error: 'Organization API request timed out' })
        },
        onabort() {
          finish({ ok: false, error: 'Organization API request was aborted' })
        },
      })
    }
    catch {
      finish({ ok: false, error: 'Tampermonkey could not start the organization API request' })
    }
  })
}

const inflight = new Map<string, Promise<FetchOrgsResponse>>()

/** Fetch a user's organizations from the configured API and use a recent stale cache on transient failures. */
export function requestOrganizations(username: string): Promise<FetchOrgsResponse> {
  if (!GITHUB_USERNAME_RE.test(username))
    return Promise.resolve({ ok: false, error: 'Invalid GitHub username' })

  const normalized = username.toLowerCase()
  const cached = readCache(normalized, CACHE_TTL_MS)
  if (cached)
    return Promise.resolve({ ok: true, data: cached })

  const pending = inflight.get(normalized)
  if (pending)
    return pending

  const promise = (async (): Promise<FetchOrgsResponse> => {
    const response = await requestApi(normalized)
    if (!response.ok) {
      const stale = readCache(normalized, STALE_CACHE_TTL_MS)
      return stale ? { ok: true, data: stale } : response
    }
    writeCache(normalized, response.data)
    return response
  })()

  inflight.set(normalized, promise)
  void promise.finally(() => inflight.delete(normalized))
  return promise
}
