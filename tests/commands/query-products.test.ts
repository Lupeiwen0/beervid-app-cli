import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'
import { decodeCursor } from '../../src/workflows/index.js'

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

  it('fails when page size exceeds the OpenAPI maximum', async () => {
    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--page-size',
      '21',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --page-size 必须为 1 到 20 之间的整数')
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

  it('outputs deduplicated flat list with productType and nextPage', async () => {
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

    const call = printResult.mock.calls[0][0]
    // p-1 appears in both shop and showcase but should only appear once (from shop, first seen)
    expect(call.list).toHaveLength(2)
    expect(call.list[0]).toEqual({
      id: 'p-1',
      title: 'Shop product',
      images: ['{url=https://img.example.com/shop.jpg}'],
      salesCount: 10,
      brandName: 'Brand A',
      shopName: 'Shop A',
      productType: 'shop',
    })
    expect(call.list[1]).toEqual({
      id: 'p-2',
      title: 'Showcase product',
      images: ['https://img.example.com/showcase.jpg'],
      salesCount: 20,
      brandName: 'Brand C',
      shopName: 'Shop C',
      productType: 'showcase',
    })
    // shop has nextPageToken 'shop-next', showcase has '' → only shop should remain pageable
    expect(call.nextPage).toEqual(expect.any(String))
    expect(decodeCursor(call.nextPage)).toEqual({
      shopToken: 'shop-next',
      showcaseToken: null,
    })
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
    expect(printResult).toHaveBeenCalledWith({
      list: [
        {
          id: 'p-3',
          title: 'Showcase next page',
          images: ['https://img.example.com/showcase-next.jpg'],
          salesCount: 30,
          brandName: 'Brand D',
          shopName: 'Shop D',
          productType: 'showcase',
        },
      ],
      nextPage: null,
    })
  })

  it('prints single-type next cursor usage with product type preserved', async () => {
    openApiPost.mockResolvedValueOnce({
      productType: 'shop',
      nextPageToken: 'shop-next',
      products: [
        {
          id: 'p-4',
          title: 'Shop next page',
          images: ['https://img.example.com/shop-next.jpg'],
          salesCount: 40,
          brandName: 'Brand E',
          shopName: 'Shop E',
        },
      ],
    })

    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--product-type',
      'shop',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(
      result.logs.some((line) =>
        line.includes(
          '使用: beervid query-products --creator-id creator-1 --product-type shop --cursor '
        )
      )
    ).toBe(true)
    expect(printResult).toHaveBeenCalledWith({
      list: [
        {
          id: 'p-4',
          title: 'Shop next page',
          images: ['https://img.example.com/shop-next.jpg'],
          salesCount: 40,
          brandName: 'Brand E',
          shopName: 'Shop E',
          productType: 'shop',
        },
      ],
      nextPage: expect.any(String),
    })
  })

  it('prints last-page result when single-source nextPageToken is empty string', async () => {
    openApiPost.mockResolvedValueOnce({
      productType: 'shop',
      nextPageToken: '',
      products: [
        {
          id: 'p-5',
          title: 'Shop last page',
          images: ['https://img.example.com/shop-last.jpg'],
          salesCount: 5,
          brandName: 'Brand F',
          shopName: 'Shop F',
        },
      ],
    })

    const result = await runCommand(register, [
      'query-products',
      '--creator-id',
      'creator-1',
      '--product-type',
      'shop',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(result.logs.some((line) => line.includes('已到最后一页'))).toBe(true)
    expect(printResult).toHaveBeenCalledWith({
      list: [
        {
          id: 'p-5',
          title: 'Shop last page',
          images: ['https://img.example.com/shop-last.jpg'],
          salesCount: 5,
          brandName: 'Brand F',
          shopName: 'Shop F',
          productType: 'shop',
        },
      ],
      nextPage: null,
    })
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
