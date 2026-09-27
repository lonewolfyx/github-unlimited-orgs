import type { ApiOrg, FetchOrgsResponse, OrgInfo } from '@github-unlimited-orgs/core'
import { createOrgRequester, normalizeOrgInfo } from '@github-unlimited-orgs/core'

const FETCH_ORGS_MESSAGE_TYPE = 'guo:fetch-orgs'

interface BackgroundResponse {
  ok: boolean
  data?: ApiOrg[]
  error?: string
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

/** Fetch a user's organizations from the configured API and use a recent stale cache on transient failures. */
export const requestOrganizations = createOrgRequester(requestApi)
