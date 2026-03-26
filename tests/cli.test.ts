import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

describe('cli entrypoints', () => {
  it('prints version', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(pkg.version)
  })
})
