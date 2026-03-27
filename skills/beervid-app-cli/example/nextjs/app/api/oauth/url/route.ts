/**
 * GET /api/oauth/url?type=tt|tts
 * 获取 OAuth 授权 URL
 *
 * 生产环境：授权链接中不一定携带 state 参数。
 * 如果已有 state，其值为 JSON，可解析后追加自定义字段；
 * 如果没有 state，需透传参数时应自行构造 JSON 设置为 state。
 * 详见 docs/oauth-callback.md
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiGet } from '@/lib/beervid-client'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? 'tt'

  if (type !== 'tt' && type !== 'tts') {
    return NextResponse.json({ error: 'type 参数必须为 tt 或 tts' }, { status: 400 })
  }

  try {
    if (type === 'tt') {
      const url = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
      return NextResponse.json({ type: 'tt', url })
    } else {
      const data = await openApiGet<{ crossBorderUrl: string }>('/api/v1/open/thirdparty-auth/tts-url')
      return NextResponse.json({ type: 'tts', url: data.crossBorderUrl })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
