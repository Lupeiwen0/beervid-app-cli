import { describe, expect, it, vi } from 'vitest'

const { openApiPost } = vi.hoisted(() => ({
  openApiPost: vi.fn(),
}))

vi.mock('../../src/client/index.js', () => ({
  openApiPost,
}))

import {
  fetchProductPool,
  isProductPublishable,
  queryProductsPage,
  sortProductsForSelection,
} from '../../src/workflows/index.js'
import type { NormalizedProductItem } from '../../src/types/index.js'

describe('workflow product pagination', () => {
  it('keeps null cursor tokens so exhausted sources are not fetched again', async () => {
    openApiPost
      .mockResolvedValueOnce({
        nextPageToken: null,
        products: [
          {
            id: 'shop-1',
            title: 'Shop page 1',
            salesCount: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        nextPageToken: 'showcase-next',
        products: [
          {
            id: 'showcase-1',
            title: 'Showcase page 1',
            salesCount: 20,
          },
        ],
      })
      .mockResolvedValueOnce({
        nextPageToken: null,
        products: [
          {
            id: 'showcase-2',
            title: 'Showcase page 2',
            salesCount: 30,
          },
        ],
      })

    const result = await fetchProductPool('creator-1', 'all', 20, 5)

    expect(openApiPost).toHaveBeenCalledTimes(3)
    expect(openApiPost).toHaveBeenNthCalledWith(1, '/api/v1/open/tts/products/query', {
      creatorUserOpenId: 'creator-1',
      productType: 'shop',
      pageSize: 20,
      pageToken: '',
    })
    expect(openApiPost).toHaveBeenNthCalledWith(2, '/api/v1/open/tts/products/query', {
      creatorUserOpenId: 'creator-1',
      productType: 'showcase',
      pageSize: 20,
      pageToken: '',
    })
    expect(openApiPost).toHaveBeenNthCalledWith(3, '/api/v1/open/tts/products/query', {
      creatorUserOpenId: 'creator-1',
      productType: 'showcase',
      pageSize: 20,
      pageToken: 'showcase-next',
    })
    expect(result.products).toEqual([
      {
        id: 'shop-1',
        title: 'Shop page 1',
        price: undefined,
        images: [],
        salesCount: 10,
        brandName: '',
        shopName: '',
        source: 'shop',
        reviewStatus: undefined,
        inventoryStatus: undefined,
      },
      {
        id: 'showcase-1',
        title: 'Showcase page 1',
        price: undefined,
        images: [],
        salesCount: 20,
        brandName: '',
        shopName: '',
        source: 'showcase',
        reviewStatus: undefined,
        inventoryStatus: undefined,
      },
      {
        id: 'showcase-2',
        title: 'Showcase page 2',
        price: undefined,
        images: [],
        salesCount: 30,
        brandName: '',
        shopName: '',
        source: 'showcase',
        reviewStatus: undefined,
        inventoryStatus: undefined,
      },
    ])
    expect(result.summary).toEqual({
      productType: 'all',
      pageSize: 20,
      pagesScanned: 2,
      productCount: 3,
      nextCursor: null,
      reachedPageLimit: false,
      failedSources: [],
    })
  })

  it('returns null nextCursor when a single queried source is exhausted', async () => {
    openApiPost.mockResolvedValueOnce({
      nextPageToken: null,
      products: [
        {
          id: 'shop-1',
          title: 'Shop page 1',
          salesCount: 10,
        },
      ],
    })

    const result = await queryProductsPage('creator-1', 'shop', 20, {
      shopToken: '',
      showcaseToken: '',
    })

    expect(openApiPost).toHaveBeenCalledTimes(1)
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/tts/products/query', {
      creatorUserOpenId: 'creator-1',
      productType: 'shop',
      pageSize: 20,
      pageToken: '',
    })
    expect(result.nextCursor).toBeNull()
  })
})

function makeProduct(overrides: Partial<NormalizedProductItem> = {}): NormalizedProductItem {
  return {
    id: 'p-1',
    title: 'Test product',
    price: 100,
    images: [],
    salesCount: 10,
    brandName: 'Brand',
    shopName: 'Shop',
    source: 'shop',
    reviewStatus: undefined,
    inventoryStatus: undefined,
    ...overrides,
  }
}

describe('isProductPublishable', () => {
  it('returns true when reviewStatus and inventoryStatus are undefined', () => {
    expect(isProductPublishable(makeProduct())).toBe(true)
  })

  it('returns true for APPROVED and IN_STOCK', () => {
    expect(isProductPublishable(makeProduct({ reviewStatus: 'APPROVED', inventoryStatus: 'IN_STOCK' }))).toBe(true)
  })

  it('returns false for REJECTED reviewStatus', () => {
    expect(isProductPublishable(makeProduct({ reviewStatus: 'REJECTED' }))).toBe(false)
  })

  it('returns false for PENDING reviewStatus', () => {
    expect(isProductPublishable(makeProduct({ reviewStatus: 'PENDING' }))).toBe(false)
  })

  it('returns false for OUT_OF_STOCK inventoryStatus', () => {
    expect(isProductPublishable(makeProduct({ inventoryStatus: 'OUT_OF_STOCK' }))).toBe(false)
  })

  it('handles case-insensitive status values', () => {
    expect(isProductPublishable(makeProduct({ reviewStatus: 'approved', inventoryStatus: 'in_stock' }))).toBe(true)
    expect(isProductPublishable(makeProduct({ reviewStatus: 'Rejected' }))).toBe(false)
  })
})

describe('sortProductsForSelection', () => {
  it('filters out unpublishable products and sorts by salesCount descending', () => {
    const products = [
      makeProduct({ id: 'a', salesCount: 5, reviewStatus: 'APPROVED' }),
      makeProduct({ id: 'b', salesCount: 50, reviewStatus: 'REJECTED' }),
      makeProduct({ id: 'c', salesCount: 30 }),
      makeProduct({ id: 'd', salesCount: 20, inventoryStatus: 'OUT_OF_STOCK' }),
      makeProduct({ id: 'e', salesCount: 10, reviewStatus: 'APPROVED', inventoryStatus: 'IN_STOCK' }),
    ]

    const result = sortProductsForSelection(products)

    expect(result.map((p) => p.id)).toEqual(['c', 'e', 'a'])
  })

  it('returns empty array when no products are publishable', () => {
    const products = [
      makeProduct({ id: 'a', reviewStatus: 'REJECTED' }),
      makeProduct({ id: 'b', inventoryStatus: 'OUT_OF_STOCK' }),
    ]

    expect(sortProductsForSelection(products)).toEqual([])
  })
})
