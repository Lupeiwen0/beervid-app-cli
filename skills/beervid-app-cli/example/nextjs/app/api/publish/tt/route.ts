/**
 * POST /api/publish/tt
 *
 * TT 完整发布流程：发布 → 轮询状态（阶梯递增间隔）→ 查询视频数据
 *
 * Body: { businessId, videoUrl, caption? }
 *
 * 注意：此示例使用同步轮询（请求等待直到完成）。
 * 生产环境建议改为异步模式：发布后立即返回 shareId，后台任务轮询，客户端通过 /api/status/:shareId 查询进度。
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost, getPollingInterval, sleep } from '@/lib/beervid-client'

const MAX_POLLS = 60

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { businessId, videoUrl, caption } = body as {
    businessId?: string
    videoUrl?: string
    caption?: string
  }

  if (!businessId || !videoUrl) {
    return NextResponse.json(
      { error: '缺少 businessId 或 videoUrl' },
      { status: 400 }
    )
  }

  try {
    // ① 发布视频（⚠️ 不重试 —— 发布操作非幂等）
    const publishResult = await openApiPost<{ shareId: string }>(
      '/api/v1/open/tiktok/video/publish',
      { businessId, videoUrl, caption: caption ?? '' }
    )

    // ② 轮询状态 —— 阶梯递增间隔策略
    // 前 6 次(0-30s): 每 5s → 7-12 次(30s-90s): 每 10s → 之后: 每 15s
    let videoId: string | null = null
    let finalStatus = 'TIMEOUT'
    let failReason: string | null = null
    let pollCount = 0

    for (let i = 1; i <= MAX_POLLS; i++) {
      const interval = getPollingInterval(i)
      await sleep(interval)

      const data = await openApiPost<{
        status?: string
        Status?: string
        reason?: string
        post_ids?: string[]
      }>('/api/v1/open/tiktok/video/status', {
        businessId,
        shareId: publishResult.shareId,
      })

      const status = data.status ?? data.Status ?? 'UNKNOWN'
      const postIds = data.post_ids ?? []
      pollCount = i

      if (status === 'FAILED') {
        finalStatus = 'FAILED'
        failReason = data.reason ?? '未知原因'
        break
      }

      if (status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
        finalStatus = 'PUBLISH_COMPLETE'
        videoId = postIds[0]!
        break
      }
    }

    // ③ 查询视频数据（如果发布成功）
    let videoData = null
    if (videoId) {
      await sleep(3000) // 等待数据同步
      try {
        const queryResult = await openApiPost<{
          videoList?: Array<Record<string, unknown>>
          videos?: Array<Record<string, unknown>>
        }>('/api/v1/open/tiktok/video/query', {
          businessId,
          itemIds: [videoId],
        })
        const list = queryResult.videoList ?? queryResult.videos ?? []
        if (list.length > 0) {
          const v = list[0]!
          videoData = {
            videoViews: v['videoViews'] ?? v['video_views'] ?? 0,
            likes: v['likes'] ?? 0,
            comments: v['comments'] ?? 0,
            shares: v['shares'] ?? 0,
            shareUrl: v['shareUrl'] ?? v['share_url'] ?? '',
          }
        }
      } catch {
        // 视频数据查询失败不影响整体结果
      }
    }

    return NextResponse.json({
      success: finalStatus === 'PUBLISH_COMPLETE',
      shareId: publishResult.shareId,
      videoId,
      publishStatus: finalStatus,
      failReason,
      pollCount,
      videoData,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
