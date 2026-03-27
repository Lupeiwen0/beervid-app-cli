/**
 * GET /api/oauth/url?type=tt|tts
 * 获取 OAuth 授权 URL
 *
 * 生产环境：如果要往授权链接里追加你方自定义安全字段，
 * 先判断现有 state 是否为 JSON 对象；若是，再在该 JSON 中追加字段。
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
