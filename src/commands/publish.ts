import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type { NormalPublishResult, ShoppablePublishResult } from '../types/index.js'

const MAX_PRODUCT_TITLE_LENGTH = 29
const VALID_PUBLISH_TYPES = ['normal', 'shoppable']

export function register(cli: CAC): void {
  cli
    .command('publish', '发布 TikTok 视频（普通/挂车）')
    .option('--type <type>', '发布类型: normal（默认）或 shoppable')
    .option('--business-id <id>', 'TT 账号 businessId（普通发布必填）')
    .option('--video-url <url>', '上传后的视频 URL（普通发布必填）')
    .option('--creator-id <id>', 'TTS 账号 creatorUserOpenId（挂车发布必填）')
    .option('--file-id <id>', '上传返回的 videoFileId（挂车发布必填）')
    .option('--product-id <id>', '商品 ID（挂车发布必填）')
    .option('--product-title <title>', '商品标题，最多 29 字符（挂车发布必填）')
    .option('--caption <text>', '视频描述/文案（可选）')
    .action(
      async (options: {
        type?: string
        businessId?: string
        videoUrl?: string
        creatorId?: string
        fileId?: string
        productId?: string
        productTitle?: string
        caption?: string
      }) => {
        const publishType = (options.type ?? 'normal').toLowerCase()
        if (!VALID_PUBLISH_TYPES.includes(publishType)) {
          console.error('错误: --type 必须为 normal 或 shoppable')
          process.exit(1)
        }

        try {
          let data: NormalPublishResult | ShoppablePublishResult

          if (publishType === 'shoppable') {
            const missing = [
              !options.creatorId && '--creator-id',
              !options.fileId && '--file-id',
              !options.productId && '--product-id',
              !options.productTitle && '--product-title',
            ].filter(Boolean)

            if (missing.length > 0) {
              console.error(`缺少必填参数: ${missing.join(', ')}\n`)
              console.error(
                'beervid publish --type shoppable --creator-id <id> --file-id <id> --product-id <id> --product-title <title> [--caption <text>]'
              )
              process.exit(1)
            }

            const productTitle = options.productTitle!.slice(0, MAX_PRODUCT_TITLE_LENGTH)
            if (options.productTitle!.length > MAX_PRODUCT_TITLE_LENGTH) {
              console.log(
                `注意: productTitle 超过 ${MAX_PRODUCT_TITLE_LENGTH} 字符，已自动截断为: "${productTitle}"`
              )
            }

            console.log('挂车视频发布中...')
            data = await openApiPost<ShoppablePublishResult>(
              '/api/v1/open/tts/shoppable-video/publish',
              {
                creatorUserOpenId: options.creatorId!,
                fileId: options.fileId!,
                title: options.caption ?? '',
                productId: options.productId!,
                productTitle,
              }
            )

            console.log('\n发布成功（挂车视频立即完成）:')
          } else {
            const missing = [
              !options.businessId && '--business-id',
              !options.videoUrl && '--video-url',
            ].filter(Boolean)

            if (missing.length > 0) {
              console.error(`缺少必填参数: ${missing.join(', ')}\n`)
              console.error(
                'beervid publish --type normal --business-id <id> --video-url <url> [--caption <text>]'
              )
              process.exit(1)
            }

            console.log('普通视频发布中...')
            data = await openApiPost<NormalPublishResult>(
              '/api/v1/open/tiktok/video/publish',
              {
                businessId: options.businessId!,
                videoUrl: options.videoUrl!,
                caption: options.caption ?? '',
              }
            )

            console.log('\n发布已提交（需轮询状态）:')
            console.log(
              `提示: 使用 beervid poll-status --business-id ${options.businessId!} --share-id ${(data as NormalPublishResult).shareId} 轮询进度`
            )
          }

          printResult(data)
        } catch (err) {
          console.error('发布失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
