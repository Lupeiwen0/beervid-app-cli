/**
 * POST /api/publish/tts
 *
 * TTS 完整发布流程：发布挂车视频（立即完成，无需轮询）
 *
 * Body: { creatorId, videoFileId, productId, productTitle, caption? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost } from '@/lib/beervid-client'

const MAX_PRODUCT_TITLE_LENGTH = 30

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { creatorId, videoFileId, productId, productTitle, caption } = body as {
    creatorId?: string
    videoFileId?: string
    productId?: string
    productTitle?: string
    caption?: string
  }

  if (!creatorId || !videoFileId || !productId || !productTitle) {
    return NextResponse.json({
      error: '缺少必填参数',
      required: ['creatorId', 'videoFileId', 'productId', 'productTitle'],
    }, { status: 400 })
  }

  try {
    // 商品标题最多 30 字符，超出自动截断
    const normalizedTitle = productTitle.slice(0, MAX_PRODUCT_TITLE_LENGTH)
    const wasTruncated = normalizedTitle !== productTitle

    // 挂车发布（⚠️ 不重试 —— 发布操作非幂等）
    const result = await openApiPost<{ videoId: string }>(
      '/api/v1/open/tts/shoppable-video/publish',
      {
        creatorUserOpenId: creatorId,
        fileId: videoFileId,
        title: caption ?? '',
        productId,
        productTitle: normalizedTitle,
      }
    )

    // 挂车视频发布后立即完成，无需轮询
    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      productId,
      productTitle: normalizedTitle,
      titleTruncated: wasTruncated,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
