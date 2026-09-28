import { defineConfig } from 'tsdown'

// Each entry is a standalone script referenced by the generated manifest, so build them
// in separate runs: multi-entry builds code-split shared modules into chunks,
// and MV3 content scripts / service workers cannot load chunk imports.
// No `clean` here: in watch mode each config rebuilds independently, and a
// clean would wipe the other entries' outputs. The build script removes dist
// explicitly instead.
const shared = {
  outDir: 'dist',
  format: 'esm',
  platform: 'browser',
  dts: false,
  minify: true,
  outputOptions: { entryFileNames: '[name].js' },
} as const

export default defineConfig([
  { ...shared, entry: ['src/content.ts'] },
  { ...shared, entry: ['src/background.ts'] },
  { ...shared, entry: ['src/main-world.ts'] },
])
