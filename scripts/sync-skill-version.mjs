import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const packageJsonPath = resolve(rootDir, 'package.json')
const skillJsonPath = resolve(rootDir, 'skills/beervid-app-cli/skill.json')

function normalizeVersion(rawVersion) {
  const version = String(rawVersion).trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid semver version: ${rawVersion}`)
  }
  return version
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const explicitVersion = process.argv[2]
const packageJson = readJson(packageJsonPath)
const nextVersion = normalizeVersion(explicitVersion ?? packageJson.version)
const skillJson = readJson(skillJsonPath)

skillJson.version = nextVersion

if (!skillJson.dependencies || typeof skillJson.dependencies !== 'object') {
  skillJson.dependencies = {}
}

skillJson.dependencies[packageJson.name] = `^${nextVersion}`

writeJson(skillJsonPath, skillJson)

console.log(`Synced ${skillJsonPath} to version ${nextVersion}`)
