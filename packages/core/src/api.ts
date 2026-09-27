import type { FetchOrgsResponse, OrgInfo } from './types'

const CACHE_TTL_MS = 30 * 60 * 1000
const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'guo:orgs:'
export const GITHUB_USERNAME_RE = /^[\w-]{1,39}$/u

export interface ApiOrg {
  avatar?: string
  lable?: string
  username?: string
}

interface CacheEntry {
  data: OrgInfo[]
  storedAt: number
}

/** A platform-specific request implementation (GM_xmlhttpRequest, extension messaging, ...). */
export type OrgTransport = (username: string) => Promise<FetchOrgsResponse>

export function normalizeOrgInfo(value: ApiOrg): OrgInfo | false {
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

/**
 * Wrap a platform transport with sessionStorage caching and inflight request
 * deduplication. A recent stale cache is used on transient failures.
 * `cacheScope` keeps cache entries apart when transports target different APIs.
 */
export function createOrgRequester(requestApi: OrgTransport, cacheScope = ''): OrgTransport {
  function cacheKey(username: string): string {
    return `${CACHE_PREFIX}${cacheScope}${username.toLowerCase()}`
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

  const inflight = new Map<string, Promise<FetchOrgsResponse>>()

  return function requestOrganizations(username: string): Promise<FetchOrgsResponse> {
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
}
