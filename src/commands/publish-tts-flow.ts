import type { CAC } from 'cac'
import { printResult } from '../client/index.js'
import {
  fetchProductPool,
  sortProductsForSelection,
  buildSelectedProductSummary,
  promptForProductSelection,
  uploadTtsVideo,
  publishTtsVideo,
} from '../workflows/index.js'
import type {
  ProductType,
  SelectedProductSummary,
  TTSWorkflowResult,
  WorkflowWarning,
  NormalizedProductItem,
} from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

const VALID_PRODUCT_TYPES = ['shop', 'showcase', 'all']

function parsePositiveInt(value: string | undefined, optionName: string, defaultValue: number): number {
  const parsed = parseInt(value ?? `${defaultValue}`, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`错误: ${optionName} 必须为大于 0 的整数`)
    process.exit(1)
  }
  return parsed
}

function buildManualProduct(
  productId: string,
  productTitle: string,
  matchedProduct?: NormalizedProductItem
): NormalizedProductItem {
  if (matchedProduct) {
    return {
      ...matchedProduct,
      title: productTitle,
    }
  }

  return {
    id: productId,
    title: productTitle,
    price: null,
    images: [],
    salesCount: 0,
    brandName: '',
    shopName: '',
    source: 'manual',
    reviewStatus: undefined,
    inventoryStatus: undefined,
  }
}

export function register(cli: CAC): void {
  cli
    .command('publish-tts-flow', '执行 TTS 完整发布流程：查商品、选商品、上传、发布')
    .option('--creator-id <id>', 'TTS 账号 creatorUserOpenId（必填）')
    .option('--file <path>', '视频文件路径或 URL（必填）')
    .option('--caption <text>', '视频标题/文案（可选）')
    .option('--token <token>', '已有上传凭证（可选）')
    .option('--product-type <type>', '商品来源: shop / showcase / all（默认 all）')
    .option('--page-size <n>', '每页数量（默认 20）')
    .option('--max-product-pages <n>', '商品扫描最大页数（默认 5）')
    .option('--product-id <id>', '手动指定商品 ID')
    .option('--product-title <title>', '手动指定商品标题')
    .option('--interactive', '交互式选择商品')
    .action(
      async (options: {
        creatorId?: string
        file?: string
        caption?: string
        token?: string
        productType?: string
        pageSize?: string
        maxProductPages?: string
        productId?: string
        productTitle?: string
        interactive?: boolean
      }) => {
        if (!options.creatorId || !options.file) {
          const missing = [
            !options.creatorId && '--creator-id',
            !options.file && '--file',
          ].filter(Boolean)
          console.error(`缺少必填参数: ${missing.join(', ')}\n`)
          console.error(
            '用法: beervid publish-tts-flow --creator-id <id> --file <路径或URL> [--interactive]'
          )
          process.exit(1)
        }

        const productType = (options.productType ?? 'all').toLowerCase()
        if (!VALID_PRODUCT_TYPES.includes(productType)) {
          console.error('错误: --product-type 必须为 shop、showcase 或 all')
          process.exit(1)
        }

        if (options.productId && options.interactive) {
          console.error('错误: --product-id 与 --interactive 不能同时使用')
          process.exit(1)
        }
        if (options.productTitle && !options.productId) {
          console.error('错误: --product-title 需要与 --product-id 一起使用')
          process.exit(1)
        }

        const pageSize = parsePositiveInt(options.pageSize, '--page-size', 20)
        const maxProductPages = parsePositiveInt(
          options.maxProductPages,
          '--max-product-pages',
          5
        )

        try {
          console.log('开始执行 TTS 完整发布流程...')

          console.log('1/4 正在查询商品列表...')
          const productPool = await fetchProductPool(
            options.creatorId,
            productType as ProductType,
            pageSize,
            maxProductPages
          )
          const warnings: WorkflowWarning[] = []

          if (productPool.summary.reachedPageLimit && productPool.summary.nextCursor) {
            warnings.push({
              code: 'PRODUCT_SCAN_LIMIT_REACHED',
              message: `商品扫描已达到页数上限 ${maxProductPages}，仍存在未拉取分页`,
            })
          }

          if (productPool.summary.failedSources.length > 0) {
            warnings.push({
              code: 'PRODUCT_SOURCE_PARTIAL_FAILURE',
              message: `以下商品源请求失败: ${productPool.summary.failedSources.join(', ')}，商品池可能不完整`,
            })
          }

          if (productPool.products.length === 0) {
            console.error('TTS 完整发布流程失败: 当前商品池为空，无法选择商品')
            process.exit(1)
          }

          let selectionMode: SelectedProductSummary['selectionMode'] = 'automatic'
          let selectedProduct: NormalizedProductItem

          if (options.productId) {
            selectionMode = 'manual'
            const matchedProduct = productPool.products.find(
              (product) => product.id === options.productId
            )
            const resolvedTitle = options.productTitle ?? matchedProduct?.title
            if (!resolvedTitle) {
              console.error(
                '错误: 手动指定 --product-id 时，如无法从已扫描商品池补齐标题，则必须显式传入 --product-title'
              )
              process.exit(1)
            }
            selectedProduct = buildManualProduct(options.productId, resolvedTitle, matchedProduct)
            if (!matchedProduct) {
              warnings.push({
                code: 'PRODUCT_NOT_IN_SCANNED_POOL',
                message: '手动指定的商品 ID 未出现在已扫描商品池中，已使用显式参数继续发布',
              })
            }
          } else if (options.interactive) {
            selectionMode = 'interactive'
            console.log('2/4 请选择要挂车的商品...')
            selectedProduct = await promptForProductSelection(productPool.products)
          } else {
            console.log('2/4 正在自动选择商品（按销量最高优先）...')
            selectedProduct = sortProductsForSelection(productPool.products)[0]!
          }

          console.log('3/4 正在上传挂车视频...')
          const upload = await uploadTtsVideo(options.file, options.creatorId, options.token)

          console.log('4/4 正在发布挂车视频...')
          const publishResult = await publishTtsVideo(
            options.creatorId,
            upload.videoFileId,
            selectedProduct.id,
            selectedProduct.title,
            options.caption
          )

          if (publishResult.productTitle !== selectedProduct.title) {
            warnings.push({
              code: 'PRODUCT_TITLE_TRUNCATED',
              message: '商品标题超过 29 字符，发布时已自动截断',
            })
          }

          const result: TTSWorkflowResult = {
            flowType: 'tts',
            productQuery: productPool.summary,
            selectedProduct: buildSelectedProductSummary(selectedProduct, selectionMode),
            upload,
            publish: publishResult.publish,
            warnings,
          }

          printResult(result)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('TTS 完整发布流程失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
