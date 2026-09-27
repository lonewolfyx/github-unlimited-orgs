/**
 * Shared runtime configuration for the organization API.
 *
 * TODO(M3): Replace with the production API domain after deployment and allow
 * it to be overridden per platform (chrome.storage.sync for the extension).
 */
export const API_BASE_URL = 'http://localhost:3000'
export const API_TIMEOUT_MS = 10_000