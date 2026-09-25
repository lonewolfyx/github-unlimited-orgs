import type { OrgInfo } from './types'

const CACHE_PREFIX = 'guo:orgs:'
const CACHE_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

export class OrgFetchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'OrgFetchError'
  }
}

interface CacheEntry {
  time: number
  data: OrgInfo[]
}

function readCache(username: string): OrgInfo[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + username)
    if (!raw)
      return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!Array.isArray(entry.data) || Date.now() - entry.time > CACHE_TTL_MS)
      return null
    return entry.data
  }
  catch {
    return null
  }
}

function writeCache(username: string, data: OrgInfo[]): void {
  try {
    const entry: CacheEntry = { time: Date.now(), data }
    sessionStorage.setItem(CACHE_PREFIX + username, JSON.stringify(entry))
  }
  catch {
    // 存储不可用（隐私模式等）时静默降级
  }
}

export async function fetchOrgs(username: string, apiBase: string, signal?: AbortSignal): Promise<OrgInfo[]> {
  const cached = readCache(username)
  if (cached)
    return cached

  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const url = `${apiBase.replace(/\/+$/, '')}/${encodeURIComponent(username)}`
  const res = await fetch(url, { signal: signal ?? timeout })
  if (!res.ok)
    throw new OrgFetchError(`API 请求失败：${res.status}`, res.status)

  const data = await res.json() as OrgInfo[]
  if (!Array.isArray(data))
    throw new OrgFetchError('API 响应格式异常', res.status)

  writeCache(username, data)
  return data
}
