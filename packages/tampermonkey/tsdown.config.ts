import { defineConfig } from 'tsdown'
import { userscriptHeader } from './src/header.ts'

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  minify: false,
  clean: true,
  banner: userscriptHeader,
  // 完全控制输出文件名（默认 iife 格式会插入 .iife 中缀）
  outputOptions: { entryFileNames: 'github-unlimited-orgs.user.js' },
})
