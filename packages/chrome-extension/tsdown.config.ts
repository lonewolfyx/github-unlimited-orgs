import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/content.ts',
    'src/background.ts',
    'src/main-world.ts',
  ],
  format: 'esm',
  platform: 'browser',
  dts: false,
  minify: true,
  clean: true,
  outputOptions: {
    entryFileNames: '[name].js',
  },
})
