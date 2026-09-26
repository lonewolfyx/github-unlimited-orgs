import { defineConfig } from 'tsdown'

// content script 与 background 各自独立构建：
// iife 不支持多入口（rolldown 限制），故拆成两组单入口配置。
// 完全控制输出文件名（默认 iife 格式会插入 .iife 中缀），与 manifest.json 引用保持一致。
const shared = {
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  minify: false,
  outputOptions: { entryFileNames: '[name].js' },
} as const

export default defineConfig([
  { ...shared, entry: ['src/content.ts'], clean: true },
  { ...shared, entry: ['src/background.ts'], clean: false },
  { ...shared, entry: ['src/main-world.ts'], clean: false },
])
