import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type { VideoStatusData } from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function register(cli: CAC): void {
  cli
    .command('poll-status', '轮询普通视频发布状态')
    .option('--business-id <id>', 'TT 账号 businessId（必填）')
    .option('--share-id <id>', '发布时返回的 shareId（必填）')
    .option('--interval <sec>', '轮询间隔秒数（默认 5）')
    .option('--max-polls <n>', '最大轮询次数（默认 60）')
    .action(
      async (options: {
        businessId?: string
        shareId?: string
        interval?: string
        maxPolls?: string
      }) => {
        if (!options.businessId || !options.shareId) {
          const missing = [
            !options.businessId && '--business-id',
            !options.shareId && '--share-id',
          ].filter(Boolean)
          console.error(`缺少必填参数: ${missing.join(', ')}\n`)
          console.error('用法: beervid poll-status --business-id <id> --share-id <id>')
          process.exit(1)
        }

        const intervalSec = parseInt(options.interval ?? '5', 10)
        const maxPolls = parseInt(options.maxPolls ?? '60', 10)
        if (Number.isNaN(intervalSec) || intervalSec <= 0) {
          console.error('错误: --interval 必须为大于 0 的整数')
          process.exit(1)
        }
        if (Number.isNaN(maxPolls) || maxPolls <= 0) {
          console.error('错误: --max-polls 必须为大于 0 的整数')
          process.exit(1)
        }

        try {
          console.log(`开始轮询发布状态 (间隔 ${intervalSec}s, 最多 ${maxPolls} 次)`)
          console.log(`businessId: ${options.businessId}`)
          console.log(`shareId: ${options.shareId}\n`)

          let lastStatus = 'UNKNOWN'

          for (let i = 1; i <= maxPolls; i++) {
            const data = await openApiPost<VideoStatusData>('/api/v1/open/tiktok/video/status', {
              businessId: options.businessId,
              shareId: options.shareId,
            })

            const status = data.status ?? data.Status ?? 'UNKNOWN'
            const postIds = data.post_ids ?? []
            lastStatus = status
            console.log(`[${i}/${maxPolls}] 状态: ${status}`)

            if (status === 'FAILED') {
              console.log('')
              console.log(`发布失败: ${data.reason ?? '未知原因'}`)
              printResult(data)
              process.exit(1)
            }

            if (status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
              console.log('')
              console.log('发布成功!')
              console.log(`视频 ID: ${postIds[0]}`)
              console.log(
                `提示: 使用 beervid query-video --business-id ${options.businessId} --item-ids ${postIds[0]} 查询数据`
              )
              printResult(data)
              process.exit(0)
            }

            if (i < maxPolls) {
              await sleep(intervalSec * 1000)
            }
          }

          if (lastStatus === 'PUBLISH_COMPLETE') {
            console.error(`\n超过最大轮询次数 (${maxPolls})，状态为 PUBLISH_COMPLETE 但 post_ids 仍为空`)
          } else {
            console.error(`\n超过最大轮询次数 (${maxPolls})，仍未拿到 post_ids`)
          }
          process.exit(2)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('轮询失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
