# OAuth 回调存储建议

> 本文档描述接入 BEERVID OAuth 授权回调后，如何安全地处理回调参数、防止 CSRF 攻击、以及持久化账号信息。

## 授权流程总览

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  你的应用 │────→│ BEERVID  │────→│ TikTok   │────→│ 回调 URL  │
│          │ ①  │ OAuth URL│ ②  │ 授权页面  │ ③  │ 你的服务器│
└─────────┘     └──────────┘     └──────────┘     └──────────┘
 获取 URL          重定向           用户授权       收到回调参数
```

1. **获取 OAuth URL**：调用 `GET /api/v1/open/thirdparty-auth/tt-url` 或 `tts-url`
2. **用户跳转授权**：将用户重定向到返回的 URL
3. **接收回调**：用户授权后，TikTok 回调你的服务器

---

## 回调参数

OAuth 授权完成后，回调 URL 会携带以下关键参数：

| 账号类型 | 回调参数 | 含义 | 后续用途 |
|----------|----------|------|----------|
| TT | `ttAbId` | TT 账号的 businessId | 所有 TT 操作的入参 |
| TTS | `ttsAbId` | TTS 账号的 creatorUserOpenId | 所有 TTS 操作的入参 |

> **重要**：`ttAbId` 就是后续所有 TT API 的 `businessId`，`ttsAbId` 就是所有 TTS API 的 `creatorUserOpenId`。
> 这两个值必须可靠持久化，丢失意味着需要用户重新授权。

---

## State Token 防 CSRF

### 为什么需要

OAuth 回调容易受到 CSRF 攻击——攻击者可以伪造回调请求，将恶意账号绑定到受害者系统。

### 推荐方案：JWT 格式 State Token

```typescript
import jwt from 'jsonwebtoken'

const STATE_SECRET = process.env.OAUTH_STATE_SECRET!

// ① 生成 State Token（在获取 OAuth URL 时）
function generateStateToken(userId: string): string {
  return jwt.sign(
    {
      userId,        // 当前登录用户 ID
      purpose: 'beervid-oauth',
      nonce: crypto.randomUUID(),  // 一次性随机值
    },
    STATE_SECRET,
    { expiresIn: '10m' }  // 短过期时间：10 分钟
  )
}

// ② 验证 State Token（在回调中）
function verifyStateToken(state: string): { userId: string; nonce: string } {
  try {
    const payload = jwt.verify(state, STATE_SECRET) as {
      userId: string
      purpose: string
      nonce: string
    }
    if (payload.purpose !== 'beervid-oauth') {
      throw new Error('Invalid state purpose')
    }
    return { userId: payload.userId, nonce: payload.nonce }
  } catch {
    throw new Error('State Token 验证失败：可能已过期或被篡改')
  }
}
```

### 一次性消费

为防止重放攻击，State Token 应确保只使用一次：

```typescript
// 使用 Redis 记录已消费的 nonce
const NONCE_TTL = 600  // 与 State Token 过期时间一致

async function consumeStateNonce(nonce: string): Promise<boolean> {
  // SET NX：仅当 key 不存在时设置成功
  const result = await redis.set(`oauth:nonce:${nonce}`, '1', 'EX', NONCE_TTL, 'NX')
  return result === 'OK'  // true = 首次使用，false = 已被消费
}
```

---

## 回调处理完整流程

```typescript
async function handleOAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const ttAbId = url.searchParams.get('ttAbId')
  const ttsAbId = url.searchParams.get('ttsAbId')

  // ① 验证 State Token
  if (!state) {
    return new Response('缺少 state 参数', { status: 400 })
  }

  let statePayload: { userId: string; nonce: string }
  try {
    statePayload = verifyStateToken(state)
  } catch (err) {
    return new Response('授权链接已过期，请重新发起授权', { status: 403 })
  }

  // ② 一次性消费检查
  const isFirstUse = await consumeStateNonce(statePayload.nonce)
  if (!isFirstUse) {
    return new Response('该授权回调已处理过，请勿重复提交', { status: 409 })
  }

  // ③ 判断账号类型并持久化
  if (ttAbId) {
    await saveAccount({
      accountType: 'TT',
      accountId: ttAbId,
      businessId: ttAbId,
      appUserId: statePayload.userId,
      status: 'ACTIVE',
    })
  }

  if (ttsAbId) {
    await saveAccount({
      accountType: 'TTS',
      accountId: ttsAbId,
      creatorUserOpenId: ttsAbId,
      appUserId: statePayload.userId,
      status: 'ACTIVE',
    })
  }

  // ④ 异步拉取账号详情（不阻塞回调响应）
  const accountId = ttAbId || ttsAbId
  const accountType = ttAbId ? 'TT' : 'TTS'

  // 使用 fire-and-forget 或投递到消息队列
  syncAccountInfoAsync(accountType, accountId!).catch((err) => {
    console.error('异步同步账号信息失败（不影响授权结果）:', err.message)
  })

  // ⑤ 返回成功页面或重定向
  return Response.redirect('/dashboard?oauth=success', 302)
}
```

---

## 异步账号信息同步

授权回调只返回 `accountId`，详细信息（头像、粉丝数、用户名等）需要额外调用 `account/info` 接口获取。

**为什么异步？**
- 回调请求应快速响应，避免用户长时间等待
- 头像同步等操作允许延迟几秒完成
- 即使同步失败，授权本身已成功

```typescript
async function syncAccountInfoAsync(
  accountType: 'TT' | 'TTS',
  accountId: string
): Promise<void> {
  const data = await openApiPost('/api/v1/open/account/info', {
    accountType,
    accountId,
  })

  await updateAccount(accountId, {
    username: data.username,
    displayName: data.displayName,
    sellerName: data.sellerName,
    profileUrl: data.profileUrl,
    followersCount: data.followersCount,
    accessToken: data.accessToken,
  })
}
```

---

## 安全要点速查

| 要点 | 做法 |
|------|------|
| 防 CSRF | 使用 JWT State Token，回调时验证签名和过期时间 |
| 防重放 | 一次性 nonce，Redis 记录已消费 |
| 短过期 | State Token 有效期 10 分钟 |
| 用户绑定 | State Token 中嵌入 userId，确保回调绑定到正确用户 |
| 数据完整性 | 回调中立即持久化 accountId，异步补充详情 |
| 失败容忍 | 异步同步失败不影响授权成功状态 |
| HTTPS | 回调 URL 必须使用 HTTPS |
