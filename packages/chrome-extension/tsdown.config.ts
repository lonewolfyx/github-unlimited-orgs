import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/content.ts'],
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  minify: false,
  clean: true,
  // 完全控制输出文件名（默认 iife 格式会插入 .iife 中缀），与 manifest.json 引用保持一致
  outputOptions: { entryFileNames: 'content.js' },
})
