import { defineCachedHandler } from 'nitro/cache'
import { getRouterParam } from 'nitro/h3'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { Octokit } from 'octokit'

// 批量并发请求组织详情时的每批大小，避免瞬时打满 GitHub 限流
const DETAIL_BATCH_SIZE = 10

// 缓存 6 小时；swr 同时生成 s-maxage 响应头，交由 Vercel 边缘 CDN 缓存
const CACHE_MAX_AGE = 60 * 60 * 6

export default defineCachedHandler(async (event) => {
  const username = getRouterParam(event, 'username')!

  const { githubToken } = useRuntimeConfig()
  const octokit = new Octokit(githubToken ? { auth: githubToken } : {})

  const orgs = await octokit.paginate(octokit.rest.orgs.listForUser, {
    username,
    per_page: 100,
  })

  // join_time 需要额外的组织详情请求；分批并发以控制延迟与失败率，单个失败降级为 null
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
