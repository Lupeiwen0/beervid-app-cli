import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const {
  printResult,
  fetchProductPool,
  sortProductsForSelection,
  promptForProductSelection,
  uploadTtsVideo,
  publishTtsVideo,
} = vi.hoisted(() => ({
  printResult: vi.fn(),
  fetchProductPool: vi.fn(),
  sortProductsForSelection: vi.fn(),
  promptForProductSelection: vi.fn(),
  uploadTtsVideo: vi.fn(),
  publishTtsVideo: vi.fn(),
}))

vi.mock('../../src/client/index.js', () => ({
  printResult,
}))

vi.mock('../../src/workflows/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/workflows/index.js')>()
  return {
    ...actual,
    fetchProductPool,
    sortProductsForSelection,
    promptForProductSelection,
    uploadTtsVideo,
    publishTtsVideo,
  }
})

import { register } from '../../src/commands/publish-tts-flow.js'

describe('publish-tts-flow command', () => {
  it('fails when required options are missing', async () => {
    const result = await runCommand(register, ['publish-tts-flow'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数')
  })

  it('fails when product type is invalid', async () => {
    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id',
      'creator-1',
      '--file',
      '/tmp/video.mp4',
      '--product-type',
      'bad',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --product-type 必须为 shop、showcase 或 all')
  })

  it('fails when product id and interactive are both passed', async () => {
    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id',
      'creator-1',
      '--file',
      '/tmp/video.mp4',
      '--product-id',
      'product-1',
      '--interactive',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --product-id 与 --interactive 不能同时使用')
  })

  it('fails when fetched product pool is empty', async () => {
    fetchProductPool.mockResolvedValueOnce({
      products: [],
      rawGroups: [],
      summary: {
        productType: 'all',
        pageSize: 20,
        pagesScanned: 1,
        productCount: 0,
        nextCursor: null,
        reachedPageLimit: false,
        failedSources: [],
      },
    })

    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id',
      'creator-1',
      '--file',
      '/tmp/video.mp4',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('TTS 完整发布流程失败: 当前商品池为空，无法选择商品')
  })

  it('publishes with automatic product selection', async () => {
    const selectedProduct = {
      id: 'product-1',
      title: 'Top product',
      price: 99,
      images: [],
      salesCount: 100,
      brandName: 'Brand',
      shopName: 'Shop',
      source: 'shop',
      reviewStatus: undefined,
      inventoryStatus: undefined,
    }

    fetchProductPool.mockResolvedValueOnce({
      products: [selectedProduct],
      rawGroups: [
        {
          productType: 'shop',
          nextPageToken: null,
          products: [selectedProduct],
        },
      ],
      summary: {
        productType: 'all',
        pageSize: 20,
        pagesScanned: 1,
        productCount: 1,
        nextCursor: null,
        reachedPageLimit: false,
        failedSources: [],
      },
    })
    sortProductsForSelection.mockReturnValueOnce([selectedProduct])
    uploadTtsVideo.mockResolvedValueOnce({ videoFileId: 'file-1' })
    publishTtsVideo.mockResolvedValueOnce({
      publish: { videoId: 'video-1' },
      productTitle: 'Top product',
    })

    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id',
      'creator-1',
      '--file',
      '/tmp/video.mp4',
      '--caption',
      'caption',
    ])

    expect(result.errors).toEqual([])
    expect(result.exitCode).toBeUndefined()
    expect(fetchProductPool).toHaveBeenCalledWith('creator-1', 'all', 20, 5)
    expect(uploadTtsVideo).toHaveBeenCalledWith('/tmp/video.mp4', 'creator-1', undefined)
    expect(publishTtsVideo).toHaveBeenCalledWith(
      'creator-1',
      'file-1',
      'product-1',
      'Top product',
      'caption'
    )
    expect(printResult).toHaveBeenCalledWith({
      products: [
        {
          ...selectedProduct,
          productType: 'shop',
        },
      ],
      selectedProduct,
      upload: { videoFileId: 'file-1' },
      publish: { videoId: 'video-1' },
    })
  })

  it('supports interactive product selection', async () => {
    const product = {
      id: 'product-2',
      title: 'Interactive product',
      price: 50,
      images: [],
      salesCount: 80,
      brandName: 'Brand',
      shopName: 'Shop',
      source: 'showcase',
      reviewStatus: undefined,
      inventoryStatus: undefined,
    }

    fetchProductPool.mockResolvedValueOnce({
      products: [product],
      rawGroups: [
        {
          productType: 'showcase',
          nextPageToken: null,
          products: [product],
        },
      ],
      summary: {
        productType: 'all',
        pageSize: 20,
        pagesScanned: 1,
        productCount: 1,
        nextCursor: null,
        reachedPageLimit: false,
        failedSources: [],
      },
    })
    promptForProductSelection.mockResolvedValueOnce(product)
    uploadTtsVideo.mockResolvedValueOnce({ videoFileId: 'file-2' })
    publishTtsVideo.mockResolvedValueOnce({
      publish: { videoId: 'video-2' },
      productTitle: 'Interactive product',
    })

    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id',
      'creator-1',
      '--file',
      '/tmp/video.mp4',
      '--interactive',
    ])

    expect(result.errors).toEqual([])
    expect(result.exitCode).toBeUndefined()
    expect(promptForProductSelection).toHaveBeenCalledWith([product])
    expect(printResult).toHaveBeenCalledWith({
      products: [
        {
          ...product,
          productType: 'showcase',
        },
      ],
      selectedProduct: product,
      upload: { videoFileId: 'file-2' },
      publish: { videoId: 'video-2' },
    })
  })

  it('preserves large numeric ids from raw argv', async () => {
    uploadTtsVideo.mockResolvedValueOnce({ videoFileId: '8123456789012345678' })
    publishTtsVideo.mockResolvedValueOnce({
      publish: { videoId: 'video-1' },
      productTitle: 'Manual product',
    })

    const result = await runCommand(register, [
      'publish-tts-flow',
      '--creator-id=7123456789012345678',
      '--file',
      '/tmp/video.mp4',
      '--product-id',
      '9123456789012345678',
      '--product-title',
      'Manual product',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(fetchProductPool).not.toHaveBeenCalled()
    expect(uploadTtsVideo).toHaveBeenCalledWith(
      '/tmp/video.mp4',
      '7123456789012345678',
      undefined
    )
    expect(publishTtsVideo).toHaveBeenCalledWith(
      '7123456789012345678',
      '8123456789012345678',
      '9123456789012345678',
      'Manual product',
      undefined
    )
  })
})
