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

import { register } from '../../src/commands/poll-status.js'

describe('poll-status command', () => {
  it('fails when required options are missing', async () => {
    const result = await runCommand(register, ['poll-status'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('fails when interval is invalid', async () => {
    const result = await runCommand(register, [
      'poll-status',
      '--business-id',
      'biz-1',
      '--share-id',
      'share-1',
      '--interval',
      '0',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --interval 必须为大于 0 的整数')
  })

  it('exits with 0 when publish completes', async () => {
    openApiPost.mockResolvedValueOnce({
      status: 'PUBLISH_COMPLETE',
      post_ids: ['video-1'],
    })

    const result = await runCommand(register, [
      'poll-status',
      '--business-id',
      'biz-1',
      '--share-id',
      'share-1',
      '--max-polls',
      '1',
    ])

    expect(result.exitCode).toBe(0)
    expect(printResult).toHaveBeenCalledWith({
      status: 'PUBLISH_COMPLETE',
      post_ids: ['video-1'],
    })
  })

  it('keeps polling when publish completes without post ids', async () => {
    openApiPost.mockResolvedValueOnce({
      status: 'PUBLISH_COMPLETE',
      post_ids: [],
    })

    const result = await runCommand(register, [
      'poll-status',
      '--business-id',
      'biz-1',
      '--share-id',
      'share-1',
      '--max-polls',
      '1',
    ])

    expect(result.exitCode).toBe(2)
    expect(printResult).not.toHaveBeenCalled()
    expect(result.errors.some((line) => line.includes('超过最大轮询次数'))).toBe(true)
  })

  it('exits with 1 when publish fails', async () => {
    openApiPost.mockResolvedValueOnce({
      status: 'FAILED',
      reason: 'bad request',
    })

    const result = await runCommand(register, [
      'poll-status',
      '--business-id',
      'biz-1',
      '--share-id',
      'share-1',
      '--max-polls',
      '1',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.logs.some((line) => line.includes('发布失败: bad request'))).toBe(true)
  })

  it('exits with 2 when polling times out', async () => {
    openApiPost.mockResolvedValueOnce({ status: 'PROCESSING_DOWNLOAD' })

    const result = await runCommand(register, [
      'poll-status',
      '--business-id',
      'biz-1',
      '--share-id',
      'share-1',
      '--max-polls',
      '1',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.errors.some((line) => line.includes('超过最大轮询次数'))).toBe(true)
  })

  it('preserves large numeric ids from raw argv', async () => {
    openApiPost.mockResolvedValueOnce({
      status: 'PUBLISH_COMPLETE',
      post_ids: ['video-1'],
    })

    const result = await runCommand(register, [
      'poll-status',
      '--business-id=7123456789012345678',
      '--share-id',
      '8123456789012345678',
      '--max-polls',
      '1',
    ])

    expect(result.exitCode).toBe(0)
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/status', {
      businessId: '7123456789012345678',
      shareId: '8123456789012345678',
    })
  })
})
