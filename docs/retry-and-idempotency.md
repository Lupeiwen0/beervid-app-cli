# 失败重试与幂等建议

> 本文档分析 BEERVID Open API 各接口的幂等性，提供重试策略和幂等键设计的最佳实践。

## 各 API 幂等性分析

> **幂等**：同一请求多次执行，结果与执行一次相同，不产生副作用。

| API | 端点 | 幂等性 | 安全重试 | 说明 |
|-----|------|--------|----------|------|
| 获取 OAuth URL | `GET tt-url / tts-url` | ✅ 天然幂等 | ✅ | 每次返回新 URL，但不产生副作用 |
| 查询账号信息 | `POST account/info` | ✅ 天然幂等 | ✅ | 只读查询 |
| 获取上传凭证 | `POST upload-token/generate` | ❌ 非幂等 | ✅ | 每次返回新 token，但旧 token 仍有效 |
| 视频上传 | `POST file-upload` | ⚠️ 条件幂等 | ⚠️ | 同文件重复上传会产生不同 fileUrl |
| 普通视频发布 | `POST video/publish` | ❌ 非幂等 | ❌ | 重复调用可能发布多个视频 |
| 挂车视频发布 | `POST shoppable-video/publish` | ❌ 非幂等 | ❌ | 同上 |
| 轮询发布状态 | `POST video/status` | ✅ 天然幂等 | ✅ | 只读查询 |
| 查询视频数据 | `POST video/query` | ✅ 天然幂等 | ✅ | 只读查询 |
| 查询商品列表 | `POST products/query` | ✅ 天然幂等 | ✅ | 只读查询 |

### 关键结论

| 场景 | 风险 | 防护手段 |
|------|------|----------|
| **视频发布重试** | 🔴 高风险 — 重复发布产生多条视频 | 必须客户端幂等保护 |
| **视频上传重试** | 🟡 中风险 — 产生冗余文件但不影响业务 | 建议 MD5 去重 |
| **查询类重试** | 🟢 低风险 — 只读操作无副作用 | 可放心重试 |

---

## 重试策略

### 推荐：指数退避 + 抖动

```typescript
interface RetryOptions {
  maxRetries: number     // 最大重试次数
  baseDelay: number      // 基础延迟（毫秒）
  maxDelay: number       // 最大延迟（毫秒）
  jitterFactor: number   // 抖动因子 (0-1)
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,    // 1 秒
  maxDelay: 30000,    // 30 秒
  jitterFactor: 0.5,  // ±50% 随机抖动
}

function calculateDelay(attempt: number, options: RetryOptions): number {
  // 指数退避：1s → 2s → 4s → 8s → ...
  const exponentialDelay = Math.min(
    options.baseDelay * Math.pow(2, attempt - 1),
    options.maxDelay
  )

  // 加入随机抖动，避免多客户端同时重试的"惊群"
  const jitter = exponentialDelay * options.jitterFactor * (Math.random() * 2 - 1)
  return Math.max(0, exponentialDelay + jitter)
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY,
  shouldRetry?: (error: Error) => boolean
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error

      // 判断是否可重试
      if (attempt > options.maxRetries) break
      if (shouldRetry && !shouldRetry(lastError)) break

      const delay = calculateDelay(attempt, options)
      console.warn(`第 ${attempt} 次失败，${(delay / 1000).toFixed(1)}s 后重试: ${lastError.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
}
```

### 可重试条件

```typescript
function isRetryableError(error: Error): boolean {
  const message = error.message

  // 网络错误：可重试
  if (message.includes('fetch failed') || message.includes('ECONNRESET')) return true

  // 5xx 服务端错误：可重试
  if (/HTTP 5\d\d/.test(message)) return true

  // 超时：可重试
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) return true

  // 429 限流：可重试（通常需要更长等待）
  if (message.includes('429') || message.includes('rate limit')) return true

  // 4xx 客户端错误：通常不可重试（参数错误、权限不足等）
  if (/HTTP 4\d\d/.test(message)) return false

  // Open API 业务错误：通常不可重试
  if (message.includes('Open API 错误')) return false

  return false
}
```

### 各场景推荐配置

| 场景 | maxRetries | baseDelay | 说明 |
|------|-----------|-----------|------|
| 查询类（只读） | 3 | 1s | 安全重试，快速回复 |
| 上传凭证获取 | 3 | 2s | 凭证有效期 30 分钟，有充裕时间 |
| 视频上传 | 2 | 5s | 大文件上传耗时，间隔适当加大 |
| 视频发布 | **0** | — | **不重试**，使用幂等机制保护 |
| 队列消费 | 3 | 2s | 配合 acknowledge 限制总重试次数 |

---

## 幂等键设计

### 发布幂等

发布是最需要幂等保护的操作。推荐方案：

```typescript
// 生成幂等键
function generatePublishIdempotencyKey(
  accountId: string,
  fileIdentifier: string,  // fileUrl 或 videoFileId
  timestamp?: number
): string {
  // 使用 accountId + 文件标识 + 时间窗口，确保同一文件在短时间内不会被重复发布
  const timeWindow = Math.floor((timestamp ?? Date.now()) / (60 * 1000))  // 1 分钟窗口
  return `publish:${accountId}:${fileIdentifier}:${timeWindow}`
}
```

### 数据库层幂等

```typescript
async function publishWithIdempotency(params: PublishParams): Promise<PublishResult> {
  const idempotencyKey = generatePublishIdempotencyKey(
    params.accountId,
    params.fileUrl ?? params.fileId
  )

  // ① 检查是否已有记录
  const existing = await db.findVideoByIdempotencyKey(idempotencyKey)
  if (existing) {
    console.log('检测到重复发布请求，返回已有记录')
    return existing
  }

  // ② 先创建记录（占位）
  const record = await db.createVideo({
    ...params,
    idempotencyKey,
    publishStatus: 'PENDING',
  })

  try {
    // ③ 调用 BEERVID API
    const result = await openApiPost('/api/v1/open/tiktok/video/publish', {
      businessId: params.businessId,
      videoUrl: params.fileUrl,
      caption: params.caption,
    })

    // ④ 更新记录
    await db.updateVideo(record.id, {
      shareId: result.shareId,
      publishStatus: 'PROCESSING_DOWNLOAD',
    })

    return result
  } catch (err) {
    // ⑤ 发布失败，标记记录
    await db.updateVideo(record.id, {
      publishStatus: 'FAILED',
      failReason: (err as Error).message,
    })
    throw err
  }
}
```

### 上传幂等（MD5 去重）

```typescript
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function computeFileMD5(filePath: string): string {
  const buffer = readFileSync(filePath)
  return createHash('md5').update(buffer).digest('hex')
}

async function uploadWithDedup(filePath: string): Promise<UploadResult> {
  const md5 = computeFileMD5(filePath)

  // 检查是否已上传过
  const existing = await db.findUploadByMD5(md5)
  if (existing && existing.fileUrl) {
    console.log('文件已上传过，复用已有 URL')
    return existing
  }

  // 执行上传
  const result = await uploadNormalVideo(filePath)

  // 记录上传结果
  await db.saveUploadRecord({
    md5,
    fileUrl: result.fileUrl,
    fileName: filePath,
  })

  return result
}
```

---

## 队列消费的幂等处理

```typescript
interface QueueMessage {
  messageId: string     // 消息唯一 ID
  body: unknown
  deliveryCount: number // 投递次数
}

async function handleMessage(message: QueueMessage): Promise<void> {
  // ① 投递次数检查
  if (message.deliveryCount > 3) {
    console.error(`消息 ${message.messageId} 已投递 ${message.deliveryCount} 次，放弃处理`)
    await queue.acknowledge(message)  // 丢弃，防止无限重投
    return
  }

  // ② 消息去重（基于 messageId）
  const processed = await redis.get(`msg:${message.messageId}`)
  if (processed) {
    console.log(`消息 ${message.messageId} 已处理过，跳过`)
    await queue.acknowledge(message)
    return
  }

  try {
    // ③ 业务处理
    await processBusinessLogic(message.body)

    // ④ 标记已处理
    await redis.set(`msg:${message.messageId}`, '1', 'EX', 86400)  // 24h 过期
    await queue.acknowledge(message)
  } catch (err) {
    // ⑤ 处理失败：不 acknowledge，让消息重新投递
    console.error(`消息处理失败: ${err.message}，等待重投`)
  }
}
```

---

## 完整策略速查表

| 操作 | 安全重试 | 幂等保护 | 重试策略 | 幂等方案 |
|------|----------|----------|----------|----------|
| 获取 OAuth URL | ✅ | 不需要 | 3 次 / 1s 退避 | — |
| 查询账号信息 | ✅ | 不需要 | 3 次 / 1s 退避 | — |
| 获取上传凭证 | ✅ | 不需要 | 3 次 / 2s 退避 | — |
| 视频上传 | ⚠️ | 建议 | 2 次 / 5s 退避 | MD5 去重 |
| 普通视频发布 | ❌ | **必须** | 不重试 | 数据库幂等键 |
| 挂车视频发布 | ❌ | **必须** | 不重试 | 数据库幂等键 |
| 轮询发布状态 | ✅ | 不需要 | 3 次 / 1s 退避 | — |
| 查询视频数据 | ✅ | 不需要 | 3 次 / 1s 退避 | — |
| 查询商品列表 | ✅ | 不需要 | 3 次 / 1s 退避 | — |
