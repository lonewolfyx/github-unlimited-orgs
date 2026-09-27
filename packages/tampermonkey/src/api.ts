import type { FetchOrgsResponse, OrgInfo } from './types'

const API_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 30 * 60 * 1000
const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'guo:public-orgs:'
const PAGE_SIZE = 100
const GITHUB_USERNAME_RE = /^[\w-]{1,39}$/u

interface GitHubOrg {
  avatar_url?: unknown
  login?: unknown
}

interface CacheEntry {
  data: OrgInfo[]
  storedAt: number
}

function normalizeOrgInfo(value: unknown): OrgInfo | false {
  if (!value || typeof value !== 'object')
    return false
  const candidate = value as GitHubOrg
  if (typeof candidate.login !== 'string' || candidate.login.length === 0)
    return false
  if (typeof candidate.avatar_url !== 'string' || candidate.avatar_url.length === 0)
    return false
  return {
    username: candidate.login,
    lable: candidate.login,
    avatar: candidate.avatar_url,
  }
}

function cacheKey(username: string): string {
  return `${CACHE_PREFIX}${username.toLowerCase()}`
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

function requestPage(username: string, page: number): Promise<FetchOrgsResponse> {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/orgs?per_page=${PAGE_SIZE}&page=${page}`
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
            const detail = response.status === 403 || response.status === 429
              ? 'GitHub API rate limit reached'
              : `GitHub API request failed: HTTP ${response.status}`
            finish({ ok: false, error: detail })
            return
          }

          let payload: unknown = response.response
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload)
            }
            catch {
              finish({ ok: false, error: 'Unexpected GitHub API response format' })
              return
            }
          }
          if (!Array.isArray(payload)) {
            finish({ ok: false, error: 'Unexpected GitHub API response format' })
            return
          }
          finish({
            ok: true,
            data: payload.map(normalizeOrgInfo).filter((org): org is OrgInfo => Boolean(org)),
          })
        },
        onerror() {
          finish({ ok: false, error: 'GitHub API request failed' })
        },
        ontimeout() {
          finish({ ok: false, error: 'GitHub API request timed out' })
        },
        onabort() {
          finish({ ok: false, error: 'GitHub API request was aborted' })
        },
      })
    }
    catch {
      finish({ ok: false, error: 'Tampermonkey could not start the GitHub API request' })
    }
  })
}

const inflight = new Map<string, Promise<FetchOrgsResponse>>()

/** Fetch every public organization page and use a recent stale cache on transient failures. */
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
    const data: OrgInfo[] = []
    for (let page = 1; ; page++) {
      const response = await requestPage(normalized, page)
      if (!response.ok) {
        const stale = readCache(normalized, STALE_CACHE_TTL_MS)
        return stale ? { ok: true, data: stale } : response
      }
      data.push(...response.data)
      if (response.data.length < PAGE_SIZE)
        break
    }
    writeCache(normalized, data)
    return { ok: true, data }
  })()

  inflight.set(normalized, promise)
  void promise.finally(() => inflight.delete(normalized))
  return promise
}
