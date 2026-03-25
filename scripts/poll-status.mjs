#!/usr/bin/env node

/**
 * 轮询普通视频发布状态
 *
 * 持续轮询直到状态变为终态（PUBLISH_COMPLETE 或 FAILED），或达到最大轮询次数。
 *
 * 用法:
 *   node poll-status.mjs --business-id biz_12345 --share-id share_abc123
 *   node poll-status.mjs --business-id biz_12345 --share-id share_abc123 --interval 5 --max-polls 30
 *
 * 参数:
 *   --business-id  TT 账号 businessId（必填）
 *   --share-id     发布时返回的 shareId（必填）
 *   --interval     轮询间隔秒数（默认 3）
 *   --max-polls    最大轮询次数（默认 60）
 */

import { openApiPost, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['business-id', 'share-id'], 'node poll-status.mjs --business-id <id> --share-id <id>')

const intervalSec = parseInt(args.interval || '3', 10)
const maxPolls = parseInt(args['max-polls'] || '60', 10)

const TERMINAL_STATUSES = ['PUBLISH_COMPLETE', 'FAILED']

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

try {
  console.log(`开始轮询发布状态 (间隔 ${intervalSec}s, 最多 ${maxPolls} 次)`)
  console.log(`businessId: ${args['business-id']}`)
  console.log(`shareId: ${args['share-id']}\n`)

  for (let i = 1; i <= maxPolls; i++) {
    const data = await openApiPost('/api/v1/open/tiktok/video/status', {
      businessId: args['business-id'],
      shareId: args['share-id'],
    })

    const status = data.status || data.Status || 'UNKNOWN'
    console.log(`[${i}/${maxPolls}] 状态: ${status}`)

    if (TERMINAL_STATUSES.includes(status)) {
      console.log('')
      if (status === 'PUBLISH_COMPLETE') {
        console.log('发布成功!')
        if (data.post_ids?.length > 0) {
          console.log(`视频 ID: ${data.post_ids[0]}`)
          console.log(`提示: 使用 node query-video.mjs --business-id ${args['business-id']} --item-ids ${data.post_ids[0]} 查询数据`)
        }
      } else {
        console.log(`发布失败: ${data.reason || '未知原因'}`)
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
  console.error('轮询失败:', err.message)
  process.exit(1)
}
