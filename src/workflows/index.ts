import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { openApiPost, openApiUpload, resolveFileInput } from '../client/index.js'
import type {
  UploadTokenData,
  NormalUploadResult,
  TtsUploadResult,
  NormalPublishResult,
  ShoppablePublishResult,
  VideoStatusData,
  QueryVideoData,
  NormalizedVideoItem,
  ProductCursor,
  ProductPageData,
  ProductType,
  NormalizedProductItem,
  WorkflowWarning,
  TTFlowStatusResult,
  TTFlowQueryResult,
  ProductQuerySummary,
  SelectedProductSummary,
} from '../types/index.js'

const MAX_PRODUCT_TITLE_LENGTH = 29
const TERMINAL_STATUSES = ['PUBLISH_COMPLETE', 'FAILED']

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getUploadToken(existingToken?: string): Promise<string> {
  if (existingToken) return existingToken

  const tokenData = await openApiPost<UploadTokenData>('/api/v1/open/upload-token/generate')
  return tokenData.uploadToken
}

export async function uploadNormalVideo(
  fileInput: string,
  uploadToken?: string
): Promise<NormalUploadResult> {
  const file = await resolveFileInput(fileInput)
  const token = await getUploadToken(uploadToken)
  const formData = new FormData()
  formData.append('file', file)

  return openApiUpload<NormalUploadResult>(
    '/api/v1/open/file-upload',
    formData,
    undefined,
    { headerName: 'X-UPLOAD-TOKEN', headerValue: token }
  )
}

export async function uploadTtsVideo(
  fileInput: string,
  creatorId: string,
  uploadToken?: string
): Promise<TtsUploadResult> {
  const file = await resolveFileInput(fileInput)
  const token = await getUploadToken(uploadToken)
  const formData = new FormData()
  formData.append('file', file)

  return openApiUpload<TtsUploadResult>(
    '/api/v1/open/file-upload/tts-video',
    formData,
    { creatorUserOpenId: creatorId },
    { headerName: 'X-UPLOAD-TOKEN', headerValue: token }
  )
}

export async function publishNormalVideo(
  businessId: string,
  videoUrl: string,
  caption?: string
): Promise<NormalPublishResult> {
  return openApiPost<NormalPublishResult>('/api/v1/open/tiktok/video/publish', {
    businessId,
    videoUrl,
    caption: caption ?? '',
  })
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
  for (let i = 1; i <= maxPolls; i++) {
    const data = await openApiPost<VideoStatusData>('/api/v1/open/tiktok/video/status', {
      businessId,
      shareId,
    })

    const status = data.status ?? data.Status ?? 'UNKNOWN'
    if (TERMINAL_STATUSES.includes(status)) {
      return {
        pollCount: i,
        finalStatus: status,
        reason: data.reason ?? null,
        postIds: data.post_ids ?? [],
        raw: data,
      }
    }

    if (i < maxPolls) {
      await sleep(intervalSec * 1000)
    }
  }

  return {
    pollCount: maxPolls,
    finalStatus: 'TIMEOUT',
    reason: `超过最大轮询次数 (${maxPolls})，状态仍未终结`,
    postIds: [],
    raw: null,
  }
}

export function normalizeVideoQuery(data: QueryVideoData): TTFlowQueryResult {
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
): Promise<{ query: TTFlowQueryResult | null; warnings: WorkflowWarning[] }> {
  const warnings: WorkflowWarning[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await openApiPost<QueryVideoData>('/api/v1/open/tiktok/video/query', {
      businessId,
      itemIds: [itemId],
    })
    const normalized = normalizeVideoQuery(data)
    normalized.attempts = attempt

    if (normalized.videos.length > 0) {
      return { query: normalized, warnings }
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

function decodeCursor(cursor: string): ProductCursor {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as ProductCursor
  return {
    shopToken: decoded.shopToken ?? '',
    showcaseToken: decoded.showcaseToken ?? '',
  }
}

function encodeCursor(cursor: ProductCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64')
}

async function queryProductsPage(
  creatorId: string,
  productType: ProductType,
  pageSize: number,
  cursor: ProductCursor
): Promise<{ products: NormalizedProductItem[]; nextCursor: string | null; successCount: number; failedSources: string[] }> {
  const typesToQuery = productType === 'all' ? ['shop', 'showcase'] : [productType]
  const allProducts = new Map<string, NormalizedProductItem>()
  let nextShopToken = ''
  let nextShowcaseToken = ''
  let successCount = 0
  const failedSources: string[] = []

  const results = await Promise.allSettled(
    typesToQuery.map(async (type) => {
      const pageToken = type === 'shop' ? cursor.shopToken : cursor.showcaseToken
      const data = await openApiPost<ProductPageData>('/api/v1/open/tts/products/query', {
        creatorUserOpenId: creatorId,
        productType: type,
        pageSize,
        pageToken,
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

    for (const group of groups) {
      if (type === 'shop') nextShopToken = group.nextPageToken ?? ''
      if (type === 'showcase') nextShowcaseToken = group.nextPageToken ?? ''

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

  const nextCursor =
    nextShopToken || nextShowcaseToken
      ? encodeCursor({ shopToken: nextShopToken, showcaseToken: nextShowcaseToken })
      : null

  return {
    products: Array.from(allProducts.values()),
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
): Promise<{ products: NormalizedProductItem[]; summary: ProductQuerySummary }> {
  const allProducts = new Map<string, NormalizedProductItem>()
  let cursor: ProductCursor = { shopToken: '', showcaseToken: '' }
  let nextCursor: string | null = null
  let pagesScanned = 0
  const failedSourcesSet = new Set<string>()

  for (let page = 1; page <= maxPages; page++) {
    const pageResult = await queryProductsPage(creatorId, productType, pageSize, cursor)
    if (pageResult.successCount === 0) {
      throw new Error('所有商品源都请求失败')
    }

    for (const src of pageResult.failedSources) {
      failedSourcesSet.add(src)
    }

    pagesScanned = page
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
    summary: {
      productType,
      pageSize,
      pagesScanned,
      productCount: allProducts.size,
      nextCursor,
      reachedPageLimit: Boolean(nextCursor) && pagesScanned >= maxPages,
      failedSources: Array.from(failedSourcesSet),
    },
  }
}

export function sortProductsForSelection(
  products: NormalizedProductItem[]
): NormalizedProductItem[] {
  return [...products].sort((a, b) => b.salesCount - a.salesCount)
}

export function buildSelectedProductSummary(
  product: NormalizedProductItem,
  selectionMode: SelectedProductSummary['selectionMode']
): SelectedProductSummary {
  return {
    selectionMode,
    id: product.id,
    title: product.title,
    salesCount: product.salesCount,
    source: product.source,
    price: product.price,
    brandName: product.brandName,
    shopName: product.shopName,
  }
}

export async function promptForProductSelection(
  products: NormalizedProductItem[]
): Promise<NormalizedProductItem> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('交互模式需要在 TTY 终端中运行')
  }

  const candidates = sortProductsForSelection(products).slice(0, 20)
  console.log(`可选商品（展示前 ${candidates.length} 个，按销量降序）：`)
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
