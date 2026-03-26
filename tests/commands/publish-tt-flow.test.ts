import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const { printResult, uploadNormalVideo, publishNormalVideo, pollNormalVideoStatus, queryVideoWithRetry } =
  vi.hoisted(() => ({
    printResult: vi.fn(),
    uploadNormalVideo: vi.fn(),
    publishNormalVideo: vi.fn(),
    pollNormalVideoStatus: vi.fn(),
    queryVideoWithRetry: vi.fn(),
  }))

vi.mock('../../src/client/index.js', () => ({
  printResult,
}))

vi.mock('../../src/workflows/index.js', () => ({
  uploadNormalVideo,
  publishNormalVideo,
  pollNormalVideoStatus,
  queryVideoWithRetry,
}))

import { register } from '../../src/commands/publish-tt-flow.js'

describe('publish-tt-flow command', () => {
  it('fails when required options are missing', async () => {
    const result = await runCommand(register, ['publish-tt-flow'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('fails when a numeric option is invalid', async () => {
    const result = await runCommand(register, [
      'publish-tt-flow',
      '--business-id',
      'biz-1',
      '--file',
      '/tmp/video.mp4',
      '--interval',
      '0',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --interval 必须为大于 0 的整数')
  })

  it('completes the full tt workflow and exits with 0', async () => {
    uploadNormalVideo.mockResolvedValueOnce({ fileUrl: 'https://cdn/video.mp4' })
    publishNormalVideo.mockResolvedValueOnce({ shareId: 'share-1' })
    pollNormalVideoStatus.mockResolvedValueOnce({
      pollCount: 2,
      finalStatus: 'PUBLISH_COMPLETE',
      reason: null,
      postIds: ['video-1'],
      raw: { status: 'PUBLISH_COMPLETE' },
    })
    queryVideoWithRetry.mockResolvedValueOnce({
      query: { videoList: [{ itemId: 'video-1' }] },
      warnings: [],
    })

    const result = await runCommand(register, [
      'publish-tt-flow',
      '--business-id',
      'biz-1',
      '--file',
      '/tmp/video.mp4',
      '--caption',
      'hello',
    ])

    expect(result.exitCode).toBe(0)
    expect(uploadNormalVideo).toHaveBeenCalledWith('/tmp/video.mp4', undefined)
    expect(publishNormalVideo).toHaveBeenCalledWith('biz-1', 'https://cdn/video.mp4', 'hello')
    expect(pollNormalVideoStatus).toHaveBeenCalledWith('biz-1', 'share-1', 5, 60)
    expect(queryVideoWithRetry).toHaveBeenCalledWith('biz-1', 'video-1', 5, 3)
    expect(printResult).toHaveBeenCalledWith({
      upload: { fileUrl: 'https://cdn/video.mp4' },
      publish: { shareId: 'share-1' },
      status: { status: 'PUBLISH_COMPLETE' },
      query: { videoList: [{ itemId: 'video-1' }] },
    })
  })

  it('exits with 1 when workflow ends in failed status', async () => {
    uploadNormalVideo.mockResolvedValueOnce({ fileUrl: 'https://cdn/video.mp4' })
    publishNormalVideo.mockResolvedValueOnce({ shareId: 'share-1' })
    pollNormalVideoStatus.mockResolvedValueOnce({
      pollCount: 1,
      finalStatus: 'FAILED',
      reason: '审核失败',
      postIds: [],
      raw: { status: 'FAILED' },
    })

    const result = await runCommand(register, [
      'publish-tt-flow',
      '--business-id',
      'biz-1',
      '--file',
      '/tmp/video.mp4',
    ])

    expect(result.exitCode).toBe(1)
    expect(queryVideoWithRetry).not.toHaveBeenCalled()
  })

  it('exits with 2 when workflow times out', async () => {
    uploadNormalVideo.mockResolvedValueOnce({ fileUrl: 'https://cdn/video.mp4' })
    publishNormalVideo.mockResolvedValueOnce({ shareId: 'share-1' })
    pollNormalVideoStatus.mockResolvedValueOnce({
      pollCount: 60,
      finalStatus: 'TIMEOUT',
      reason: 'timeout',
      postIds: [],
      raw: null,
    })

    const result = await runCommand(register, [
      'publish-tt-flow',
      '--business-id',
      'biz-1',
      '--file',
      '/tmp/video.mp4',
    ])

    expect(result.exitCode).toBe(2)
  })
})
