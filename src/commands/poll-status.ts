import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import type { VideoStatusData } from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

const TERMINAL_STATUSES = ['PUBLISH_COMPLETE', 'FAILED']

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function register(cli: CAC): void {
  cli
    .command('poll-status', '轮询普通视频发布状态')
    .option('--business-id <id>', 'TT 账号 businessId（必填）')
    .option('--share-id <id>', '发布时返回的 shareId（必填）')
    .option('--interval <sec>', '轮询间隔秒数（默认 3）')
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

        const intervalSec = parseInt(options.interval ?? '3', 10)
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

          for (let i = 1; i <= maxPolls; i++) {
            const data = await openApiPost<VideoStatusData>('/api/v1/open/tiktok/video/status', {
              businessId: options.businessId,
              shareId: options.shareId,
            })

            const status = data.status ?? data.Status ?? 'UNKNOWN'
            console.log(`[${i}/${maxPolls}] 状态: ${status}`)

            if (TERMINAL_STATUSES.includes(status as string)) {
              console.log('')
              if (status === 'PUBLISH_COMPLETE') {
                console.log('发布成功!')
                if (data.post_ids && data.post_ids.length > 0) {
                  console.log(`视频 ID: ${data.post_ids[0]}`)
                  console.log(
                    `提示: 使用 beervid query-video --business-id ${options.businessId} --item-ids ${data.post_ids[0]} 查询数据`
                  )
                }
              } else {
                console.log(`发布失败: ${data.reason ?? '未知原因'}`)
              }
              printResult(data)
              process.exit(status === 'PUBLISH_COMPLETE' ? 0 : 1)
            }

            if (i < maxPolls) {
              await sleep(intervalSec * 1000)
            }
          }

          console.error(`\n超过最大轮询次数 (${maxPolls})，状态仍未终结`)
          process.exit(2)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('轮询失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
