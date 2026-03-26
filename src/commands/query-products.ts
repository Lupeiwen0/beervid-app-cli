import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type {
  ProductPageData,
  NormalizedProductItem,
  ProductCursor,
} from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

const VALID_PRODUCT_TYPES = ['shop', 'showcase', 'all']

function extractImageUrl(imageStr: string): string {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? imageStr
}

async function queryProducts(
  creatorId: string,
  type: string,
  pageSize: number,
  pageToken: string
): Promise<ProductPageData> {
  return openApiPost<ProductPageData>('/api/v1/open/tts/products/query', {
    creatorUserOpenId: creatorId,
    productType: type,
    pageSize,
    pageToken,
  })
}

export function register(cli: CAC): void {
  cli
    .command('query-products', '查询 TTS 商品列表')
    .option('--creator-id <id>', 'TTS 账号 creatorUserOpenId（必填）')
    .option('--product-type <type>', '商品来源: shop / showcase / all（默认 all）')
    .option('--page-size <n>', '每页数量（默认 20）')
    .option('--cursor <cursor>', '分页游标（首页不传）')
    .action(
      async (options: {
        creatorId?: string
        productType?: string
        pageSize?: string
        cursor?: string
      }) => {
        if (!options.creatorId) {
          console.error('缺少必填参数: --creator-id\n')
          console.error('用法: beervid query-products --creator-id <id>')
          process.exit(1)
        }

        const creatorId = options.creatorId
        const productType = (options.productType ?? 'all').toLowerCase()
        const pageSize = parseInt(options.pageSize ?? '20', 10)
        const cursor = options.cursor ?? ''

        if (!VALID_PRODUCT_TYPES.includes(productType)) {
          console.error('错误: --product-type 必须为 shop、showcase 或 all')
          process.exit(1)
        }
        if (Number.isNaN(pageSize) || pageSize <= 0) {
          console.error('错误: --page-size 必须为大于 0 的整数')
          process.exit(1)
        }

        try {
          // 解码游标
          let shopToken = ''
          let showcaseToken = ''
          if (cursor) {
            try {
              const decoded = JSON.parse(
                Buffer.from(cursor, 'base64').toString()
              ) as ProductCursor
              shopToken = decoded.shopToken ?? ''
              showcaseToken = decoded.showcaseToken ?? ''
            } catch {
              console.error('错误: 无效的 cursor 格式')
              process.exit(1)
            }
          }

          const typesToQuery = productType === 'all' ? ['shop', 'showcase'] : [productType]
          const allProducts = new Map<string, NormalizedProductItem>()
          let nextShopToken: string | null = null
          let nextShowcaseToken: string | null = null
          let successCount = 0

          // 并行查询
          const results = await Promise.allSettled(
            typesToQuery.map(async (type) => {
              const token = type === 'shop' ? shopToken : showcaseToken
              const data = await queryProducts(creatorId, type, pageSize, token)
              return { type, data }
            })
          )

          for (const result of results) {
            if (result.status === 'rejected') {
              console.error('查询失败:', (result.reason as Error)?.message)
              continue
            }

            const { type, data } = result.value
            successCount += 1
            const items = Array.isArray(data) ? data : [data]

            for (const group of items) {
              if (type === 'shop') nextShopToken = group.nextPageToken ?? null
              if (type === 'showcase') nextShowcaseToken = group.nextPageToken ?? null

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

          if (successCount === 0) {
            console.error('查询商品失败: 所有商品源都请求失败')
            process.exit(1)
          }

          const productList = Array.from(allProducts.values())

          // 构建下一页游标
          let nextCursor: string | null = null
          if (nextShopToken || nextShowcaseToken) {
            nextCursor = Buffer.from(
              JSON.stringify({
                shopToken: nextShopToken ?? '',
                showcaseToken: nextShowcaseToken ?? '',
              })
            ).toString('base64')
          }

          console.log(`查询到 ${productList.length} 个商品:\n`)

          for (const p of productList) {
            console.log(`  [${p.source}] ${p.title}`)
            console.log(`    ID: ${p.id}  销量: ${p.salesCount}  品牌: ${p.brandName}`)
            if (p.images.length > 0) console.log(`    图片: ${p.images[0]}`)
            console.log('')
          }

          if (nextCursor) {
            console.log(`下一页游标: ${nextCursor}`)
            console.log(`使用: beervid query-products --creator-id ${creatorId} --cursor ${nextCursor}`)
          } else {
            console.log('已到最后一页')
          }

          printResult({ products: productList, nextCursor })
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('查询商品失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
