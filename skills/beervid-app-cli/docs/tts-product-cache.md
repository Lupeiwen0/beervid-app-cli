# TTS 商品缓存建议

> 本文档描述如何设计 TTS 商品的本地缓存策略，减少对 BEERVID API 的重复请求，同时保证商品数据的时效性。

## 为什么需要缓存

挂车发布流程需要先查商品列表再选择商品。如果每次发布都实时查询：
- **延迟高**：商品分页查询可能需要多次 API 调用（shop + showcase，多页）
- **重复浪费**：同一创作者的商品列表短时间内不会频繁变化
- **配额风险**：高频调用可能触发 API 限流

---

## 缓存策略总览

```
┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│ 发布请求      │────→│ 本地商品缓存    │────→│ 选择商品        │
│              │     │ (beervid_products)│   │ 进入发布流程    │
└──────────────┘     └────────────────┘     └────────────────┘
                            │
                     缓存过期或为空？
                            │
                            ▼
                     ┌────────────────┐
                     │ BEERVID API    │
                     │ products/query │
                     │ 全量拉取刷新    │
                     └────────────────┘
```

---

## 缓存刷新策略

### 推荐方案：惰性刷新 + 定期预热

| 策略 | 触发时机 | 说明 |
|------|----------|------|
| **惰性刷新** | 用户发起发布且缓存过期 | 实时拉取商品，写入缓存后继续发布流程 |
| **定期预热** | Cron 定时任务 | 后台定期刷新活跃账号的商品缓存 |
| **手动刷新** | 用户主动触发 | 提供"刷新商品列表"按钮 |

### 缓存过期时间建议

| 场景 | 过期时间 | 理由 |
|------|----------|------|
| 常规使用 | 24 小时 | 商品列表变化频率低 |
| 高频发布 | 6 小时 | 需要更新商品状态（库存、审核） |
| 交互式选择 | 1 小时 | 用户正在浏览商品，需要较新数据 |

---

## 全量拉取实现

商品查询需要同时查询 `shop` 和 `showcase` 两种来源，按 `id` 去重合并。

以下示例默认采用 [`docs/database-schema.md`](./database-schema.md) 中包含 `deleted_at` 的软删除表结构。

```typescript
async function refreshProductCache(
  creatorId: string,
  pageSize: number = 20,
  maxPages: number = 5
): Promise<void> {
  const allProducts = new Map<string, Product>()

  for (const productType of ['shop', 'showcase'] as const) {
    let pageToken = ''
    let page = 0

    while (page < maxPages) {
      page++
      const data = await openApiPost('/api/v1/open/tts/products/query', {
        creatorUserOpenId: creatorId,
        productType,
        pageSize,
        pageToken,
      })

      const groups = Array.isArray(data) ? data : [data]
      for (const group of groups) {
        for (const product of group.products ?? []) {
          if (!allProducts.has(product.id)) {
            allProducts.set(product.id, {
              ...product,
              images: (product.images ?? []).map(extractImageUrl),
              source: product.source ?? productType,
            })
          }
        }

        // 更新分页游标
        if (group.nextPageToken === null || group.nextPageToken === undefined) {
          pageToken = '' // 已是最后一页
          break
        }
        pageToken = group.nextPageToken
      }

      if (!pageToken) break
    }
  }

  // 写入数据库：全量替换该创作者的商品缓存
  await db.transaction(async (tx) => {
    // 软删除旧数据
    await tx.execute(
      'UPDATE beervid_products SET deleted_at = NOW() WHERE creator_user_open_id = ? AND deleted_at IS NULL',
      [creatorId]
    )

    // 插入新数据
    for (const product of allProducts.values()) {
      await tx.execute(`
        INSERT INTO beervid_products
          (product_id, creator_user_open_id, title, price_amount, price_currency,
           images, sales_count, brand_name, shop_name, source,
           review_status, inventory_status, cached_at, refreshed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          price_amount = VALUES(price_amount),
          images = VALUES(images),
          sales_count = VALUES(sales_count),
          review_status = VALUES(review_status),
          inventory_status = VALUES(inventory_status),
          refreshed_at = NOW(),
          deleted_at = NULL
      `, [
        product.id, creatorId, product.title,
        product.price?.amount, product.price?.currency,
        JSON.stringify(product.images), product.salesCount,
        product.brandName, product.shopName, product.source,
        product.reviewStatus, product.inventoryStatus,
      ])
    }
  })
}
```

---

## 商品图片 URL 解析

BEERVID API 返回的商品图片格式为非标准字符串：

```
{height=200, url=https://img.tiktokcdn.com/xxx.jpg, width=200}
```

**必须在入库前解析为标准 URL**，否则前端无法直接使用：

```typescript
function extractImageUrl(imageStr: string): string {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? ''
}

// 使用
const images = (product.images ?? []).map(extractImageUrl).filter(Boolean)
// 结果: ["https://img.tiktokcdn.com/xxx.jpg"]
```

> **建议**：将解析后的 URL 数组以 JSON 格式存入数据库的 `images` 字段。

---

## 分页游标管理

如果单次拉取（maxPages 限制）未能获取所有商品，需要持久化游标以支持增量拉取：

```typescript
interface CreatorCacheState {
  creatorId: string
  lastRefreshedAt: Date
  shopPageToken: string | null    // null = 已拉完
  showcasePageToken: string | null
  totalProductsCached: number
}

// 判断是否需要刷新
function needsRefresh(state: CreatorCacheState, ttlMs: number): boolean {
  if (!state.lastRefreshedAt) return true
  return Date.now() - state.lastRefreshedAt.getTime() > ttlMs
}

// 判断是否有未拉取的页
function hasMorePages(state: CreatorCacheState): boolean {
  return state.shopPageToken !== null || state.showcasePageToken !== null
}
```

---

## 查询缓存时的筛选

发布挂车视频时，不是所有商品都可用。需要筛选：

```sql
-- 查询可发布商品（按销量降序）
SELECT * FROM beervid_products
WHERE creator_user_open_id = ?
  AND deleted_at IS NULL
  AND (review_status = 'APPROVED' OR review_status IS NULL)
  AND (inventory_status = 'IN_STOCK' OR inventory_status IS NULL)
ORDER BY sales_count DESC
LIMIT 20;
```

如果你不采用软删除，可以去掉 `deleted_at IS NULL` 条件，并在刷新缓存时改成物理删除或全量覆盖。

---

## 定期预热设计

```typescript
// 每 6 小时执行一次
cron.schedule('0 */6 * * *', async () => {
  // 查找活跃账号（最近 7 天有发布行为的 TTS 账号）
  const activeCreators = await db.query(`
    SELECT DISTINCT a.creator_user_open_id
    FROM beervid_accounts a
    JOIN beervid_videos v ON v.account_id = a.id
    WHERE a.account_type = 'TTS'
      AND a.status = 'ACTIVE'
      AND v.created_at > NOW() - INTERVAL 7 DAY
  `)

  for (const creator of activeCreators) {
    try {
      await refreshProductCache(creator.creator_user_open_id)
      console.log(`商品缓存已刷新: ${creator.creator_user_open_id}`)
    } catch (err) {
      console.error(`商品缓存刷新失败: ${creator.creator_user_open_id}`, err.message)
    }

    // 防止 API 限流：每个账号间隔 2 秒
    await new Promise(r => setTimeout(r, 2000))
  }
})
```

---

## 缓存要点速查

| 要点 | 建议 |
|------|------|
| 刷新触发 | 惰性（发布时检查过期）+ 定期预热（Cron 6h） |
| 过期时间 | 常规 24h，高频发布 6h |
| 数据源 | 同时查 shop + showcase，按 id 去重 |
| 图片存储 | 入库前解析为标准 URL，JSON 数组格式 |
| 可用性筛选 | review_status=APPROVED + inventory_status=IN_STOCK |
| 分页 | 首次全量拉取，持久化游标支持增量 |
| 并发安全 | 刷新操作加分布式锁，防止多实例重复拉取 |
