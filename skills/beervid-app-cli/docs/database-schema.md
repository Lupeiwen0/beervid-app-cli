# 数据表字段建议

> 本文档为接入 BEERVID 第三方应用 Open API 的后端系统提供数据库表结构设计建议。
> 以 SQL DDL 呈现，兼顾 MySQL 和 PostgreSQL 语法。

## 总览

接入 BEERVID Open API 通常需要持久化以下实体：

| 表名 | 作用 | 关联 API |
|------|------|----------|
| `beervid_accounts` | 存储 TT/TTS 授权账号信息 | OAuth 回调、`account/info` |
| `beervid_videos` | 视频发布记录与状态追踪 | `publish`、`poll-status`、`query-video` |
| `beervid_products` | TTS 商品缓存 | `products/query` |

---

## 1. 账号表 `beervid_accounts`

存储通过 OAuth 授权绑定的 TT/TTS 账号。

```sql
CREATE TABLE beervid_accounts (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- 账号标识
  account_type    VARCHAR(8)   NOT NULL COMMENT 'TT 或 TTS',
  account_id      VARCHAR(128) NOT NULL COMMENT 'OAuth 回调返回的 ttAbId 或 ttsAbId',

  -- TT 账号专用：即 businessId，所有 TT 操作的入参
  business_id     VARCHAR(128) DEFAULT NULL COMMENT 'TT 业务 ID（= ttAbId）',

  -- TTS 账号专用：即 creatorUserOpenId，所有 TTS 操作的入参
  creator_user_open_id VARCHAR(128) DEFAULT NULL COMMENT 'TTS 用户 OpenId（= ttsAbId）',

  -- 账号详情（来自 POST /api/v1/open/account/info）
  username        VARCHAR(256) DEFAULT NULL,
  link_username   VARCHAR(256) DEFAULT NULL COMMENT '推荐的 TT/TTS 关联键（建议存归一化后的 username）',
  display_name    VARCHAR(256) DEFAULT NULL,
  seller_name     VARCHAR(256) DEFAULT NULL COMMENT 'TTS 账号的卖家名称',
  profile_url     TEXT         DEFAULT NULL COMMENT '头像 URL',
  followers_count INT          DEFAULT 0,
  access_token    VARCHAR(512) DEFAULT NULL COMMENT '访问令牌',

  -- 业务归属
  app_user_id     BIGINT       DEFAULT NULL COMMENT '你方系统的用户 ID（多对一关系）',

  -- 状态
  status          VARCHAR(32)  DEFAULT 'ACTIVE' COMMENT 'ACTIVE / EXPIRED / REVOKED',

  -- 时间
  authorized_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP COMMENT 'OAuth 授权时间',
  deleted_at      TIMESTAMP    DEFAULT NULL COMMENT '软删除时间',
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 索引
  UNIQUE KEY uk_account (account_type, account_id),
  KEY idx_app_user (app_user_id),
  KEY idx_business_id (business_id),
  KEY idx_creator_user_open_id (creator_user_open_id),
  KEY idx_link_username (link_username)
);
```

### 关键说明

| 字段 | 来源 | 备注 |
|------|------|------|
| `account_id` | OAuth 回调参数 `ttAbId` 或 `ttsAbId` | 唯一标识，与 `account_type` 组成唯一键 |
| `business_id` | 等同于 `ttAbId` | TT 账号的所有操作（发布、轮询、查数据）都以此为入参 |
| `creator_user_open_id` | 等同于 `ttsAbId` | TTS 账号的所有操作（上传、发布、查商品）都以此为入参 |
| `link_username` | `account/info` 返回的 `username` 归一化后保存 | 当前推荐用作 TT/TTS 的关联键；官方暂无 `uno_id` |
| `access_token` | `account/info` 返回 | 按需存储，用于特殊场景 |
| `app_user_id` | 你方系统 | 一个用户可绑定多个 TT/TTS 账号 |

### TT / TTS 关联建议

- 同一达人如果既授权了 TTS，又授权了 TT，建议保存为两条账号记录。
- 官方当前没有提供 `uno_id` 这类 TT/TTS 强关联字段。
- 推荐额外维护 `link_username`，例如保存 `LOWER(TRIM(username))` 后的值，作为当前最稳妥的软关联键。
- 真正调用接口时不要使用 `link_username` 替代业务 ID；TT 继续使用 `business_id`，TTS 继续使用 `creator_user_open_id`。

---

## 2. 视频表 `beervid_videos`

记录每次视频发布的全生命周期。

```sql
CREATE TABLE beervid_videos (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- 关联账号
  account_id      BIGINT       NOT NULL COMMENT '关联 beervid_accounts.id',
  publish_type    VARCHAR(16)  NOT NULL COMMENT 'NORMAL 或 SHOPPABLE',

  -- 发布前：上传信息
  file_url        TEXT         DEFAULT NULL COMMENT '普通上传返回的 fileUrl',
  video_file_id   VARCHAR(128) DEFAULT NULL COMMENT 'TTS 上传返回的 videoFileId',
  file_name       VARCHAR(256) DEFAULT NULL,
  file_size       BIGINT       DEFAULT NULL COMMENT '文件大小（字节）',
  caption         TEXT         DEFAULT NULL COMMENT '视频描述/文案',

  -- 发布后：追踪 ID
  share_id        VARCHAR(128) DEFAULT NULL COMMENT '普通发布返回，用于轮询',
  video_id        VARCHAR(128) DEFAULT NULL COMMENT 'TikTok 视频 ID',

  -- TTS 挂车专用
  product_id      VARCHAR(128) DEFAULT NULL COMMENT '关联商品 ID',
  product_title   VARCHAR(64)  DEFAULT NULL COMMENT '关联商品标题（≤30字符）',

  -- 发布状态
  publish_status  VARCHAR(32)  DEFAULT 'PENDING'
    COMMENT 'PENDING / PROCESSING_DOWNLOAD / PUBLISH_COMPLETE / FAILED / TIMEOUT',
  fail_reason     TEXT         DEFAULT NULL COMMENT '失败原因',
  poll_count      INT          DEFAULT 0   COMMENT '已轮询次数',
  last_polled_at  TIMESTAMP    DEFAULT NULL COMMENT '最后一次轮询时间',

  -- 视频数据统计（来自 query-video）
  video_views     INT          DEFAULT NULL,
  likes           INT          DEFAULT NULL,
  comments        INT          DEFAULT NULL,
  shares          INT          DEFAULT NULL,
  share_url       TEXT         DEFAULT NULL,
  thumbnail_url   TEXT         DEFAULT NULL,
  data_synced_at  TIMESTAMP    DEFAULT NULL COMMENT '最后一次数据同步时间',

  -- 幂等控制
  idempotency_key VARCHAR(128) DEFAULT NULL COMMENT '发布请求的稳定幂等键，防止重复发布',

  -- 时间
  deleted_at      TIMESTAMP    DEFAULT NULL COMMENT '软删除时间',
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 索引
  KEY idx_account (account_id),
  KEY idx_share_id (share_id),
  KEY idx_video_id (video_id),
  KEY idx_publish_status (publish_status),
  UNIQUE KEY uk_idempotency (idempotency_key),
  KEY idx_status_poll (publish_status, last_polled_at)
    COMMENT '轮询定时任务：查找需要继续轮询的记录'
);
```

### 关键说明

| 字段 | 用途 |
|------|------|
| `share_id` | 普通视频发布返回，用于后续 `poll-status` 轮询 |
| `video_id` | 挂车发布直接返回；普通发布从轮询结果 `post_ids[0]` 获取 |
| `publish_status` | 核心状态字段，定时任务依据此字段扫描待轮询记录 |
| `idempotency_key` | 建议使用你方业务侧稳定唯一值，如 `publish_request_id`、草稿 ID 或客户端 requestId；不要拼接时间戳 |
| `idx_status_poll` | 复合索引，加速"查找所有 PROCESSING_DOWNLOAD 且距上次轮询超过 N 秒"的查询 |

---

## 3. 商品缓存表 `beervid_products`

缓存 TTS 商品数据，减少重复查询。

```sql
CREATE TABLE beervid_products (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- 商品标识
  product_id          VARCHAR(128) NOT NULL COMMENT 'BEERVID 商品 ID',
  creator_user_open_id VARCHAR(128) NOT NULL COMMENT '所属 TTS 账号',

  -- 商品信息
  title               VARCHAR(256) NOT NULL,
  price_amount        VARCHAR(32)  DEFAULT NULL,
  price_currency      VARCHAR(8)   DEFAULT NULL,
  images              JSON         DEFAULT NULL COMMENT '商品图片 URL 数组（已解析）',
  sales_count         INT          DEFAULT 0,
  brand_name          VARCHAR(256) DEFAULT NULL,
  shop_name           VARCHAR(256) DEFAULT NULL,
  source              VARCHAR(16)  DEFAULT NULL COMMENT 'shop 或 showcase',

  -- 状态
  review_status       VARCHAR(32)  DEFAULT NULL COMMENT 'APPROVED / PENDING / REJECTED',
  inventory_status    VARCHAR(32)  DEFAULT NULL COMMENT 'IN_STOCK / OUT_OF_STOCK',

  -- 缓存管理
  cached_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP COMMENT '首次缓存时间',
  refreshed_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP COMMENT '最后刷新时间',
  deleted_at          TIMESTAMP    DEFAULT NULL COMMENT '软删除时间',

  -- 索引
  UNIQUE KEY uk_product_creator (product_id, creator_user_open_id),
  KEY idx_creator (creator_user_open_id),
  KEY idx_review_inventory (review_status, inventory_status)
    COMMENT '过滤可发布商品：APPROVED + IN_STOCK',
  KEY idx_sales (creator_user_open_id, sales_count DESC)
    COMMENT '按销量排序选择商品'
);
```

### 关键说明

| 字段 | 备注 |
|------|------|
| `images` | 存储已解析的图片 URL 数组（非 BEERVID 原始格式），解析方法见 SKILL.md |
| `review_status` + `inventory_status` | 筛选可发布商品：仅 `APPROVED` + `IN_STOCK` 可用于挂车发布 |
| `refreshed_at` | 缓存淘汰依据，建议超过 24 小时重新拉取 |
| `deleted_at` | 若采用 `docs/tts-product-cache.md` 中的全量替换方案，需要用它标记旧缓存失效 |

---

## ER 关系

```
┌─────────────────────┐       ┌──────────────────────┐
│  beervid_accounts   │ 1   N │   beervid_videos     │
│                     │───────│                      │
│  id (PK)            │       │  account_id (FK)     │
│  account_type       │       │  publish_type        │
│  business_id        │       │  share_id            │
│  creator_user_open_id│      │  video_id            │
│  app_user_id        │       │  publish_status      │
└─────────────────────┘       └──────────────────────┘
         │ 1
         │ N
┌─────────────────────┐
│  beervid_products   │
│                     │
│  creator_user_open_id│
│  product_id         │
│  title              │
│  sales_count        │
└─────────────────────┘
```

## 补充建议

1. **软删除**：本文示例已将 `deleted_at` 纳入推荐表结构；如果你不采用软删除，也要同步调整 `docs/tts-product-cache.md` 中依赖该字段的 SQL
2. **审计日志**：高敏感操作（发布、授权）建议独立记录操作日志表
3. **分库分表**：如视频表数据量大，可按 `account_id` 分片
4. **PostgreSQL 用户**：将 `AUTO_INCREMENT` 替换为 `GENERATED ALWAYS AS IDENTITY`，`JSON` 替换为 `JSONB`
