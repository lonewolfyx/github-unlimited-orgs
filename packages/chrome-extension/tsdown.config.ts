import { defineConfig } from 'tsdown'

// Build the content script, background service worker, and MAIN-world script
// independently. Rolldown does not support multiple entry points for IIFEs, so
// use separate single-entry configurations. Explicitly control output names
// because the default IIFE format inserts an .iife infix; the generated names
// must match the references in manifest.json.
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
