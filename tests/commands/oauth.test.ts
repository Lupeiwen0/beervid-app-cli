import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const { openApiGet, printResult } = vi.hoisted(() => ({
  openApiGet: vi.fn(),
  printResult: vi.fn(),
}))

vi.mock('../../src/client/index.js', () => ({
  openApiGet,
  printResult,
}))

import { register } from '../../src/commands/oauth.js'

describe('get-oauth-url command', () => {
  it('fails when type is missing', async () => {
    const result = await runCommand(register, ['get-oauth-url'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数: --type')
  })

  it('fails when type is invalid', async () => {
    const result = await runCommand(register, ['get-oauth-url', '--type', 'foo'])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --type 必须为 tt 或 tts')
  })

  it('prints TT oauth url', async () => {
    openApiGet.mockResolvedValueOnce('https://tt.example.com')

    const result = await runCommand(register, ['get-oauth-url', '--type', 'tt'])

    expect(result.exitCode).toBeUndefined()
    expect(openApiGet).toHaveBeenCalledWith('/api/v1/open/thirdparty-auth/tt-url')
    expect(printResult).toHaveBeenCalledWith('https://tt.example.com')
  })

  it('prints TTS oauth url', async () => {
    openApiGet.mockResolvedValueOnce({ crossBorderUrl: 'https://tts.example.com' })

    const result = await runCommand(register, ['get-oauth-url', '--type', 'tts'])

    expect(result.exitCode).toBeUndefined()
    expect(openApiGet).toHaveBeenCalledWith('/api/v1/open/thirdparty-auth/tts-url')
    expect(printResult).toHaveBeenCalledWith({
      crossBorderUrl: 'https://tts.example.com',
    })
  })
})
