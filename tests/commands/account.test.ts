import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const { openApiPost, printResult } = vi.hoisted(() => ({
  openApiPost: vi.fn(),
  printResult: vi.fn(),
}))

vi.mock('../../src/client/index.js', () => ({
  openApiPost,
  printResult,
}))

import { register } from '../../src/commands/account.js'

describe('get-account-info command', () => {
  it('fails when required options are missing', async () => {
    const result = await runCommand(register, ['get-account-info'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('fails when type is invalid', async () => {
    const result = await runCommand(register, [
      'get-account-info',
      '--type',
      'abc',
      '--account-id',
      'acct-1',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --type 必须为 TT 或 TTS')
  })

  it('queries account info successfully', async () => {
    openApiPost.mockResolvedValueOnce({ accountId: 'acct-1' })

    const result = await runCommand(register, [
      'get-account-info',
      '--type',
      'tt',
      '--account-id',
      'acct-1',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/account/info', {
      accountType: 'TT',
      accountId: 'acct-1',
    })
    expect(printResult).toHaveBeenCalledWith({ accountId: 'acct-1' })
  })
})
