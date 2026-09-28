import { defineConfig } from 'tsdown'
import { getReleaseVersion } from '../../scripts/release-version.mjs'
import { createUserscriptHeader } from './src/header.ts'

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  format: 'iife',
  platform: 'browser',
  dts: false,
  clean: true,
  banner: createUserscriptHeader(getReleaseVersion()),
  outputOptions: {
    entryFileNames: 'github-unlimited-orgs.user.js',
  },
})
