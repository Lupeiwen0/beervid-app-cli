#!/usr/bin/env node

/**
 * 发布 TikTok 视频
 *
 * 支持两种模式：普通发布（TT）和挂车发布（TTS）
 *
 * 用法:
 *   # 普通视频发布
 *   node publish.mjs --type normal \
 *     --business-id biz_12345 \
 *     --video-url https://cdn.beervid.ai/uploads/xxx.mp4 \
 *     --caption "Check out this video! #viral"
 *
 *   # 挂车视频发布
 *   node publish.mjs --type shoppable \
 *     --creator-id open_user_abc \
 *     --file-id vf_abc123 \
 *     --product-id prod_789 \
 *     --product-title "Premium Widget" \
 *     --caption "Amazing product review"
 *
 * 参数:
 *   --type            发布类型: normal（默认）或 shoppable
 *   # 普通发布参数:
 *   --business-id     TT 账号 businessId（必填）
 *   --video-url       上传后的视频 URL（必填）
 *   --caption         视频描述/文案（可选）
 *   # 挂车发布参数:
 *   --creator-id      TTS 账号 creatorUserOpenId（必填）
 *   --file-id         上传返回的 videoFileId（必填）
 *   --product-id      商品 ID（必填）
 *   --product-title   商品标题，最多 29 字符（必填）
 *   --caption         视频标题（可选）
 */

import { openApiPost, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
const publishType = (args.type || 'normal').toLowerCase()

const MAX_PRODUCT_TITLE_LENGTH = 29

try {
  let data

  if (publishType === 'shoppable') {
    requireArgs(
      args,
      ['creator-id', 'file-id', 'product-id', 'product-title'],
      'node publish.mjs --type shoppable --creator-id <id> --file-id <id> --product-id <id> --product-title <title> [--caption <text>]'
    )

    const productTitle = args['product-title'].slice(0, MAX_PRODUCT_TITLE_LENGTH)
    if (args['product-title'].length > MAX_PRODUCT_TITLE_LENGTH) {
      console.log(`注意: productTitle 超过 ${MAX_PRODUCT_TITLE_LENGTH} 字符，已自动截断为: "${productTitle}"`)
    }

    console.log('挂车视频发布中...')
    data = await openApiPost('/api/v1/open/tts/shoppable-video/publish', {
      creatorUserOpenId: args['creator-id'],
      fileId: args['file-id'],
      title: args.caption || '',
      productId: args['product-id'],
      productTitle: productTitle,
    })

    console.log('\n发布成功（挂车视频立即完成）:')
  } else {
    requireArgs(
      args,
      ['business-id', 'video-url'],
      'node publish.mjs --type normal --business-id <id> --video-url <url> [--caption <text>]'
    )

    console.log('普通视频发布中...')
    data = await openApiPost('/api/v1/open/tiktok/video/publish', {
      businessId: args['business-id'],
      videoUrl: args['video-url'],
      caption: args.caption || '',
    })

    console.log('\n发布已提交（需轮询状态）:')
    console.log(`提示: 使用 node poll-status.mjs --business-id ${args['business-id']} --share-id ${data.shareId} 轮询进度`)
  }

  printResult(data)
} catch (err) {
  console.error('发布失败:', err.message)
  process.exit(1)
}
