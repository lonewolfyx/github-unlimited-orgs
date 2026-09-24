import { defineConfig } from 'nitro/config'

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
  routeRules: {
    '/**': {
      // 6 hours in production, no cache in development
      // isr: isProduction ? 60 * 60 * 6 : false,
      cors: true,
      // headers: isProduction ? { 'access-control-max-age': '21600' } : {}, // 6 hours
    },
  },
})
