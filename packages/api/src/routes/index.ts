import { defineHandler, defineRouteMeta, html } from 'nitro'
import { getQuery, raw } from 'nitro/h3'

import { renderHTML } from 'openapi-renderer'

defineRouteMeta({
  openAPI: {
    description: 'API documentation for GitHub Unlimited Organizations — fetch all organizations a GitHub user belongs to.',
  },
})

export default defineHandler((event) => {
  return html(
    raw(
      renderHTML({
        renderer: (getQuery(event).renderer as any) || 'scalar',
        spec: '/openapi.json',
        meta: {
          title: 'GitHub Unlimited Organizations API',
        },
        scalar: {
          hideClientButton: true,
          theme: 'alternate',
          _integration: 'nitro',
        },
      }),
    ),
  )
})
