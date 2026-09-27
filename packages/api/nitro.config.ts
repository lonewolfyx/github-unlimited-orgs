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
    // `cache` mount 由 nitro/cache 的 defineCachedHandler 使用。
    // 本地：写成 ./.cache 目录下的文件做持久化；Vercel 只读/临时文件系统回退到内存，
    // 6 小时缓存改由 Cache-Control: s-maxage 交给 Vercel 边缘 CDN 承担。
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
