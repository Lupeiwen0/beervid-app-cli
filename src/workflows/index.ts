import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { openApiPost } from '../client/index.js'
import type {
  NormalPublishResult,
  NormalPublishOptions,
  ShoppablePublishResult,
  VideoStatusData,
  QueryVideoData,
  NormalizedVideoItem,
  ProductCursor,
  ProductPageData,
  ProductType,
  NormalizedProductItem,
  FlatProductItem,
  WorkflowWarning,
  TTFlowStatusResult,
} from '../types/index.js'

export {
  getUploadToken,
  uploadNormalVideo,
  uploadTtsVideo,
} from '../utils/upload.js'

const MAX_PRODUCT_TITLE_LENGTH = 30

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function publishNormalVideo(
  businessId: string,
  videoUrl: string,
  options: NormalPublishOptions = {}
): Promise<NormalPublishResult> {
  const body: Record<string, unknown> = {
    businessId,
    videoUrl,
    caption: options.caption ?? '',
  }

  if (options.isBrandOrganic !== undefined) body.isBrandOrganic = options.isBrandOrganic
  if (options.isBrandedContent !== undefined) body.isBrandedContent = options.isBrandedContent
  if (options.disableComment !== undefined) body.disableComment = options.disableComment
  if (options.disableDuet !== undefined) body.disableDuet = options.disableDuet
  if (options.disableStitch !== undefined) body.disableStitch = options.disableStitch
  if (options.thumbnailOffset !== undefined) body.thumbnailOffset = options.thumbnailOffset

  return openApiPost<NormalPublishResult>('/api/v1/open/tiktok/video/publish', body)
}

export async function publishTtsVideo(
  creatorId: string,
  fileId: string,
  productId: string,
  productTitle: string,
  caption?: string
): Promise<{ publish: ShoppablePublishResult; productTitle: string }> {
  const normalizedTitle = productTitle.slice(0, MAX_PRODUCT_TITLE_LENGTH)
  const publish = await openApiPost<ShoppablePublishResult>(
    '/api/v1/open/tts/shoppable-video/publish',
    {
      creatorUserOpenId: creatorId,
      fileId,
      title: caption ?? '',
      productId,
      productTitle: normalizedTitle,
    }
  )

  return { publish, productTitle: normalizedTitle }
}

export async function pollNormalVideoStatus(
  businessId: string,
  shareId: string,
  intervalSec: number,
  maxPolls: number
): Promise<TTFlowStatusResult> {
  let lastData: VideoStatusData | null = null
  let lastStatus = 'UNKNOWN'

  for (let i = 1; i <= maxPolls; i++) {
    const data = await openApiPost<VideoStatusData>('/api/v1/open/tiktok/video/status', {
      businessId,
      shareId,
    })

    lastData = data
    const status = data.status ?? data.Status ?? 'UNKNOWN'
    const postIds = data.post_ids ?? []
    lastStatus = status

    if (status === 'FAILED') {
      return {
        pollCount: i,
        finalStatus: status,
        reason: data.reason ?? null,
        postIds,
        raw: data,
      }
    }

    if (status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
      return {
        pollCount: i,
        finalStatus: status,
        reason: data.reason ?? null,
        postIds,
        raw: data,
      }
    }

    // PUBLISH_COMPLETE but no post_ids yet — keep polling

    if (i < maxPolls) {
      await sleep(intervalSec * 1000)
    }
  }

  return {
    pollCount: maxPolls,
    finalStatus: 'TIMEOUT',
    reason:
      lastStatus === 'PUBLISH_COMPLETE'
        ? `超过最大轮询次数 (${maxPolls})，状态为 PUBLISH_COMPLETE 但 post_ids 仍为空`
        : `超过最大轮询次数 (${maxPolls})，仍未拿到 post_ids`,
    postIds: [],
    raw: lastData,
  }
}

export function normalizeVideoQuery(data: QueryVideoData): {
  attempts: number
  videos: NormalizedVideoItem[]
  raw: QueryVideoData
} {
  const list = data.videoList ?? data.videos ?? []
  const videos: NormalizedVideoItem[] = list.map((video) => ({
    itemId: video.itemId ?? video.item_id,
    videoViews: video.videoViews ?? video.video_views ?? 0,
    likes: video.likes ?? 0,
    comments: video.comments ?? 0,
    shares: video.shares ?? 0,
    thumbnailUrl: video.thumbnailUrl ?? video.thumbnail_url ?? '',
    shareUrl: video.shareUrl ?? video.share_url ?? '',
  }))

  return {
    attempts: 1,
    videos,
    raw: data,
  }
}

export async function queryVideoWithRetry(
  businessId: string,
  itemId: string,
  intervalSec: number,
  maxAttempts: number
): Promise<{ query: QueryVideoData | null; warnings: WorkflowWarning[] }> {
  const warnings: WorkflowWarning[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await openApiPost<QueryVideoData>('/api/v1/open/tiktok/video/query', {
      businessId,
      itemIds: [itemId],
    })
    const list = data.videoList ?? data.videos ?? []

    if (list.length > 0) {
      return { query: data, warnings }
    }

    if (attempt < maxAttempts) {
      await sleep(intervalSec * 1000)
    }
  }

  warnings.push({
    code: 'VIDEO_QUERY_EMPTY',
    message: `视频数据查询在 ${maxAttempts} 次尝试后仍为空，已返回 query: null`,
  })

  return { query: null, warnings }
}

function extractImageUrl(imageStr: string): string {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? imageStr
}

// Decode a base64-encoded cursor into a ProductCursor.
// Token semantics: undefined → '' (first page), null preserved (source exhausted).
export function decodeCursor(cursor: string): ProductCursor {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as ProductCursor
  return {
    shopToken: decoded.shopToken === undefined ? '' : decoded.shopToken,
    showcaseToken: decoded.showcaseToken === undefined ? '' : decoded.showcaseToken,
  }
}

export function encodeCursor(cursor: ProductCursor): string | null {
  // Both null means all sources exhausted — no next page
  if (cursor.shopToken === null && cursor.showcaseToken === null) return null
  return Buffer.from(JSON.stringify(cursor)).toString('base64')
}

export function flattenProductGroups(rawGroups: ProductPageData[]): FlatProductItem[] {
  const seen = new Set<string>()
  const list: FlatProductItem[] = []
  for (const group of rawGroups) {
    const groupType = (group as Record<string, unknown>).productType as string | undefined
    for (const product of group.products ?? []) {
      if (!seen.has(product.id)) {
        seen.add(product.id)
        list.push({ ...product, productType: groupType ?? product.source ?? '' })
      }
    }
  }
  return list
}

export async function queryProductsPage(
  creatorId: string,
  productType: ProductType,
  pageSize: number,
  cursor: ProductCursor
): Promise<{
  products: NormalizedProductItem[]
  rawGroups: ProductPageData[]
  nextCursor: string | null
  successCount: number
  failedSources: string[]
}> {
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 20)
  const allTypesToQuery = productType === 'all' ? ['shop', 'showcase'] : [productType]
  // Skip sources whose token is null — they already reached the last page
  const typesToQuery = allTypesToQuery.filter((type) => {
    const token = type === 'shop' ? cursor.shopToken : cursor.showcaseToken
    return token !== null
  })
  const allProducts = new Map<string, NormalizedProductItem>()
  const rawGroups: ProductPageData[] = []
  let nextShopToken: string | null = productType === 'showcase' ? null : cursor.shopToken
  let nextShowcaseToken: string | null = productType === 'shop' ? null : cursor.showcaseToken
  let successCount = 0
  const failedSources: string[] = []

  const results = await Promise.allSettled(
    typesToQuery.map(async (type) => {
      const pageToken = type === 'shop' ? cursor.shopToken : cursor.showcaseToken
      const data = await openApiPost<ProductPageData>('/api/v1/open/tts/products/query', {
        creatorUserOpenId: creatorId,
        productType: type,
        pageSize: normalizedPageSize,
        pageToken: pageToken ?? '',
      })
      return { type, data }
    })
  )

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const type = typesToQuery[i]

    if (result.status === 'rejected') {
      console.warn(`Failed to query products for type "${type}":`, result.reason)
      failedSources.push(type)
      continue
    }

    successCount += 1
    const { data } = result.value
    const groups = Array.isArray(data) ? data : [data]
    rawGroups.push(...groups)

    for (const group of groups) {
      // Preserve null — it means "this source has no more pages"
      const token = group.nextPageToken === undefined ? null : group.nextPageToken
      if (type === 'shop') nextShopToken = token
      if (type === 'showcase') nextShowcaseToken = token

      for (const product of group.products ?? []) {
        if (!allProducts.has(product.id)) {
          allProducts.set(product.id, {
            id: product.id,
            title: product.title,
            price: product.price,
            images: (product.images ?? []).map(extractImageUrl),
            salesCount: product.salesCount ?? 0,
            brandName: product.brandName ?? '',
            shopName: product.shopName ?? '',
            source: product.source ?? type,
            reviewStatus: product.reviewStatus,
            inventoryStatus: product.inventoryStatus,
          })
        }
      }
    }
  }

  const nextCursor = encodeCursor({ shopToken: nextShopToken, showcaseToken: nextShowcaseToken })

  return {
    products: Array.from(allProducts.values()),
    rawGroups,
    nextCursor,
    successCount,
    failedSources,
  }
}

export async function fetchProductPool(
  creatorId: string,
  productType: ProductType,
  pageSize: number,
  maxPages: number
): Promise<{
  products: NormalizedProductItem[]
  rawGroups: ProductPageData[]
  summary: {
    productType: ProductType
    pageSize: number
    pagesScanned: number
    productCount: number
    nextCursor: string | null
    reachedPageLimit: boolean
    failedSources: string[]
  }
}> {
  const allProducts = new Map<string, NormalizedProductItem>()
  const rawGroups: ProductPageData[] = []
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 20)
  let cursor: ProductCursor = { shopToken: '', showcaseToken: '' } // empty string = first page
  let nextCursor: string | null = null
  let pagesScanned = 0
  const failedSourcesSet = new Set<string>()

  for (let page = 1; page <= maxPages; page++) {
    const pageResult = await queryProductsPage(creatorId, productType, normalizedPageSize, cursor)
    if (pageResult.successCount === 0) {
      throw new Error('所有商品源都请求失败')
    }

    for (const src of pageResult.failedSources) {
      failedSourcesSet.add(src)
    }

    pagesScanned = page
    rawGroups.push(...pageResult.rawGroups)
    for (const product of pageResult.products) {
      if (!allProducts.has(product.id)) {
        allProducts.set(product.id, product)
      }
    }

    nextCursor = pageResult.nextCursor
    if (!nextCursor) {
      break
    }

    cursor = decodeCursor(nextCursor)
  }

  return {
    products: Array.from(allProducts.values()),
    rawGroups,
    summary: {
      productType,
      pageSize: normalizedPageSize,
      pagesScanned,
      productCount: allProducts.size,
      nextCursor,
      reachedPageLimit: Boolean(nextCursor) && pagesScanned >= maxPages,
      failedSources: Array.from(failedSourcesSet),
    },
  }
}

export function isProductPublishable(product: NormalizedProductItem): boolean {
  if (product.reviewStatus && product.reviewStatus.toUpperCase() !== 'APPROVED') return false
  if (product.inventoryStatus && product.inventoryStatus.toUpperCase() !== 'IN_STOCK') return false
  return true
}

export function sortProductsForSelection(
  products: NormalizedProductItem[]
): NormalizedProductItem[] {
  return products.filter(isProductPublishable).sort((a, b) => b.salesCount - a.salesCount)
}

export async function promptForProductSelection(
  products: NormalizedProductItem[]
): Promise<NormalizedProductItem> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('交互模式需要在 TTY 终端中运行')
  }

  const candidates = products
    .filter(isProductPublishable)
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 20)

  if (candidates.length === 0) {
    throw new Error('当前商品池中没有可发布商品（审核未通过或无库存），如需强制指定请使用 --product-id/--product-title')
  }

  console.log(`可选商品（展示前 ${candidates.length} 个，按销量降序，已过滤不可发布商品）：`)
  for (const [index, product] of candidates.entries()) {
    console.log(
      `${index + 1}. [${product.source}] ${product.title} | ID: ${product.id} | 销量: ${product.salesCount}`
    )
  }
  if (products.length > candidates.length) {
    console.log('商品较多，如需选择其他商品，请改用 --product-id/--product-title。')
  }

  const rl = createInterface({ input, output })
  try {
    while (true) {
      const answer = await rl.question(`请输入商品序号 (1-${candidates.length}): `)
      const selectedIndex = parseInt(answer.trim(), 10)
      if (!Number.isNaN(selectedIndex) && selectedIndex >= 1 && selectedIndex <= candidates.length) {
        return candidates[selectedIndex - 1]!
      }
      console.log('输入无效，请重新输入商品序号。')
    }
  } finally {
    rl.close()
  }
}
