import { defineConfig } from 'nitro/config'

const isVercel = process.env.VERCEL === '1'

export default defineConfig({
  serverDir: './src',
  // Required: generates the #nitro/virtual/routing-meta virtual module
  // that src/routes/openapi.json.ts imports
  experimental: {
    openAPI: true,
  },
  runtimeConfig: {
    githubToken: process.env.GITHUB_TOKEN || '',
  },
  storage: {
    // The `cache` mount is used by nitro/cache's defineCachedHandler.
    // Locally it persists to files under ./.cache; Vercel's read-only/ephemeral
    // filesystem falls back to memory, and the 6-hour freshness is delegated to
    // the Vercel edge CDN via the Cache-Control: s-maxage header.
    cache: isVercel
      ? { driver: 'memory' }
      : { driver: 'fs', base: '.cache' },
  },
  routeRules: {
    '/**': {
      cors: true,
    },
  },
})
