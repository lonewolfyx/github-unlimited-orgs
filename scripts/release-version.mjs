import { readFileSync } from 'node:fs'

const packageJsonUrl = new URL('../package.json', import.meta.url)
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function getReleaseVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8'))
  const version = packageJson.version

  if (typeof version !== 'string' || !versionPattern.test(version))
    throw new Error('The root package version must contain three numeric components')

  const parts = version.split('.').map(Number)
  if (parts.some(part => part > 65_535) || parts.every(part => part === 0))
    throw new Error(`Version ${version} cannot be used as a Chrome extension version`)

  return version
}
