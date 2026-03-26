/**
 * BEERVID Open API — Express 后端集成示例
 *
 * 包含：
 * - OAuth 授权（获取 URL + 回调处理）
 * - TT 完整发布流程（含后台轮询任务）
 * - TTS 完整发布流程
 * - 发布状态查询
 * - 商品列表查询
 *
 * 运行: npx tsx server.ts
 */

import express from 'express'

const app = express()
app.use(express.json())

const PORT = parseInt(process.env['PORT'] ?? '3000', 10)
const API_KEY = process.env['BEERVID_APP_KEY'] ?? ''
const BASE_URL = process.env['BEERVID_APP_BASE_URL'] ?? 'https://open.beervid.ai'

if (!API_KEY) {
  console.error('请设置环境变量: export BEERVID_APP_KEY="your-api-key"')
  process.exit(1)
}

// ═══════════════════════════════════════════════════════════════════════════
// BEERVID API 客户端封装
// ═══════════════════════════════════════════════════════════════════════════

interface OpenApiResponse<T> {
  code: number
  message: string
  data: T
  success: boolean
}

async function openApiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  })
  const json = (await res.json()) as OpenApiResponse<T>
  if (json.code !== 0 || !json.success) {
    throw new Error(`Open API 错误 [${path}]: ${json.message} (code: ${json.code})`)
  }
  return json.data
}

async function openApiPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const url = new URL(path, BASE_URL)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json()) as OpenApiResponse<T>
  if (json.code !== 0 || !json.success) {
    throw new Error(`Open API 错误 [${path}]: ${json.message} (code: ${json.code})`)
  }
  return json.data
}

// ═══════════════════════════════════════════════════════════════════════════
// 内存存储（生产环境请替换为数据库）
// ═══════════════════════════════════════════════════════════════════════════

interface VideoRecord {
  id: string
  businessId: string
  shareId: string
  publishStatus: string
  videoId: string | null
  failReason: string | null
  pollCount: number
  createdAt: Date
}

const videoStore = new Map<string, VideoRecord>()
const accountStore = new Map<string, Record<string, unknown>>()
let idCounter = 1

// ═══════════════════════════════════════════════════════════════════════════
// 轮询策略：阶梯递增间隔
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 推荐的轮询间隔策略：
 * - 前 6 次（0-30s）：每 5 秒    → 覆盖大部分快速完成的场景
 * - 第 7-12 次（30s-90s）：每 10 秒   → 中等耗时视频
 * - 第 13 次起（90s+）：每 15 秒      → 长耗时视频，降低 API 压力
 */
function getPollingInterval(pollCount: number): number {
  if (pollCount <= 6) return 5_000
  if (pollCount <= 12) return 10_000
  return 15_000
}

const MAX_POLLS = 60

async function pollVideoStatusInBackground(record: VideoRecord): Promise<void> {
  const { businessId, shareId } = record

  for (let i = 1; i <= MAX_POLLS; i++) {
    const interval = getPollingInterval(i)
    await new Promise((r) => setTimeout(r, interval))

    try {
      const data = await openApiPost<{
        status?: string
        Status?: string
        reason?: string
        post_ids?: string[]
      }>('/api/v1/open/tiktok/video/status', { businessId, shareId })

      const status = data.status ?? data.Status ?? 'UNKNOWN'
      const postIds = data.post_ids ?? []
      record.pollCount = i

      if (status === 'FAILED') {
        record.publishStatus = 'FAILED'
        record.failReason = data.reason ?? '未知原因'
        console.log(`[轮询] ${shareId} 发布失败: ${record.failReason}`)
        return
      }

      if (status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
        record.publishStatus = 'PUBLISH_COMPLETE'
        record.videoId = postIds[0]!
        console.log(`[轮询] ${shareId} 发布完成，视频 ID: ${record.videoId}（第 ${i} 次查询）`)
        return
      }

      console.log(`[轮询] ${shareId} [${i}/${MAX_POLLS}] 状态: ${status}，${interval / 1000}s 后重试`)
    } catch (err) {
      console.error(`[轮询] ${shareId} 第 ${i} 次查询失败:`, (err as Error).message)
    }
  }

  record.publishStatus = 'TIMEOUT'
  console.log(`[轮询] ${shareId} 超时（${MAX_POLLS} 次查询后）`)
}

// ═══════════════════════════════════════════════════════════════════════════
// OAuth 路由
// ═══════════════════════════════════════════════════════════════════════════

// 获取 TT OAuth URL 并重定向
app.get('/oauth/tt', async (_req, res) => {
  try {
    const url = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
    // 生产环境：在 URL 中附加 state 参数，参见 docs/oauth-callback.md
    res.redirect(url)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 获取 TTS OAuth URL 并重定向
app.get('/oauth/tts', async (_req, res) => {
  try {
    const data = await openApiGet<{ crossBorderUrl: string }>(
      '/api/v1/open/thirdparty-auth/tts-url'
    )
    res.redirect(data.crossBorderUrl)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// OAuth 回调处理
app.get('/oauth/callback', async (req, res) => {
  const ttAbId = req.query['ttAbId'] as string | undefined
  const ttsAbId = req.query['ttsAbId'] as string | undefined

  // 生产环境：① 验证 state token ② 一次性消费检查
  // 详见 docs/oauth-callback.md

  if (!ttAbId && !ttsAbId) {
    res.status(400).json({ error: '缺少 ttAbId 或 ttsAbId 参数' })
    return
  }

  const accountId = (ttAbId ?? ttsAbId)!
  const accountType = ttAbId ? 'TT' : 'TTS'

  // 持久化账号
  accountStore.set(accountId, {
    accountType,
    accountId,
    businessId: ttAbId ?? null,
    creatorUserOpenId: ttsAbId ?? null,
    authorizedAt: new Date().toISOString(),
  })

  // 异步拉取账号详情（不阻塞回调响应）
  openApiPost('/api/v1/open/account/info', { accountType, accountId })
    .then((info) => {
      const existing = accountStore.get(accountId) ?? {}
      accountStore.set(accountId, { ...existing, ...info })
      console.log(`[异步] 账号信息已同步: ${accountId}`)
    })
    .catch((err) => {
      console.error(`[异步] 账号信息同步失败: ${(err as Error).message}`)
    })

  res.json({
    success: true,
    message: `${accountType} 账号授权成功`,
    accountId,
    businessId: ttAbId ?? undefined,
    creatorUserOpenId: ttsAbId ?? undefined,
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// TT 完整发布流程
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/publish/tt', async (req, res) => {
  const { businessId, videoUrl, caption } = req.body as {
    businessId?: string
    videoUrl?: string
    caption?: string
  }

  if (!businessId || !videoUrl) {
    res.status(400).json({ error: '缺少 businessId 或 videoUrl' })
    return
  }

  try {
    // ① 发布视频（不重试——发布操作非幂等）
    const publishResult = await openApiPost<{ shareId: string }>(
      '/api/v1/open/tiktok/video/publish',
      { businessId, videoUrl, caption: caption ?? '' }
    )

    // ② 创建本地记录
    const record: VideoRecord = {
      id: String(idCounter++),
      businessId,
      shareId: publishResult.shareId,
      publishStatus: 'PROCESSING_DOWNLOAD',
      videoId: null,
      failReason: null,
      pollCount: 0,
      createdAt: new Date(),
    }
    videoStore.set(record.shareId, record)

    // ③ 启动后台轮询任务（使用阶梯递增间隔策略）
    pollVideoStatusInBackground(record).catch((err) => {
      console.error(`[后台轮询] 异常:`, (err as Error).message)
    })

    // ④ 立即返回 shareId，客户端可通过 /api/status/:shareId 查询进度
    res.json({
      success: true,
      shareId: publishResult.shareId,
      message: '视频已提交发布，后台正在轮询状态',
      statusUrl: `/api/status/${publishResult.shareId}`,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// TTS 完整发布流程
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/publish/tts', async (req, res) => {
  const { creatorId, videoFileId, productId, productTitle, caption } = req.body as {
    creatorId?: string
    videoFileId?: string
    productId?: string
    productTitle?: string
    caption?: string
  }

  if (!creatorId || !videoFileId || !productId || !productTitle) {
    res.status(400).json({
      error: '缺少必填参数',
      required: ['creatorId', 'videoFileId', 'productId', 'productTitle'],
    })
    return
  }

  try {
    // 商品标题最多 29 字符
    const normalizedTitle = productTitle.slice(0, 29)

    // 挂车发布（不重试——发布操作非幂等）
    const publishResult = await openApiPost<{ videoId: string }>(
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
    res.json({
      success: true,
      videoId: publishResult.videoId,
      message: '挂车视频发布完成',
      productTitleUsed: normalizedTitle,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 状态查询
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/status/:shareId', async (req, res) => {
  const { shareId } = req.params

  // 先查本地记录
  const record = videoStore.get(shareId)
  if (record) {
    res.json({
      shareId,
      publishStatus: record.publishStatus,
      videoId: record.videoId,
      failReason: record.failReason,
      pollCount: record.pollCount,
    })
    return
  }

  // 本地无记录，直接查 BEERVID API（需要 businessId）
  const businessId = req.query['businessId'] as string | undefined
  if (!businessId) {
    res.status(400).json({ error: '本地无记录，请提供 businessId 参数' })
    return
  }

  try {
    const data = await openApiPost<{
      status?: string
      Status?: string
      reason?: string
      post_ids?: string[]
    }>('/api/v1/open/tiktok/video/status', { businessId, shareId })

    res.json({
      shareId,
      publishStatus: data.status ?? data.Status,
      videoId: data.post_ids?.[0] ?? null,
      failReason: data.reason ?? null,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 商品查询
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/products/:creatorId', async (req, res) => {
  const { creatorId } = req.params
  const productType = (req.query['type'] as string) ?? 'shop'
  const pageSize = parseInt((req.query['pageSize'] as string) ?? '20', 10)
  const pageToken = (req.query['pageToken'] as string) ?? ''

  try {
    const data = await openApiPost('/api/v1/open/tts/products/query', {
      creatorUserOpenId: creatorId,
      productType,
      pageSize,
      pageToken,
    })

    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 首页
// ═══════════════════════════════════════════════════════════════════════════

app.get('/', (_req, res) => {
  res.send(`
    <h1>BEERVID Express 集成示例</h1>
    <h2>OAuth</h2>
    <ul>
      <li><a href="/oauth/tt">TT OAuth 授权</a></li>
      <li><a href="/oauth/tts">TTS OAuth 授权</a></li>
    </ul>
    <h2>API</h2>
    <pre>
POST /api/publish/tt    — TT 完整发布（含后台轮询）
POST /api/publish/tts   — TTS 挂车发布
GET  /api/status/:sid   — 查询发布状态
GET  /api/products/:cid — 查询商品列表
    </pre>
    <p>详见 README.md</p>
  `)
})

// ─── 启动 ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`BEERVID Express 示例运行在 http://localhost:${PORT}`)
  console.log('路由:')
  console.log('  GET  /oauth/tt              — TT OAuth')
  console.log('  GET  /oauth/tts             — TTS OAuth')
  console.log('  GET  /oauth/callback        — 回调处理')
  console.log('  POST /api/publish/tt        — TT 完整发布')
  console.log('  POST /api/publish/tts       — TTS 完整发布')
  console.log('  GET  /api/status/:shareId   — 状态查询')
  console.log('  GET  /api/products/:cid     — 商品查询')
})
