import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

describe('cli entrypoints', () => {
  it('prints version in dev mode', () => {
    const result = spawnSync(npmCmd, ['run', 'dev', '--', '--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(pkg.version)
  })
})
