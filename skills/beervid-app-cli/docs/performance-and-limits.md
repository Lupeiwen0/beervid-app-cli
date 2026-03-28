# 性能优化与限流说明

本文档只保留与 BEERVID Open API 接入直接相关的性能建议，重点关注限流、分页、轮询和批量调用。

## 目录

1. [限流处理](#限流处理)
2. [分页与批量查询](#分页与批量查询)
3. [TT 发布轮询](#tt-发布轮询)
4. [上传与文件处理](#上传与文件处理)
5. [实践建议](#实践建议)

---

## 限流处理

### 1. 遇到 `429` 时做退避重试

当前仓库的 `openApiPost` / `openApiGet` 在失败时会抛出 `Error.message`，所以建议按错误消息判断是否命中了限流：

```typescript
function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('(code: 429)') || message.includes('Too Many Requests')
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (isRateLimitError(error) && i < maxRetries - 1) {
        const delayMs = Math.pow(2, i) * 1000
        await sleep(delayMs)
        continue
      }
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

### 2. 非幂等发布不要无脑重试

- `query-products`、`query-video`、`poll-status` 这类读操作适合退避重试
- 上传和发布动作要区分对待
- 对于 `publish` / `publish-tt-flow` / `publish-tts-flow`，优先保证幂等控制，再决定是否补偿重试

---

## 分页与批量查询

### 1. `query-products` 的 `pageSize` 最大为 `20`

OpenAPI 已明确商品查询每页最多 `20` 条，当前 CLI 也已按这个范围校验：

```bash
beervid query-products --creator-id open_user_abc --page-size 20
```

如果需要拉更多商品，使用分页游标继续查：

```bash
beervid query-products --creator-id open_user_abc --cursor <next-cursor>
```

### 2. `query-video` 支持分页

视频查询现在支持：

- 不传 `itemIds`，按账号查询视频列表
- 传 `--cursor`
- 传 `--max-count`（10-20）

```bash
beervid query-video --business-id biz_123 --cursor 0 --max-count 20
beervid query-video --business-id biz_123 --item-ids 7123,7124
```

### 3. 批量查询时按 20 条一批拆分

```typescript
function chunk<T>(array: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(array.length / size) },
    (_, i) => array.slice(i * size, (i + 1) * size)
  )
}

for (const batch of chunk(videoIds, 20)) {
  await openApiPost('/api/v1/open/tiktok/video/query', {
    businessId,
    itemIds: batch,
  })
}
```

---

## TT 发布轮询

### 1. `poll-status` 只在 TT 普通发布链路里使用

推荐链路：

1. `publish`
2. 拿到 `shareId`
3. `poll-status`
4. 当 `status === PUBLISH_COMPLETE` 且 `post_ids` 非空时，再去 `query-video`

### 2. 轮询间隔不要压太短

当前 CLI 默认：

- `--interval 5`
- `--max-polls 60`

这套默认值已经覆盖大多数场景；如果你在服务端自己实现轮询任务，也建议保持秒级而不是毫秒级高频轮询。

---

## 上传与文件处理

### 1. 优先上传本地文件，远程 URL 会多一次下载

当前 CLI 的 `--file` 同时支持本地路径和 URL，但传 URL 时会先下载再上传：

```bash
beervid upload --file ./video.mp4
beervid upload --file https://example.com/video.mp4
```

如果你已经在服务端拿到了文件内容，优先走本地文件/内存文件上传，减少链路耗时。

### 2. 大文件场景加超时与进度监控

如果你不是直接用 CLI，而是自己封装上传，至少补这两项：

- 请求超时
- 上传进度日志

当前项目里如果需要上传进度，仍然推荐优先用 XHR 而不是裸 `fetch`。

---

## 实践建议

- 把所有 Open API 调用都收口到统一 client 层，方便集中做超时、重试和日志
- 读接口优先重试，写接口优先幂等
- 商品查询和视频查询一律按分页参数设计，不要默认一次拉完全部数据
- TT 轮询结果只有在 `post_ids` 真正返回后，才进入后续查数链路
