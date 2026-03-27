/**
 * TTS 商品查询与分页示例
 *
 * 用法：
 *   npx tsx query-products.ts --creator-id open_user_abc
 *   npx tsx query-products.ts --creator-id open_user_abc --type shop --max-pages 3
 */

import { parseArgs } from 'node:util'
import { openApiPost, withRetry } from './api-client.js'

const { values } = parseArgs({
  options: {
    'creator-id': { type: 'string' },
    type: { type: 'string', default: 'all' },
    'page-size': { type: 'string', default: '20' },
    'max-pages': { type: 'string', default: '5' },
  },
  strict: false,
})

const creatorId = values['creator-id']
const productTypes = values['type'] === 'all' ? ['shop', 'showcase'] : [values['type'] ?? 'shop']
const pageSize = parseInt(values['page-size'] ?? '20', 10)
const maxPages = parseInt(values['max-pages'] ?? '5', 10)

if (!creatorId) {
  console.error('用法: npx tsx query-products.ts --creator-id <id>')
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

interface ProductPage {
  products?: Product[]
  nextPageToken?: string | null
}

// ─── 查询商品 ───────────────────────────────────────────────────────────────

console.log(`查询商品（创作者: ${creatorId}）\n`)

const allProducts = new Map<string, Product>()

for (const productType of productTypes) {
  console.log(`--- ${productType} ---`)
  let pageToken = ''
  let page = 0

  while (page < maxPages) {
    page++
    console.log(`  第 ${page} 页...`)

    const data = await withRetry(
      () => openApiPost<ProductPage | ProductPage[]>(
        '/api/v1/open/tts/products/query',
        {
          creatorUserOpenId: creatorId,
          productType,
          pageSize,
          pageToken,
        }
      ),
      { maxRetries: 2, baseDelay: 2000 }
    )

    const groups = Array.isArray(data) ? data : [data]
    let pageProductCount = 0

    for (const group of groups) {
      for (const product of group.products ?? []) {
        pageProductCount++
        if (!allProducts.has(product.id)) {
          // 解析图片 URL
          const images = (product.images ?? []).map((img) => {
            const match = img.match(/url=([^,}]+)/)
            return match?.[1]?.trim() ?? ''
          }).filter(Boolean)

          allProducts.set(product.id, {
            ...product,
            images,
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

    console.log(`    获得 ${pageProductCount} 个商品`)

    if (!pageToken) {
      console.log(`  已到最后一页`)
      break
    }
  }

  if (pageToken) {
    console.log(`  ⚠ 已达到最大页数限制 (${maxPages})，仍有未拉取的分页`)
  }
}

// ─── 结果汇总 ───────────────────────────────────────────────────────────────

const products = Array.from(allProducts.values())
const publishable = products.filter((p) => {
  if (p.reviewStatus && p.reviewStatus.toUpperCase() !== 'APPROVED') return false
  if (p.inventoryStatus && p.inventoryStatus.toUpperCase() !== 'IN_STOCK') return false
  return true
})

console.log(`\n汇总：`)
console.log(`  总商品数: ${products.length}`)
console.log(`  可发布商品: ${publishable.length}`)

if (publishable.length > 0) {
  const sorted = publishable.sort((a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0))
  console.log('\n可发布商品（按销量降序）:')
  for (const [i, p] of sorted.slice(0, 10).entries()) {
    console.log(`  ${i + 1}. [${p.source}] ${p.title} | ID: ${p.id} | 销量: ${p.salesCount ?? 0}`)
  }
  if (sorted.length > 10) {
    console.log(`  ... 共 ${sorted.length} 个`)
  }
}
