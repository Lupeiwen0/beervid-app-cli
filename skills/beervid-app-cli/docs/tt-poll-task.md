# TT 轮询任务建议

> 本文档描述普通视频（TT）发布后的状态轮询策略设计。
> 挂车视频（TTS）发布后立即完成，**不需要轮询**。

## 为什么需要轮询

TT 普通视频发布后，TikTok 需要处理视频转码和分发。API 返回的 `shareId` 只是提交凭证，真正的视频 ID（`post_ids`）需要通过持续查询 `/api/v1/open/tiktok/video/status` 获取。

### 状态流转

```
                        ┌─── PUBLISH_COMPLETE（post_ids 非空）→ ✅ 完成
PROCESSING_DOWNLOAD ────┤
                        ├─── PUBLISH_COMPLETE（post_ids 为空）→ 继续轮询
                        │
                        └─── FAILED（携带 reason）→ ❌ 失败
```

> **注意**：`PUBLISH_COMPLETE` 但 `post_ids` 为空是正常的中间态，必须继续轮询直到拿到有值的 `post_ids`。

---

## 轮询间隔建议

### 推荐策略：阶梯递增间隔

根据经验，视频处理通常在 10-60 秒内完成，但复杂视频可能需要数分钟。推荐使用**阶梯递增间隔**而非固定间隔：

```
前 6 次（0-30s）：每 5 秒查询一次    → 覆盖大部分快速完成的场景
第 7-12 次（30s-90s）：每 10 秒一次   → 中等耗时视频
第 13 次起（90s+）：每 15 秒一次      → 长耗时视频，降低 API 压力
最大轮询次数：60 次（约 12 分钟后超时）
```

```typescript
function getPollingInterval(pollCount: number): number {
  if (pollCount <= 6) return 5_000       // 前 30 秒：5s
  if (pollCount <= 12) return 10_000     // 30-90 秒：10s
  return 15_000                          // 90 秒之后：15s
}
```

### 其他策略对比

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 固定间隔（5s） | 简单 | API 压力大 | 低流量场景 |
| 阶梯递增 | 平衡响应速度和 API 压力 | 代码稍复杂 | **推荐** |
| 指数退避 | 最省 API 调用 | 后期间隔太长，用户体验差 | 后台任务 |
| 自适应 | 最优 | 实现复杂 | 高流量场景 |

---

## 三层保障机制

### 第一层：用户侧主动轮询

用户在界面上点击"刷新状态"，前端调用后端接口，后端调用 BEERVID API。

```typescript
// 后端接口
app.get('/api/videos/:videoRecordId/refresh-status', async (req, res) => {
  const record = await db.findVideoById(req.params.videoRecordId)
  if (!record || record.publishStatus === 'PUBLISH_COMPLETE') {
    return res.json(record)
  }

  const data = await openApiPost('/api/v1/open/tiktok/video/status', {
    businessId: record.businessId,
    shareId: record.shareId,
  })

  const status = data.status ?? 'UNKNOWN'
  const postIds = data.post_ids ?? []

  await db.updateVideo(record.id, {
    publishStatus: status,
    videoId: postIds[0] ?? null,
    failReason: data.reason ?? null,
    pollCount: record.pollCount + 1,
    lastPolledAt: new Date(),
  })

  res.json({ status, videoId: postIds[0], reason: data.reason })
})
```

### 第二层：定时任务（Cron）

后台定时扫描所有"未完成"记录，批量轮询状态。

```typescript
// 每 30 秒执行一次
cron.schedule('*/30 * * * * *', async () => {
  // 查找所有需要轮询的记录：
  // 1. 状态为 PROCESSING_DOWNLOAD 或 PUBLISH_COMPLETE（但无 videoId）
  // 2. 轮询次数未超限
  // 3. 距离上次轮询至少 5 秒
  const pendingVideos = await db.query(`
    SELECT * FROM beervid_videos
    WHERE publish_status IN ('PROCESSING_DOWNLOAD', 'PUBLISH_COMPLETE')
      AND video_id IS NULL
      AND poll_count < 60
      AND (last_polled_at IS NULL OR last_polled_at < NOW() - INTERVAL 5 SECOND)
    ORDER BY created_at ASC
    LIMIT 20
  `)

  // 逐条轮询，单条失败不影响其他
  for (const video of pendingVideos) {
    try {
      await pollAndUpdateSingle(video)
    } catch (err) {
      console.error(`轮询失败 [shareId=${video.shareId}]:`, err.message)
    }
  }
})

async function pollAndUpdateSingle(video: VideoRecord): Promise<void> {
  const data = await openApiPost('/api/v1/open/tiktok/video/status', {
    businessId: video.businessId,
    shareId: video.shareId,
  })

  const status = data.status ?? 'UNKNOWN'
  const postIds = data.post_ids ?? []
  const isComplete = status === 'PUBLISH_COMPLETE' && postIds.length > 0
  const isFailed = status === 'FAILED'

  await db.updateVideo(video.id, {
    publishStatus: isComplete ? 'PUBLISH_COMPLETE' : isFailed ? 'FAILED' : status,
    videoId: postIds[0] ?? null,
    failReason: data.reason ?? null,
    pollCount: video.pollCount + 1,
    lastPolledAt: new Date(),
  })

  // 完成后异步触发视频数据查询
  if (isComplete && postIds[0]) {
    syncVideoDataAsync(video.businessId, postIds[0]).catch(() => {})
  }
}
```

### 第三层：异步队列（可选，高流量场景）

发布后投递消息到队列，由消费者异步轮询。适用于发布量大、需要隔离轮询负载的场景。

```typescript
// 发布后投递延迟消息
async function publishAndEnqueue(businessId: string, videoUrl: string): Promise<void> {
  const result = await openApiPost('/api/v1/open/tiktok/video/publish', {
    businessId,
    videoUrl,
  })

  await db.createVideo({ businessId, shareId: result.shareId, publishStatus: 'PROCESSING_DOWNLOAD' })

  // 投递延迟消息：5 秒后首次检查
  await queue.send('video-status-poll', {
    businessId,
    shareId: result.shareId,
    attempt: 1,
  }, { delaySeconds: 5 })
}

// 队列消费者
async function handlePollMessage(message: PollMessage): Promise<void> {
  const { businessId, shareId, attempt } = message

  if (attempt > 60) {
    await db.updateVideo(shareId, { publishStatus: 'TIMEOUT' })
    return  // acknowledge，不再重投
  }

  const data = await openApiPost('/api/v1/open/tiktok/video/status', { businessId, shareId })
  const status = data.status ?? 'UNKNOWN'
  const postIds = data.post_ids ?? []

  if (status === 'FAILED' || (status === 'PUBLISH_COMPLETE' && postIds.length > 0)) {
    // 终态，更新并结束
    await db.updateVideo(shareId, {
      publishStatus: status,
      videoId: postIds[0],
      failReason: data.reason,
    })
    return
  }

  // 非终态，投递下一次延迟消息
  const delay = getPollingInterval(attempt) / 1000
  await queue.send('video-status-poll', {
    businessId,
    shareId,
    attempt: attempt + 1,
  }, { delaySeconds: delay })
}
```

---

## 超时处理

当轮询次数达到上限时：

1. **标记超时**：将 `publish_status` 设为 `TIMEOUT`
2. **不立即放弃**：后续 Cron 可以用更低频率（如每 5 分钟）继续检查 TIMEOUT 记录
3. **通知用户**：推送通知告知"视频处理超时，系统将继续在后台检查"
4. **人工介入入口**：提供"手动重试轮询"的按钮

---

## 时序图

```
用户         你的后端           BEERVID API          TikTok
 │             │                   │                   │
 │ 发布视频 ──→│                   │                   │
 │             │ publish ────────→ │                   │
 │             │ ←── shareId ──── │                   │
 │             │                   │                   │
 │             │ save(PROCESSING)  │                   │
 │             │                   │                   │
 │             │ ── 5s 后 ──       │                   │
 │             │ poll-status ────→ │ 查询 TikTok ────→│
 │             │ ← PROCESSING ─── │ ← 处理中 ──────── │
 │             │                   │                   │
 │             │ ── 5s 后 ──       │                   │
 │             │ poll-status ────→ │ 查询 TikTok ────→│
 │             │ ← COMPLETE ───── │ ← 发布完成 ────── │
 │             │   (post_ids)      │                   │
 │             │                   │                   │
 │             │ save(COMPLETE)    │                   │
 │             │ query-video ────→ │                   │
 │             │ ← 播放量 etc ──── │                   │
 │ ←── 完成 ── │                   │                   │
```
