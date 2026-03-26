import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type { QueryVideoData, NormalizedVideoItem } from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

export function register(cli: CAC): void {
  cli
    .command('query-video', '查询视频统计数据')
    .option('--business-id <id>', 'TT 账号 businessId（必填）')
    .option('--item-ids <ids>', '视频 ID，支持重复传参或逗号分隔（必填）')
    .action(
      async (options: { businessId?: string; itemIds?: string | string[] }) => {
        if (!options.businessId || !options.itemIds) {
          const missing = [
            !options.businessId && '--business-id',
            !options.itemIds && '--item-ids',
          ].filter(Boolean)
          console.error(`缺少必填参数: ${missing.join(', ')}\n`)
          console.error(
            '用法: beervid query-video --business-id <id> --item-ids <id1,id2,...>'
          )
          process.exit(1)
        }

        const itemIds = (Array.isArray(options.itemIds)
          ? options.itemIds
          : [options.itemIds])
          .flatMap((value) => value.split(','))
          .map((id) => id.trim())
          .filter(Boolean)

        if (itemIds.length === 0) {
          console.error('错误: --item-ids 不能为空')
          process.exit(1)
        }

        try {
          console.log(`查询 ${itemIds.length} 个视频的数据...\n`)
          const data = await openApiPost<QueryVideoData>('/api/v1/open/tiktok/video/query', {
            businessId: options.businessId,
            itemIds,
          })

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
      }
    )
}
