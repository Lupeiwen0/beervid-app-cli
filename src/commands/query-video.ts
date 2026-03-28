import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type { QueryVideoData, NormalizedVideoItem } from '../types/index.js'
import {
  getRawOptionValue,
  getRawOptionValues,
  parseStrictInteger,
  rethrowIfProcessExit,
} from './utils.js'

export function register(cli: CAC): void {
  cli
    .command('query-video', '查询视频统计数据')
    .option('--business-id <id>', 'TT 账号 businessId（必填）')
    .option('--item-ids <ids>', '视频 ID，支持重复传参或逗号分隔（可选；不传则查询全部）')
    .option('--cursor <n>', '分页游标（可选）')
    .option('--max-count <n>', '每页数量（可选，10-20）')
    .action(async () => {
        const businessId = getRawOptionValue(cli.rawArgs, '--business-id')
        const rawItemIdArgs = getRawOptionValues(cli.rawArgs, '--item-ids')
        const rawCursor = getRawOptionValue(cli.rawArgs, '--cursor')
        const rawMaxCount = getRawOptionValue(cli.rawArgs, '--max-count')

        if (!businessId) {
          const missing = [!businessId && '--business-id'].filter(Boolean)
          console.error(`缺少必填参数: ${missing.join(', ')}\n`)
          console.error(
            '用法: beervid query-video --business-id <id> [--item-ids <id1,id2,...>] [--cursor <n>] [--max-count <n>]'
          )
          process.exit(1)
        }

        const itemIds = rawItemIdArgs
          .flatMap((value) => value.split(','))
          .map((id) => id.trim())
          .filter(Boolean)

        if (rawItemIdArgs.length > 0 && itemIds.length === 0) {
          console.error('错误: --item-ids 不能为空')
          process.exit(1)
        }

        let cursor: number | undefined
        if (rawCursor !== undefined) {
          cursor = parseStrictInteger(rawCursor, '--cursor')
          if (cursor === undefined || cursor < 0) {
            console.error('错误: --cursor 必须为大于等于 0 的整数')
            process.exit(1)
          }
        }

        let maxCount: number | undefined
        if (rawMaxCount !== undefined) {
          maxCount = parseStrictInteger(rawMaxCount, '--max-count')
          if (maxCount === undefined || maxCount < 10 || maxCount > 20) {
            console.error('错误: --max-count 必须为 10 到 20 之间的整数')
            process.exit(1)
          }
        }

        try {
          console.log(
            itemIds.length > 0
              ? `查询 ${itemIds.length} 个视频的数据...\n`
              : '查询视频数据列表...\n'
          )
          const requestBody: Record<string, unknown> = {
            businessId,
          }
          if (itemIds.length > 0) requestBody.itemIds = itemIds
          if (cursor !== undefined) requestBody.cursor = cursor
          if (maxCount !== undefined) requestBody.maxCount = maxCount

          const data = await openApiPost<QueryVideoData>('/api/v1/open/tiktok/video/query', requestBody)

          const list = data.videoList ?? data.videos ?? []

          if (list.length === 0) {
            console.log('未查到视频数据')
            process.exit(0)
          }

          const normalized: NormalizedVideoItem[] = list.map((v) => ({
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
            console.log(
              `    播放: ${v.videoViews}  点赞: ${v.likes}  评论: ${v.comments}  分享: ${v.shares}`
            )
            if (v.shareUrl) console.log(`    链接: ${v.shareUrl}`)
            console.log('')
          }

          printResult(data)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('查询视频数据失败:', (err as Error).message)
          process.exit(1)
        }
      })
}
