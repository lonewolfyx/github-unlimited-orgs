import type { ApiOrg, FetchOrgsResponse, OrgInfo } from '@github-unlimited-orgs/core'
import { API_BASE_URL, API_TIMEOUT_MS, createOrgRequester, normalizeOrgInfo } from '@github-unlimited-orgs/core'

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

/** Fetch a user's organizations from the configured API and use a recent stale cache on transient failures. */
export const requestOrganizations = createOrgRequester(requestApi, `${API_BASE_URL}:`)
