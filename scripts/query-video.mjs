#!/usr/bin/env node

/**
 * 查询视频统计数据
 *
 * 用法:
 *   # 查询单个视频
 *   node query-video.mjs --business-id biz_12345 --item-ids 7123456789012345678
 *
 *   # 查询多个视频（逗号分隔）
 *   node query-video.mjs --business-id biz_12345 --item-ids 7123456789012345678,7123456789012345679
 *
 * 参数:
 *   --business-id  TT 账号 businessId（必填）
 *   --item-ids     视频 ID，多个用逗号分隔（必填）
 */

import { openApiPost, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['business-id', 'item-ids'], 'node query-video.mjs --business-id <id> --item-ids <id1,id2,...>')

const itemIds = args['item-ids'].split(',').map((id) => id.trim()).filter(Boolean)

if (itemIds.length === 0) {
  console.error('错误: --item-ids 不能为空')
  process.exit(1)
}

try {
  console.log(`查询 ${itemIds.length} 个视频的数据...\n`)
  const data = await openApiPost('/api/v1/open/tiktok/video/query', {
    businessId: args['business-id'],
    itemIds,
  })

  // 兼容新旧两种响应格式
  const list = data.videoList ?? data.videos ?? []

  if (list.length === 0) {
    console.log('未查到视频数据')
    process.exit(0)
  }

  // 格式化输出
  const normalized = list.map((v) => ({
    itemId: v.itemId ?? v.item_id,
    videoViews: v.videoViews ?? v.video_views ?? 0,
    likes: v.likes ?? 0,
    comments: v.comments ?? 0,
    shares: v.shares ?? 0,
    thumbnailUrl: v.thumbnailUrl ?? v.thumbnail_url ?? '',
    shareUrl: v.shareUrl ?? v.share_url ?? '',
  }))

  console.log(`查询到 ${normalized.length} 个视频:\n`)

  for (const v of normalized) {
    console.log(`  视频 ${v.itemId}`)
    console.log(`    播放: ${v.videoViews}  点赞: ${v.likes}  评论: ${v.comments}  分享: ${v.shares}`)
    if (v.shareUrl) console.log(`    链接: ${v.shareUrl}`)
    console.log('')
  }

  // 同时输出原始 JSON
  printResult({ videos: normalized, _raw: data })
} catch (err) {
  console.error('查询视频数据失败:', err.message)
  process.exit(1)
}
