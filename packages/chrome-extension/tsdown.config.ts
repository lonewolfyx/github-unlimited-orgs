import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/content.ts', 'src/background.ts'],
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  clean: true,
  minify: false,
  outputOptions: {
    entryFileNames: '[name].js',
  },
})
