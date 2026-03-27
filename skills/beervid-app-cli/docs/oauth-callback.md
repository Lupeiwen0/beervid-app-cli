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

> **说明**：获取到的授权链接中**不一定**携带 `state` 参数。
> - 如果链接中已经包含 `state`，它的值一定是一个 JSON 字符串。你可以解析该 JSON，在其中追加自定义字段后再写回。
> - 如果链接中没有 `state`，而你需要透传参数（例如防 CSRF 的安全 token），应自行构造一个 JSON 对象作为 `state` 的值追加到授权链接上。

---

## 回调参数

OAuth 授权完成后，回调 URL 会携带 `state` 查询参数，其值是一个 **JSON 字符串**。业务字段包含在这个 JSON 内部：

```
回调 URL 示例：
https://your-app.com/callback?state={"ttAbId":"xxx","code":"yyy",...}
```

从 `state` JSON 中提取的关键字段：

| 账号类型 | 字段 | 含义 | 后续用途 |
|----------|----------|------|----------|
| TT | `ttAbId` | TT 账号的 businessId | 所有 TT 操作的入参 |
| TTS | `ttsAbId` | TTS 账号的 creatorUserOpenId | 所有 TTS 操作的入参 |

> **重要**：`ttAbId` 就是后续所有 TT API 的 `businessId`，`ttsAbId` 就是所有 TTS API 的 `creatorUserOpenId`。
> 这两个值必须可靠持久化，丢失意味着需要用户重新授权。

### 解析 state 中的回调字段

```typescript
interface OAuthCallbackState {
  ttAbId?: string
  ttsAbId?: string
  code?: string
  [key: string]: unknown  // 可能包含你之前追加的自定义字段
}

function parseCallbackState(stateParam: string): OAuthCallbackState {
  try {
    const parsed = JSON.parse(stateParam) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OAuthCallbackState
    }
    throw new Error('state 不是合法 JSON 对象')
  } catch {
    throw new Error('state 解析失败')
  }
}
```

---

## 获取授权链接后如何设置或追加 State

授权链接中**可能包含也可能不包含** `state` 参数：
- 如果已包含 `state`，其值是一个 JSON 字符串，可以解析后追加字段再写回。
- 如果未包含 `state`，而你需要透传参数，应自行构造一个 JSON 对象设置为 `state`。

```typescript
function tryParseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function setOrAppendStateToken(
  rawUrl: string,
  customStateToken: string
): string {
  const url = new URL(rawUrl)
  const rawState = url.searchParams.get('state')

  let nextState: Record<string, unknown>

  if (rawState) {
    // 链接中已有 state，解析后追加字段
    const parsedState = tryParseJsonObject(rawState)
    if (!parsedState) {
      throw new Error('授权链接中的 state 不是可追加字段的 JSON 对象')
    }
    nextState = { ...parsedState, customStateToken }
  } else {
    // 链接中没有 state，自行构造 JSON
    nextState = { customStateToken }
  }

  url.searchParams.set('state', JSON.stringify(nextState))
  return url.toString()
}

async function getTtOAuthUrlWithState(userId: string): Promise<string> {
  const customStateToken = generateStateToken(userId)
  const rawUrl = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
  return setOrAppendStateToken(rawUrl, customStateToken)
}

async function getTtsOAuthUrlWithState(userId: string): Promise<string> {
  const customStateToken = generateStateToken(userId)
  const data = await openApiGet<{ crossBorderUrl: string }>(
    '/api/v1/open/thirdparty-auth/tts-url'
  )
  return setOrAppendStateToken(data.crossBorderUrl, customStateToken)
}
```

回调时再从 `state` JSON 中取回你追加的字段并校验：

```typescript
function parseCustomStateToken(state: string): string {
  const parsed = tryParseJsonObject(state) as { customStateToken?: string } | null
  if (!parsed) {
    throw new Error('state 不是合法 JSON 对象')
  }
  if (!parsed.customStateToken) {
    throw new Error('state 中缺少 customStateToken')
  }
  return parsed.customStateToken
}
```

> **说明**：字段名 `customStateToken` 只是示例，你也可以改成 `token`、`nonce`、`appState` 等业务上更合适的名字。
> 无论链接中原先是否携带 `state`，你设置的 `state` 值都应该是一个 JSON 对象。

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
  const stateParam = url.searchParams.get('state')

  // ① 解析 state JSON，提取回调字段
  if (!stateParam) {
    return new Response('缺少 state 参数', { status: 400 })
  }

  let stateObj: OAuthCallbackState
  try {
    stateObj = parseCallbackState(stateParam)
  } catch {
    return new Response('state 解析失败', { status: 400 })
  }

  const { ttAbId, ttsAbId } = stateObj

  // ② 验证你方追加的自定义安全字段（如果有）
  if (stateObj.customStateToken) {
    let statePayload: { userId: string; nonce: string }
    try {
      statePayload = verifyStateToken(stateObj.customStateToken)
    } catch (err) {
      return new Response('授权链接已过期，请重新发起授权', { status: 403 })
    }

    // ③ 一次性消费检查
    const isFirstUse = await consumeStateNonce(statePayload.nonce)
    if (!isFirstUse) {
      return new Response('该授权回调已处理过，请勿重复提交', { status: 409 })
    }
  }

  // ④ 判断账号类型并持久化
  if (ttAbId) {
    await saveAccount({
      accountType: 'TT',
      accountId: ttAbId,
      businessId: ttAbId,
      status: 'ACTIVE',
    })
  }

  if (ttsAbId) {
    await saveAccount({
      accountType: 'TTS',
      accountId: ttsAbId,
      creatorUserOpenId: ttsAbId,
      status: 'ACTIVE',
    })
  }

  // ⑤ 异步拉取账号详情（不阻塞回调响应）
  const accountId = ttAbId || ttsAbId
  const accountType = ttAbId ? 'TT' : 'TTS'

  syncAccountInfoAsync(accountType, accountId!).catch((err) => {
    console.error('异步同步账号信息失败（不影响授权结果）:', err.message)
  })

  // ⑥ 返回成功页面或重定向
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
