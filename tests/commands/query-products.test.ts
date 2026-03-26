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

import { register } from '../../src/commands/query-products.js'

describe('query-products command', () => {
  it('fails when creator id is missing', async () => {
    const result = await runCommand(register, ['query-products'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数: --creator-id')
  })

  it('fails when product type is invalid', async () => {
    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--product-type',
      'bad',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --product-type 必须为 shop、showcase 或 all')
  })

  it('fails when cursor is invalid', async () => {
    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--cursor',
      'not-base64',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: 无效的 cursor 格式')
  })

  it('fails when all product sources reject', async () => {
    openApiPost.mockRejectedValue(new Error('network down'))

    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('查询商品失败: 所有商品源都请求失败')
  })

  it('merges products and emits next cursor', async () => {
    openApiPost
      .mockResolvedValueOnce({
        nextPageToken: 'shop-next',
        products: [
          {
            id: 'p-1',
            title: 'Shop product',
            images: ['{url=https://img.example.com/shop.jpg}'],
            salesCount: 10,
            brandName: 'Brand A',
            shopName: 'Shop A',
          },
        ],
      })
      .mockResolvedValueOnce({
        nextPageToken: '',
        products: [
          {
            id: 'p-1',
            title: 'Duplicate product',
            images: ['https://img.example.com/duplicate.jpg'],
            salesCount: 99,
            brandName: 'Brand B',
            shopName: 'Shop B',
          },
          {
            id: 'p-2',
            title: 'Showcase product',
            images: ['https://img.example.com/showcase.jpg'],
            salesCount: 20,
            brandName: 'Brand C',
            shopName: 'Shop C',
          },
        ],
      })

    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--page-size',
      '20',
    ])

    const nextCursor = Buffer.from(
      JSON.stringify({ shopToken: 'shop-next', showcaseToken: '' })
    ).toString('base64')

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledTimes(2)
    expect(printResult).toHaveBeenCalledWith({
      products: [
        {
          id: 'p-1',
          title: 'Shop product',
          price: undefined,
          images: ['https://img.example.com/shop.jpg'],
          salesCount: 10,
          brandName: 'Brand A',
          shopName: 'Shop A',
          source: 'shop',
          reviewStatus: undefined,
          inventoryStatus: undefined,
        },
        {
          id: 'p-2',
          title: 'Showcase product',
          price: undefined,
          images: ['https://img.example.com/showcase.jpg'],
          salesCount: 20,
          brandName: 'Brand C',
          shopName: 'Shop C',
          source: 'showcase',
          reviewStatus: undefined,
          inventoryStatus: undefined,
        },
      ],
      nextCursor,
    })
  })
})
