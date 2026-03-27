/**
 * GET /api/oauth/callback?state={"ttAbId":"xxx",...}
 * OAuth 回调处理 — 回调字段在 state JSON 内部
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost } from '@/lib/beervid-client'

export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get('state')

  if (!stateParam) {
    return NextResponse.json({ error: '缺少 state 参数' }, { status: 400 })
  }

  // 回调字段在 state JSON 内部
  let stateObj: Record<string, unknown>
  try {
    stateObj = JSON.parse(stateParam) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'state 不是合法 JSON' }, { status: 400 })
  }

  const ttAbId = stateObj['ttAbId'] as string | undefined
  const ttsAbId = stateObj['ttsAbId'] as string | undefined

  // 生产环境：① 验证 state 中你方追加的自定义安全字段 ② 一次性消费检查
  // 详见 docs/oauth-callback.md

  if (!ttAbId && !ttsAbId) {
    return NextResponse.json({ error: 'state 中缺少 ttAbId 或 ttsAbId' }, { status: 400 })
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
