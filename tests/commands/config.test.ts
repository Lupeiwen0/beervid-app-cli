import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const { loadConfig, saveConfig, getConfigPath } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getConfigPath: vi.fn().mockReturnValue('/home/user/.beervid/config.json'),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig,
  saveConfig,
  getConfigPath,
}))

import { register } from '../../src/commands/config.js'

describe('config command', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fails when no options are provided', async () => {
    const result = await runCommand(register, ['config'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('请指定要设置的配置项')
  })

  it('saves app-key to config', async () => {
    const result = await runCommand(register, ['config', '--app-key', 'my-secret-key'])

    expect(result.exitCode).toBeUndefined()
    expect(saveConfig).toHaveBeenCalledWith({ appKey: 'my-secret-key' })
    expect(result.logs.some((l) => l.includes('配置已保存'))).toBe(true)
  })

  it('saves base-url to config', async () => {
    const result = await runCommand(register, ['config', '--base-url', 'https://custom.api.com'])

    expect(result.exitCode).toBeUndefined()
    expect(saveConfig).toHaveBeenCalledWith({ baseUrl: 'https://custom.api.com' })
  })

  it('saves both app-key and base-url together', async () => {
    const result = await runCommand(register, [
      'config',
      '--app-key',
      'key123',
      '--base-url',
      'https://custom.api.com',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(saveConfig).toHaveBeenCalledWith({
      appKey: 'key123',
      baseUrl: 'https://custom.api.com',
    })
  })

  it('merges with existing config when setting app-key', async () => {
    loadConfig.mockReturnValue({ baseUrl: 'https://existing.com' })

    const result = await runCommand(register, ['config', '--app-key', 'new-key'])

    expect(result.exitCode).toBeUndefined()
    expect(saveConfig).toHaveBeenCalledWith({
      baseUrl: 'https://existing.com',
      appKey: 'new-key',
    })
  })

  it('shows empty config with --show', async () => {
    const result = await runCommand(register, ['config', '--show'])

    expect(result.exitCode).toBeUndefined()
    expect(result.logs.some((l) => l.includes('配置文件'))).toBe(true)
    expect(result.logs.some((l) => l.includes('暂无配置'))).toBe(true)
  })

  it('shows existing config with --show and masks app-key', async () => {
    loadConfig.mockReturnValue({ appKey: 'abcd1234efgh5678', baseUrl: 'https://custom.api.com' })

    const result = await runCommand(register, ['config', '--show'])

    expect(result.exitCode).toBeUndefined()
    expect(result.logs.some((l) => l.includes('abcd****5678'))).toBe(true)
    expect(result.logs.some((l) => l.includes('https://custom.api.com'))).toBe(true)
  })

  it('masks short app-key with --show', async () => {
    loadConfig.mockReturnValue({ appKey: 'short' })

    const result = await runCommand(register, ['config', '--show'])

    expect(result.exitCode).toBeUndefined()
    expect(result.logs.some((l) => l.includes('****'))).toBe(true)
    expect(result.logs.every((l) => !l.includes('short'))).toBe(true)
  })
})
