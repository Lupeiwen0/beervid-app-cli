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

  it('prints api-shaped product groups', async () => {
    openApiPost
      .mockResolvedValueOnce({
        productType: 'shop',
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
        productType: 'showcase',
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

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledTimes(2)
    expect(printResult).toHaveBeenCalledWith([
      {
        productType: 'shop',
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
      },
      {
        productType: 'showcase',
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
      },
    ])
  })

  it('preserves null tokens in cursor and skips exhausted sources', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ shopToken: null, showcaseToken: 'showcase-next' })
    ).toString('base64')

    openApiPost.mockResolvedValueOnce({
      productType: 'showcase',
      nextPageToken: null,
      products: [
        {
          id: 'p-3',
          title: 'Showcase next page',
          images: ['https://img.example.com/showcase-next.jpg'],
          salesCount: 30,
          brandName: 'Brand D',
          shopName: 'Shop D',
        },
      ],
    })

    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--cursor',
      cursor,
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledTimes(1)
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tts/products/query', {
      creatorUserOpenId: 'creator-1',
      productType: 'showcase',
      pageSize: 20,
      pageToken: 'showcase-next',
    })
    expect(printResult).toHaveBeenCalledWith([
      {
        productType: 'showcase',
        nextPageToken: null,
        products: [
          {
            id: 'p-3',
            title: 'Showcase next page',
            images: ['https://img.example.com/showcase-next.jpg'],
            salesCount: 30,
            brandName: 'Brand D',
            shopName: 'Shop D',
          },
        ],
      },
    ])
  })

  it('preserves large numeric creator ids from raw argv', async () => {
    openApiPost.mockResolvedValueOnce({
      productType: 'shop',
      nextPageToken: null,
      products: [],
    })
    openApiPost.mockResolvedValueOnce({
      productType: 'showcase',
      nextPageToken: null,
      products: [],
    })

    const result = await runCommand(register, [
      'query-products',
      '--creator-id=7123456789012345678',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tts/products/query', {
      creatorUserOpenId: '7123456789012345678',
      productType: 'shop',
      pageSize: 20,
      pageToken: '',
    })
    expect(result.logs.some((line) => line.includes('已到最后一页'))).toBe(true)
  })
})
