import { defineConfig } from 'tsdown'
import { userscriptHeader } from './src/header.ts'

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  clean: true,
  banner: userscriptHeader,
  // Full control over the output file name (iife format inserts a .iife infix by default)
  outputOptions: { entryFileNames: 'github-unlimited-orgs.user.js' },
})
