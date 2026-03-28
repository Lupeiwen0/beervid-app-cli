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

import { register } from '../../src/commands/query-video.js'

describe('query-video command', () => {
  it('fails when required options are missing', async () => {
    const result = await runCommand(register, ['query-video'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('fails when item ids are empty after trimming', async () => {
    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--item-ids',
      ', ,',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --item-ids 不能为空')
  })

  it('fails when max-count is outside the documented range', async () => {
    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--max-count',
      '9',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --max-count 必须为 10 到 20 之间的整数')
  })

  it('fails when max-count is not an integer', async () => {
    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--max-count',
      '10.5',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --max-count 必须为整数')
  })

  it('exits with 0 when no video data is returned', async () => {
    openApiPost.mockResolvedValueOnce({ videoList: [] })

    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--item-ids',
      'item-1',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.logs).toContain('未查到视频数据')
  })

  it('allows querying all videos without item ids', async () => {
    openApiPost.mockResolvedValueOnce({ videoList: [] })

    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--cursor',
      '0',
      '--max-count',
      '20',
    ])

    expect(result.exitCode).toBe(0)
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/query', {
      businessId: 'biz-1',
      cursor: 0,
      maxCount: 20,
    })
  })

  it('prints api-shaped query result', async () => {
    openApiPost.mockResolvedValueOnce({
      videos: [
        {
          item_id: 'item-1',
          video_views: 100,
          likes: 8,
          comments: 2,
          shares: 1,
          share_url: 'https://tiktok.com/item-1',
        },
      ],
    })

    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--item-ids',
      'item-1,item-2',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/query', {
      businessId: 'biz-1',
      itemIds: ['item-1', 'item-2'],
    })
    expect(printResult).toHaveBeenCalledWith({
      videos: [
        {
          item_id: 'item-1',
          video_views: 100,
          likes: 8,
          comments: 2,
          shares: 1,
          share_url: 'https://tiktok.com/item-1',
        },
      ],
    })
  })

  it('accepts repeated --item-ids options as an array', async () => {
    openApiPost.mockResolvedValueOnce({
      videos: [
        {
          itemId: 'item-1',
          videoViews: 100,
          likes: 8,
          comments: 2,
          shares: 1,
        },
      ],
    })

    const result = await runCommand(register, [
      'query-video',
      '--business-id',
      'biz-1',
      '--item-ids',
      'item-1',
      '--item-ids',
      'item-2,item-3',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/query', {
      businessId: 'biz-1',
      itemIds: ['item-1', 'item-2', 'item-3'],
    })
  })

  it('preserves large numeric ids from raw argv', async () => {
    openApiPost.mockResolvedValueOnce({ videos: [] })

    const result = await runCommand(register, [
      'query-video',
      '--business-id=7123456789012345678',
      '--item-ids',
      '8123456789012345678',
      '--item-ids=9123456789012345678,1123456789012345678',
    ])

    expect(result.exitCode).toBe(0)
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tiktok/video/query', {
      businessId: '7123456789012345678',
      itemIds: ['8123456789012345678', '9123456789012345678', '1123456789012345678'],
    })
  })
})
