import { readFileSync } from 'node:fs'

const packageJsonUrl = new URL('../package.json', import.meta.url)

export function getReleaseVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf-8'))
  return packageJson.version
}
