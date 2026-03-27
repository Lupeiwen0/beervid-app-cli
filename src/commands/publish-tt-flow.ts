import type { CAC } from 'cac'
import { printResult } from '../client/index.js'
import {
  uploadNormalVideo,
  publishNormalVideo,
  pollNormalVideoStatus,
  queryVideoWithRetry,
} from '../workflows/index.js'
import { getRawOptionValue, rethrowIfProcessExit } from './utils.js'

function parsePositiveInt(value: string | undefined, optionName: string, defaultValue: number): number {
  const parsed = parseInt(value ?? `${defaultValue}`, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`错误: ${optionName} 必须为大于 0 的整数`)
    process.exit(1)
  }
  return parsed
}

export function register(cli: CAC): void {
  cli
    .command('publish-tt-flow', '执行 TT 完整发布流程：上传、发布、轮询、查询数据')
    .option('--business-id <id>', 'TT 账号 businessId（必填）')
    .option('--file <path>', '视频文件路径或 URL（必填）')
    .option('--caption <text>', '视频描述/文案（可选）')
    .option('--token <token>', '已有上传凭证（可选）')
    .option('--interval <sec>', '轮询间隔秒数（默认 5）')
    .option('--max-polls <n>', '最大轮询次数（默认 60）')
    .option('--query-interval <sec>', '视频数据查询重试间隔秒数（默认 5）')
    .option('--query-max-attempts <n>', '视频数据查询最大重试次数（默认 3）')
    .action(
      async (options: {
        businessId?: string
        file?: string
        caption?: string
        token?: string
        interval?: string
        maxPolls?: string
        queryInterval?: string
        queryMaxAttempts?: string
      }) => {
        const businessId = getRawOptionValue(cli.rawArgs, '--business-id')

        if (!businessId || !options.file) {
          const missing = [
            !businessId && '--business-id',
            !options.file && '--file',
          ].filter(Boolean)
          console.error(`缺少必填参数: ${missing.join(', ')}\n`)
          console.error(
            '用法: beervid publish-tt-flow --business-id <id> --file <路径或URL> [--caption <text>]'
          )
          process.exit(1)
        }

        const intervalSec = parsePositiveInt(options.interval, '--interval', 5)
        const maxPolls = parsePositiveInt(options.maxPolls, '--max-polls', 60)
        const queryIntervalSec = parsePositiveInt(options.queryInterval, '--query-interval', 5)
        const queryMaxAttempts = parsePositiveInt(
          options.queryMaxAttempts,
          '--query-max-attempts',
          3
        )

        try {
          console.log('开始执行 TT 完整发布流程...')

          console.log('1/4 正在上传视频...')
          const upload = await uploadNormalVideo(options.file, options.token)

          console.log('2/4 正在发布视频...')
          const publish = await publishNormalVideo(businessId, upload.fileUrl, options.caption)

          console.log('3/4 正在轮询发布状态...')
          const status = await pollNormalVideoStatus(businessId, publish.shareId, intervalSec, maxPolls)

          const videoId = status.postIds[0] ?? null
          let query = null

          if (status.finalStatus === 'PUBLISH_COMPLETE' && videoId) {
            console.log('4/4 正在查询视频数据...')
            const queryResult = await queryVideoWithRetry(businessId, videoId, queryIntervalSec, queryMaxAttempts)
            query = queryResult.query
            for (const warning of queryResult.warnings) {
              console.warn(warning.message)
            }
          }

          printResult({
            upload,
            publish,
            status: status.raw,
            query,
          })

          if (status.finalStatus === 'FAILED') {
            process.exit(1)
          }
          if (status.finalStatus === 'TIMEOUT') {
            process.exit(2)
          }
          process.exit(0)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('TT 完整发布流程失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
