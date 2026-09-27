import type { FetchOrgsResponse, OrgInfo } from './types'

const FETCH_ORGS_MESSAGE_TYPE = 'guo:fetch-orgs'
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

interface BackgroundResponse {
  ok: boolean
  data?: ApiOrg[]
  error?: string
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

/**
 * The background service worker owns the API base URL and performs the actual
 * request: content-script fetches run under the github.com origin and would be
 * blocked by CORS, while the worker is covered by manifest host_permissions.
 */
async function requestApi(username: string): Promise<FetchOrgsResponse> {
  let response: BackgroundResponse | false
  try {
    response = await chrome.runtime.sendMessage({
      type: FETCH_ORGS_MESSAGE_TYPE,
      username,
    }) as BackgroundResponse | false
  }
  catch {
    return { ok: false, error: 'The extension background service did not respond' }
  }

  if (!response || !response.ok) {
    return {
      ok: false,
      error: response && typeof response.error === 'string'
        ? response.error
        : 'Organization API request failed',
    }
  }
  if (!Array.isArray(response.data))
    return { ok: false, error: 'Unexpected organization API response format' }

  return {
    ok: true,
    data: response.data.map(normalizeOrgInfo).filter((org): org is OrgInfo => Boolean(org)),
  }
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
