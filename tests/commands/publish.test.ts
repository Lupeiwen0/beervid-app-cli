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

import { register } from '../../src/commands/publish.js'

describe('publish command', () => {
  it('fails when type is invalid', async () => {
    const result = await runCommand(register, ['publish', '--type', 'foo'])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --type 必须为 normal 或 shoppable')
  })

  it('fails when normal publish options are missing', async () => {
    const result = await runCommand(register, ['publish', '--type', 'normal'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('publishes normal video successfully', async () => {
    openApiPost.mockResolvedValueOnce({ shareId: 'share-1' })

    const result = await runCommand(register, [
      'publish',
      '--business-id',
      'biz-1',
      '--video-url',
      'https://cdn/video.mp4',
      '--caption',
      'caption',
    ])

    expect(result.errors).toEqual([])
    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/publish', {
      businessId: 'biz-1',
      videoUrl: 'https://cdn/video.mp4',
      caption: 'caption',
    })
    expect(printResult).toHaveBeenCalledWith({ shareId: 'share-1' })
    expect(result.logs.some((line) => line.includes('poll-status'))).toBe(true)
  })

  it('publishes shoppable video and truncates title', async () => {
    openApiPost.mockResolvedValueOnce({ videoId: 'video-1' })
    const longTitle = 'abcdefghijklmnopqrstuvwxyz123456789'

    const result = await runCommand(register, [
      'publish',
      '--type',
      'shoppable',
      '--creator-id',
      'creator-1',
      '--file-id',
      'file-1',
      '--product-id',
      'product-1',
      '--product-title',
      longTitle,
    ])

    expect(result.errors).toEqual([])
    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tts/shoppable-video/publish', {
      creatorUserOpenId: 'creator-1',
      fileId: 'file-1',
      title: '',
      productId: 'product-1',
      productTitle: longTitle.slice(0, 29),
    })
    expect(result.logs.some((line) => line.includes('已自动截断'))).toBe(true)
    expect(printResult).toHaveBeenCalledWith({ videoId: 'video-1' })
  })
})
