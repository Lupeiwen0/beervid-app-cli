/**
 * GET /api/oauth/callback?ttAbId=xxx 或 ?ttsAbId=xxx
 * OAuth 回调处理
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost } from '@/lib/beervid-client'

export async function GET(request: NextRequest) {
  const ttAbId = request.nextUrl.searchParams.get('ttAbId')
  const ttsAbId = request.nextUrl.searchParams.get('ttsAbId')

  // 生产环境：① 验证 state token ② 一次性消费检查
  // 详见 docs/oauth-callback.md

  if (!ttAbId && !ttsAbId) {
    return NextResponse.json({ error: '缺少 ttAbId 或 ttsAbId 参数' }, { status: 400 })
  }

  const accountId = (ttAbId ?? ttsAbId)!
  const accountType = ttAbId ? 'TT' : 'TTS'

  // 异步拉取账号详情（不阻塞回调响应）
  openApiPost('/api/v1/open/account/info', { accountType, accountId }).catch((err) => {
    console.error('[异步] 账号信息同步失败:', (err as Error).message)
  })

  return NextResponse.json({
    success: true,
    message: `${accountType} 账号授权成功`,
    accountId,
    businessId: ttAbId ?? undefined,
    creatorUserOpenId: ttsAbId ?? undefined,
  })
}
