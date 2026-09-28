import { readFile, writeFile } from 'node:fs/promises'
import { getReleaseVersion } from '../../../scripts/release-version.mjs'

const packageRootUrl = new URL('../', import.meta.url)
const sourceUrl = new URL('src/manifest.base.json', packageRootUrl)
const outputUrl = new URL('dist/manifest.json', packageRootUrl)

const manifest = JSON.parse(await readFile(sourceUrl, 'utf8'))
manifest.version = getReleaseVersion()

await writeFile(outputUrl, `${JSON.stringify(manifest, undefined, 2)}\n`)
