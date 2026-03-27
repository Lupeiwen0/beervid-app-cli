/**
 * GET /api/status/[shareId]?businessId=xxx
 * 查询 TT 普通视频的发布状态
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost } from '@/lib/beervid-client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params
  const businessId = request.nextUrl.searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: '缺少 businessId 参数' }, { status: 400 })
  }

  try {
    const data = await openApiPost<{
      status?: string
      Status?: string
      reason?: string
      post_ids?: string[]
    }>('/api/v1/open/tiktok/video/status', { businessId, shareId })

    const status = data.status ?? data.Status ?? 'UNKNOWN'
    const postIds = data.post_ids ?? []

    return NextResponse.json({
      shareId,
      publishStatus: status,
      videoId: postIds[0] ?? null,
      isComplete: status === 'PUBLISH_COMPLETE' && postIds.length > 0,
      isFailed: status === 'FAILED',
      reason: data.reason ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
