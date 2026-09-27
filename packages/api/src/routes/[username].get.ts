import { defineCachedHandler } from 'nitro/cache'
import { getRouterParam } from 'nitro/h3'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { Octokit } from 'octokit'

// Batch size for concurrent org detail requests, to avoid spiking GitHub rate limits
const DETAIL_BATCH_SIZE = 10

// Cache for 6 hours; swr also emits the s-maxage header for the Vercel edge CDN
const CACHE_MAX_AGE = 60 * 60 * 6

export default defineCachedHandler(async (event) => {
  const username = getRouterParam(event, 'username')!

  const { githubToken } = useRuntimeConfig()
  const octokit = new Octokit(githubToken ? { auth: githubToken } : {})

  const orgs = await octokit.paginate(octokit.rest.orgs.listForUser, {
    username,
    per_page: 100,
  })

  // join_time requires an extra org detail request; batch concurrently to limit latency and failures, degrading individual failures to null
  const joinTimeByOrg = new Map<string, string | null>()
  for (let i = 0; i < orgs.length; i += DETAIL_BATCH_SIZE) {
    await Promise.all(orgs.slice(i, i + DETAIL_BATCH_SIZE).map(async (org) => {
      try {
        const { data } = await octokit.rest.orgs.get({ org: org.login })
        joinTimeByOrg.set(org.login, data.created_at)
      }
      catch {
        joinTimeByOrg.set(org.login, null)
      }
    }))
  }

  return orgs.map((org) => {
    return {
      username: org.login,
      lable: org.login,
      avatar: org.avatar_url,
      description: org.description,
      html_url: `https://github.com/${org.login}`,
      join_time: joinTimeByOrg.get(org.login) ?? null,
    }
  })
}, {
  name: 'orgs',
  maxAge: CACHE_MAX_AGE,
  swr: true,
})
