/**
 * TT 完整发布流程 — 最佳实践示例
 *
 * 流程：上传视频 → 发布 → 轮询状态（阶梯递增间隔） → 查询视频数据
 *
 * 用法：
 *   npx tsx tt-publish-flow.ts --file ./video.mp4 --business-id biz_123 [--caption "My video"]
 */

import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { parseArgs } from 'node:util'
import {
  openApiPost,
  openApiUpload,
  withRetry,
  sleep,
  getPollingInterval,
} from './api-client.js'

// ─── 参数解析 ───────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    'business-id': { type: 'string' },
    caption: { type: 'string', default: '' },
    'max-polls': { type: 'string', default: '60' },
  },
  strict: false,
})

const filePath = values['file']
const businessId = values['business-id']
const caption = values['caption'] ?? ''
const maxPolls = parseInt(values['max-polls'] ?? '60', 10)

if (!filePath || !businessId) {
  console.error('用法: npx tsx tt-publish-flow.ts --file <路径> --business-id <id> [--caption <text>]')
  process.exit(1)
}

// ─── 步骤 1：获取上传凭证 ──────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('TT 完整发布流程')
console.log('━'.repeat(60))

console.log('\n[1/4] 获取上传凭证...')

const tokenData = await withRetry(
  () => openApiPost<{ uploadToken: string; expiresIn: number }>(
    '/api/v1/open/upload-token/generate'
  ),
  { maxRetries: 3, baseDelay: 1000, label: '获取上传凭证' }
)

console.log(`  ✓ 获得上传凭证（有效期 ${tokenData.expiresIn} 秒）`)

// ─── 步骤 2：上传视频 ──────────────────────────────────────────────────────

console.log('\n[2/4] 上传视频...')

const absPath = resolve(filePath)
const buffer = readFileSync(absPath)
const fileName = basename(absPath)
const file = new File([buffer], fileName, { type: 'video/mp4' })

console.log(`  文件: ${fileName} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`)

const formData = new FormData()
formData.append('file', file)

const uploadResult = await withRetry(
  () => openApiUpload<{ fileUrl: string }>(
    '/api/v1/open/file-upload',
    formData,
    { uploadToken: tokenData.uploadToken }
  ),
  { maxRetries: 2, baseDelay: 5000, label: '视频上传' }
)

console.log(`  ✓ 上传成功: ${uploadResult.fileUrl}`)

// ─── 步骤 3：发布视频 ──────────────────────────────────────────────────────

console.log('\n[3/4] 发布视频...')

// ⚠️ 发布操作不重试！重复调用会产生多条视频
const publishResult = await openApiPost<{ shareId: string }>(
  '/api/v1/open/tiktok/video/publish',
  {
    businessId,
    videoUrl: uploadResult.fileUrl,
    caption,
  }
)

console.log(`  ✓ 已提交发布，shareId: ${publishResult.shareId}`)

// ─── 步骤 4：轮询发布状态（阶梯递增间隔） ──────────────────────────────────

console.log('\n[4/4] 轮询发布状态...')
console.log('  轮询策略：前 6 次每 5s → 7-12 次每 10s → 之后每 15s')

let videoId: string | null = null

for (let i = 1; i <= maxPolls; i++) {
  const interval = getPollingInterval(i)

  const statusData = await withRetry(
    () => openApiPost<{
      status?: string
      Status?: string
      reason?: string
      post_ids?: string[]
    }>('/api/v1/open/tiktok/video/status', {
      businessId,
      shareId: publishResult.shareId,
    }),
    { maxRetries: 2, baseDelay: 1000, label: '轮询状态' }
  )

  const status = statusData.status ?? statusData.Status ?? 'UNKNOWN'
  const postIds = statusData.post_ids ?? []

  // 状态判定
  if (status === 'FAILED') {
    console.error(`  ✗ 发布失败: ${statusData.reason ?? '未知原因'}`)
    process.exit(1)
  }

  if (status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
    videoId = postIds[0]!
    console.log(`  ✓ 发布完成！视频 ID: ${videoId}（第 ${i} 次查询）`)
    break
  }

  // 注意：PUBLISH_COMPLETE 但 post_ids 为空 → 继续轮询
  const statusLabel = status === 'PUBLISH_COMPLETE' ? 'COMPLETE(等待 post_ids)' : status
  console.log(`  [${i}/${maxPolls}] 状态: ${statusLabel}，${interval / 1000}s 后重试...`)

  if (i < maxPolls) {
    await sleep(interval)
  }
}

if (!videoId) {
  console.error(`  ✗ 超时：${maxPolls} 次轮询后仍未获得视频 ID`)
  process.exit(2)
}

// ─── 查询视频数据 ──────────────────────────────────────────────────────────

console.log('\n[可选] 查询视频数据...')

// 视频刚发布后数据可能尚未同步，等待几秒后查询
await sleep(5000)

const queryData = await withRetry(
  () => openApiPost<{
    videoList?: Array<Record<string, unknown>>
    videos?: Array<Record<string, unknown>>
  }>('/api/v1/open/tiktok/video/query', {
    businessId,
    itemIds: [videoId],
  }),
  { maxRetries: 3, baseDelay: 5000, label: '查询视频数据' }
)

// 兼容新旧字段格式
const videoList = queryData.videoList ?? queryData.videos ?? []
if (videoList.length > 0) {
  const video = videoList[0]!
  console.log('  ✓ 视频数据:')
  console.log(`    播放量: ${video['videoViews'] ?? video['video_views'] ?? 0}`)
  console.log(`    点赞:   ${video['likes'] ?? 0}`)
  console.log(`    评论:   ${video['comments'] ?? 0}`)
  console.log(`    分享:   ${video['shares'] ?? 0}`)
  console.log(`    链接:   ${video['shareUrl'] ?? video['share_url'] ?? '-'}`)
} else {
  console.log('  ⚠ 视频数据暂未同步，稍后可手动查询')
}

// ─── 结果汇总 ──────────────────────────────────────────────────────────────

console.log('\n' + '━'.repeat(60))
console.log('流程完成！')
console.log(JSON.stringify({
  businessId,
  fileUrl: uploadResult.fileUrl,
  shareId: publishResult.shareId,
  videoId,
}, null, 2))
