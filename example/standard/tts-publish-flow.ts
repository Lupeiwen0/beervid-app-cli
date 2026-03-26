/**
 * TTS 完整发布流程 — 最佳实践示例
 *
 * 流程：查询商品 → 筛选可发布商品 → 上传视频 → 挂车发布
 *
 * 用法：
 *   npx tsx tts-publish-flow.ts --file ./video.mp4 --creator-id open_user_abc [--caption "Review"]
 *   npx tsx tts-publish-flow.ts --file ./video.mp4 --creator-id open_user_abc --product-id prod_123 --product-title "Widget"
 */

import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { parseArgs } from 'node:util'
import { openApiPost, openApiUpload, withRetry } from './api-client.js'

// ─── 参数解析 ───────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    'creator-id': { type: 'string' },
    caption: { type: 'string', default: '' },
    'product-id': { type: 'string' },
    'product-title': { type: 'string' },
  },
  strict: false,
})

const filePath = values['file']
const creatorId = values['creator-id']
const caption = values['caption'] ?? ''
const manualProductId = values['product-id']
const manualProductTitle = values['product-title']

if (!filePath || !creatorId) {
  console.error('用法: npx tsx tts-publish-flow.ts --file <路径> --creator-id <id>')
  process.exit(1)
}

// ─── 类型定义 ───────────────────────────────────────────────────────────────

interface Product {
  id: string
  title: string
  price?: unknown
  images?: string[]
  salesCount?: number
  source?: string
  reviewStatus?: string
  inventoryStatus?: string
}

interface ProductPageData {
  products?: Product[]
  nextPageToken?: string | null
}

const MAX_PRODUCT_TITLE_LENGTH = 29

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

/** 解析商品图片 URL（原始格式：{height=200, url=https://xxx.jpg, width=200}） */
function extractImageUrl(imageStr: string): string {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? ''
}

/** 判断商品是否可发布（审核通过 + 有库存） */
function isPublishable(product: Product): boolean {
  if (product.reviewStatus && product.reviewStatus.toUpperCase() !== 'APPROVED') return false
  if (product.inventoryStatus && product.inventoryStatus.toUpperCase() !== 'IN_STOCK') return false
  return true
}

// ─── 流程开始 ───────────────────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('TTS 完整发布流程')
console.log('━'.repeat(60))

// ─── 步骤 1：商品选择 ──────────────────────────────────────────────────────

let selectedProduct: { id: string; title: string }

if (manualProductId && manualProductTitle) {
  // 手动指定商品，跳过查询
  console.log('\n[1/4] 使用手动指定商品')
  selectedProduct = {
    id: manualProductId,
    title: manualProductTitle.slice(0, MAX_PRODUCT_TITLE_LENGTH),
  }
  console.log(`  商品 ID: ${selectedProduct.id}`)
  console.log(`  商品标题: ${selectedProduct.title}`)
} else {
  // 自动查询商品并选择销量最高的
  console.log('\n[1/4] 查询商品列表...')

  const allProducts = new Map<string, Product>()

  // 同时查 shop + showcase 两种来源
  for (const productType of ['shop', 'showcase'] as const) {
    let pageToken = ''
    let page = 0
    const maxPages = 3

    while (page < maxPages) {
      page++
      try {
        const data = await withRetry(
          () => openApiPost<ProductPageData | ProductPageData[]>(
            '/api/v1/open/tts/products/query',
            {
              creatorUserOpenId: creatorId,
              productType,
              pageSize: 20,
              pageToken,
            }
          ),
          { maxRetries: 2, baseDelay: 2000, label: `查询 ${productType} 商品` }
        )

        const groups = Array.isArray(data) ? data : [data]
        for (const group of groups) {
          for (const product of group.products ?? []) {
            if (!allProducts.has(product.id)) {
              allProducts.set(product.id, {
                ...product,
                images: (product.images ?? []).map(extractImageUrl),
                source: product.source ?? productType,
              })
            }
          }

          if (group.nextPageToken === null || group.nextPageToken === undefined) {
            pageToken = ''
            break
          }
          pageToken = group.nextPageToken
        }
      } catch (err) {
        console.warn(`  ⚠ ${productType} 商品查询失败: ${(err as Error).message}`)
        break
      }

      if (!pageToken) break
    }
  }

  console.log(`  共获取 ${allProducts.size} 个商品`)

  // 筛选可发布商品，按销量排序
  const publishable = Array.from(allProducts.values())
    .filter(isPublishable)
    .sort((a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0))

  if (publishable.length === 0) {
    console.error('  ✗ 没有可发布的商品（审核未通过或无库存）')
    console.error('  提示: 使用 --product-id + --product-title 手动指定')
    process.exit(1)
  }

  const best = publishable[0]!
  selectedProduct = {
    id: best.id,
    title: best.title.slice(0, MAX_PRODUCT_TITLE_LENGTH),
  }

  console.log(`  ✓ 自动选择销量最高商品:`)
  console.log(`    ID: ${best.id}`)
  console.log(`    标题: ${selectedProduct.title}`)
  console.log(`    销量: ${best.salesCount ?? 0}`)
  console.log(`    来源: ${best.source ?? '-'}`)
  console.log(`    可发布商品共 ${publishable.length} 个`)
}

// ─── 步骤 2：获取上传凭证 ──────────────────────────────────────────────────

console.log('\n[2/4] 获取上传凭证...')

const tokenData = await withRetry(
  () => openApiPost<{ uploadToken: string; expiresIn: number }>(
    '/api/v1/open/upload-token/generate'
  ),
  { maxRetries: 3, baseDelay: 1000, label: '获取上传凭证' }
)

console.log(`  ✓ 获得上传凭证（有效期 ${tokenData.expiresIn} 秒）`)

// ─── 步骤 3：上传视频（TTS 专用端点） ──────────────────────────────────────

console.log('\n[3/4] 上传挂车视频...')

const absPath = resolve(filePath)
const buffer = readFileSync(absPath)
const fileName = basename(absPath)
const file = new File([buffer], fileName, { type: 'video/mp4' })

console.log(`  文件: ${fileName} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`)

const formData = new FormData()
formData.append('file', file)

// 注意：TTS 上传端点不同于普通上传，需要 creatorUserOpenId 作为 query 参数
const uploadResult = await withRetry(
  () => openApiUpload<{ videoFileId: string }>(
    '/api/v1/open/file-upload/tts-video',
    formData,
    {
      params: { creatorUserOpenId: creatorId },
      uploadToken: tokenData.uploadToken,
    }
  ),
  { maxRetries: 2, baseDelay: 5000, label: 'TTS 视频上传' }
)

console.log(`  ✓ 上传成功，videoFileId: ${uploadResult.videoFileId}`)

// ─── 步骤 4：发布挂车视频 ──────────────────────────────────────────────────

console.log('\n[4/4] 发布挂车视频...')

// ⚠️ 发布操作不重试！
const publishResult = await openApiPost<{ videoId: string }>(
  '/api/v1/open/tts/shoppable-video/publish',
  {
    creatorUserOpenId: creatorId,
    fileId: uploadResult.videoFileId,
    title: caption,
    productId: selectedProduct.id,
    productTitle: selectedProduct.title,
  }
)

// 注意：挂车视频发布后立即完成，无需轮询
console.log(`  ✓ 发布完成！视频 ID: ${publishResult.videoId}`)

// ─── 结果汇总 ──────────────────────────────────────────────────────────────

console.log('\n' + '━'.repeat(60))
console.log('流程完成！')
console.log(JSON.stringify({
  creatorId,
  selectedProduct,
  videoFileId: uploadResult.videoFileId,
  videoId: publishResult.videoId,
}, null, 2))
