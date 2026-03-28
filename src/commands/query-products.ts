import type { CAC } from 'cac'
import { printResult } from '../client/index.js'
import { decodeCursor, queryProductsPage } from '../workflows/index.js'
import type { ProductType, ProductCursor } from '../types/index.js'
import { getRawOptionValue, parseStrictInteger, rethrowIfProcessExit } from './utils.js'

const VALID_PRODUCT_TYPES = ['shop', 'showcase', 'all']

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
        const creatorId = getRawOptionValue(cli.rawArgs, '--creator-id')

        if (!creatorId) {
          console.error('缺少必填参数: --creator-id\n')
          console.error('用法: beervid query-products --creator-id <id>')
          process.exit(1)
        }

        const productType = (options.productType ?? 'all').toLowerCase()
        const pageSize = parseStrictInteger(options.pageSize ?? '20', '--page-size')
        const cursor = options.cursor ?? ''

        if (!VALID_PRODUCT_TYPES.includes(productType)) {
          console.error('错误: --product-type 必须为 shop、showcase 或 all')
          process.exit(1)
        }
        if (pageSize === undefined || pageSize <= 0 || pageSize > 20) {
          console.error('错误: --page-size 必须为 1 到 20 之间的整数')
          process.exit(1)
        }

        try {
          let inputCursor: ProductCursor = { shopToken: '', showcaseToken: '' }
          if (cursor) {
            try {
              inputCursor = decodeCursor(cursor)
            } catch {
              console.error('错误: 无效的 cursor 格式')
              process.exit(1)
            }
          }

          const pageResult = await queryProductsPage(
            creatorId,
            productType as ProductType,
            pageSize,
            inputCursor
          )

          if (pageResult.successCount === 0 && pageResult.failedSources.length > 0) {
            console.error('查询商品失败: 所有商品源都请求失败')
            process.exit(1)
          }

          const productList = pageResult.products

          console.log(`查询到 ${productList.length} 个商品:\n`)

          for (const p of productList) {
            console.log(`  [${p.source}] ${p.title}`)
            console.log(`    ID: ${p.id}  销量: ${p.salesCount}  品牌: ${p.brandName}`)
            if (p.images.length > 0) console.log(`    图片: ${p.images[0]}`)
            console.log('')
          }

          if (pageResult.nextCursor) {
            console.log(`下一页游标: ${pageResult.nextCursor}`)
            console.log(`使用: beervid query-products --creator-id ${creatorId} --cursor ${pageResult.nextCursor}`)
          } else {
            console.log('已到最后一页')
          }

          printResult(pageResult.rawGroups)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('查询商品失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
