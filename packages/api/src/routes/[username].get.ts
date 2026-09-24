import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { Octokit } from 'octokit'

export default defineHandler(async (event) => {
  const username = getRouterParam(event, 'username')!

  const { githubToken } = useRuntimeConfig()
  const octokit = new Octokit(githubToken ? { auth: githubToken } : {})

  const orgs = await octokit.paginate(octokit.rest.orgs.listForUser, {
    username,
    per_page: 100,
  })

  return orgs.map((org) => {
    return {
      username: org.login,
      lable: org.login,
      avatar: org.avatar_url,
      description: org.description,
      html_url: `https://github.com/${org.login}`,
    }
  })
})
