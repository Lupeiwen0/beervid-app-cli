---
name: beervid-app-cli
description: >
  BEERVID 第三方应用 Open API 集成开发指南。本 skill 专用于 BEERVID 面向第三方应用开放的 API（需 BEERVID_APP_KEY 认证），
  不同于 BEERVID 自身应用内部的 API。当用户需要以第三方应用身份调用 BEERVID 平台接口、开发 TikTok 视频发布/上传/数据统计功能、
  处理 TT/TTS 账号授权绑定、查询商品列表、或涉及 openApiGet/openApiPost/openApiUpload 相关代码时，使用此 skill。
  包括：账号 OAuth 授权、视频上传与发布（普通/挂车）、发布状态轮询、视频数据查询、TTS 商品查询等完整业务流程。
  即使用户只是提到"发布视频"、"绑定账号"、"查询视频数据"、"挂车发布"、"第三方应用"、"APP_KEY"等关键词，也应触发此 skill。
---

# BEERVID 第三方应用 Open API 集成开发指南

本 skill 专用于 **BEERVID 面向第三方应用开放的 Open API**，覆盖 6 大能力模块。

> **与 BEERVID 内部 API 的区别：** BEERVID 平台有两套 API 体系：
> - **第三方应用 Open API（本 skill）**：面向外部开发者，通过 `BEERVID_APP_KEY` 认证，API 路径前缀 `/api/v1/open/`，用于第三方应用集成 TikTok 视频发布、账号管理等能力。
> - **BEERVID 内部 API**：BEERVID 自身产品使用的接口，认证方式和接口设计不同，不在本 skill 覆盖范围内。
详细的请求/响应示例和错误码说明见 `references/api-reference.md`。

## 环境配置

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `BEERVID_APP_KEY` | API 密钥，放入请求头 `X-API-KEY` | `k9aqh41e...` |
| `BEERVID_APP_BASE_URL` | API 基础地址 | `https://open.beervid.ai` |

## 认证方式

所有请求通过 HTTP 请求头携带密钥认证：

| 场景 | 请求头 | 值 |
|------|--------|-----|
| 常规 API 调用 | `X-API-KEY` | `BEERVID_APP_KEY` 环境变量值 |
| 视频上传 | `X-UPLOAD-TOKEN` | 上传凭证接口返回的 `uploadToken` |

## 统一响应格式

所有端点返回相同的响应信封：

```typescript
interface OpenApiResponse<T> {
  code: number      // 0 = 成功，非零 = 错误
  message: string
  data: T
  error: boolean
  success: boolean
}
```

**错误判定：** `code !== 0 || !success` 即为失败。建议统一抛出异常：
```
Open API 错误 [<path>]: <message> (code: <code>)
```

## 请求函数封装建议

建议封装三个基础请求函数，共享认证和错误处理逻辑：

```typescript
// GET 请求，自动拼接 query 参数
async function openApiGet<T>(path: string, params?: Record<string, string>): Promise<OpenApiResponse<T>>

// POST 请求，JSON body
async function openApiPost<T>(path: string, body?: Record<string, unknown>): Promise<OpenApiResponse<T>>

// 文件上传，FormData body（不设 Content-Type，让浏览器/runtime 自动处理 boundary）
async function openApiUpload<T>(path: string, formData: FormData, params?: Record<string, string>): Promise<OpenApiResponse<T>>
```

## 能力模块总览

### 1. 账号授权管理

处理 TikTok 账号的 OAuth 授权绑定，支持两种账号类型：

| 账号类型 | 标识 | 用途 |
|---------|------|------|
| TT（普通账号） | `accountType: 'TT'` | 普通视频发布、视频数据查询 |
| TTS（Shop 账号） | `accountType: 'TTS'` | 挂车视频发布、商品查询 |

**业务流程：**
```
获取 OAuth URL → 用户跳转授权 → 回调绑定 → 拉取账号信息 → 异步同步头像
```

**涉及端点：**
- `GET /api/v1/open/thirdparty-auth/tt-url` — 获取 TT OAuth 链接
- `GET /api/v1/open/thirdparty-auth/tts-url` — 获取 TTS OAuth 链接（返回 `crossBorderUrl`）
- `POST /api/v1/open/account/info` — 查询账号详情（头像、粉丝数、accessToken 等）

**安全建议：** OAuth 回调应使用 State Token 防止 CSRF，推荐 JWT 格式、短过期时间、一次性消费。

### 2. 视频上传

上传流程分两步：先获取上传凭证，再直接上传到 BEERVID 服务。

**业务流程：**
```
请求上传凭证 → 获得 uploadToken + uploadUrl → 直传文件
```

**涉及端点：**
- `POST /api/v1/open/upload-token/generate` — 生成上传凭证
- `POST /api/v1/open/file-upload` — 普通视频上传（返回 `fileUrl`）
- `POST /api/v1/open/file-upload/tts-video?creatorUserOpenId=xxx` — 挂车视频上传（返回 `videoFileId`）

**上传认证：** 固定使用 `X-UPLOAD-TOKEN` 请求头，值为上传凭证接口返回的 `uploadToken`。

**客户端上传建议：** 使用 XHR（非 fetch）以支持上传进度回调（`xhr.upload.onprogress`）和 AbortSignal 取消。

### 3. 视频发布

支持两种发布模式，参数和后续流程不同：

| 模式 | publishType | 关键参数 | 返回值 | 后续 |
|------|------------|---------|--------|------|
| 普通发布 | `NORMAL` | `businessId` + `videoUrl` | `shareId` | 需轮询状态 |
| 挂车发布 | `SHOPPABLE` | `creatorUserOpenId` + `fileId` + `productId` + `productTitle` | `videoId` | 立即完成 |

**涉及端点：**
- `POST /api/v1/open/tiktok/video/publish` — 普通视频发布
- `POST /api/v1/open/tts/shoppable-video/publish` — 挂车视频发布

**挂车发布约束：** `productTitle` 最大 29 字符，超出应自动截断。

### 4. 发布状态轮询

仅用于 TT 普通视频，TTS 挂车视频发布后立即完成无需轮询。

**状态流转：**
```
PROCESSING_DOWNLOAD → PUBLISH_COMPLETE（成功，携带 post_ids）
                    → FAILED（失败，携带 reason）
```

**涉及端点：**
- `POST /api/v1/open/tiktok/video/status` — 参数 `{ businessId, shareId }`

**同步策略建议：** 建议实现多重保障机制：
1. 用户主动轮询 — 用户在界面上触发状态刷新
2. 定时任务 — Cron 定期扫描未完成记录并同步状态
3. 异步队列 — 发布后投递消息，由消费者异步拉取状态

### 5. 视频数据查询

发布完成后拉取视频的播放量、点赞、评论、分享等统计数据。

**涉及端点：**
- `POST /api/v1/open/tiktok/video/query` — 参数 `{ businessId, itemIds: string[] }`

**响应格式兼容：** API 存在新旧两种字段命名，调用方需同时兼容：

| 数据项 | 新版（camelCase） | 旧版（snake_case） |
|--------|------------------|-------------------|
| 视频 ID | `itemId` | `item_id` |
| 缩略图 | `thumbnailUrl` | `thumbnail_url` |
| 分享链接 | `shareUrl` | `share_url` |
| 播放量 | `videoViews` | `video_views` |

兼容写法：
```typescript
const list = data.videoList ?? data.videos ?? []
const video = list[0]
const views = video?.videoViews ?? video?.video_views ?? 0
```

**约束：** 仅拥有 TT 授权的账号才可查询视频数据。TTS-only 账号无此能力。

### 6. TTS 商品查询

为挂车发布提供商品选择列表，支持 `shop`（店铺商品）和 `showcase`（橱窗商品）两种来源。

**涉及端点：**
- `POST /api/v1/open/tts/products/query` — 参数 `{ creatorUserOpenId, productType, pageSize, pageToken? }`

**分页机制：** 使用 Base64 编码的游标，结构为 `{ shopToken, showcaseToken }`。建议同时查询两种 `productType` 并按 `id` 去重合并。

**图片格式特殊处理：** 商品图片返回格式为 `{height=200, url=https://xxx.jpg, width=200}`，需正则提取：
```typescript
const match = imageStr.match(/url=([^,}]+)/)
const url = match?.[1] ?? ''
```

## 错误处理最佳实践

使用 BEERVID API 时推荐以下错误处理策略：

| 策略 | 场景 | 做法 |
|------|------|------|
| 参数校验前置 | 所有 API 调用前 | 缺少必填项立即返回错误，不发起请求 |
| 权限检查 | 需要特定授权的操作 | 调用前校验账号类型和授权状态 |
| 统一异常捕获 | API 调用层 | 捕获 Open API 错误并转为业务友好的错误信息 |
| 部分成功处理 | API 成功但本地持久化失败 | 返回成功但标记 `dbSaved: false` |
| 单条隔离 | 批量/定时任务 | 单条失败不中断整体流程 |
| 静默异步 | 次要操作（如头像同步） | 失败不阻塞主流程 |
| 队列重试 | 异步消费者 | 限制最大重试次数（建议 3 次），设定重试间隔 |

## 关键参数来源说明

各接口间通过参数串联，理解每个参数的产出来源是正确集成的前提：

| 参数 | 含义 | 产出来源 |
|------|------|---------|
| `businessId` | TT 账号业务 ID | OAuth 授权回调直接返回（回调参数 `ttAbId`），持久化后作为所有 TT 操作的入参 |
| `creatorUserOpenId` | TTS 账号 OpenId | OAuth 授权回调直接返回（回调参数 `ttsAbId`），持久化后作为所有 TTS 操作的入参 |
| `accountId` | 平台账号 ID | 即 `ttAbId` 或 `ttsAbId`，传入 `account/info` 接口获取账号详情 |
| `uploadToken` | 上传凭证 | 调用 `POST /api/v1/open/upload-token/generate` 返回 |
| `fileUrl` | 上传后的视频 URL | 普通上传 `POST /api/v1/open/file-upload` 返回 |
| `videoFileId` / `fileId` | TTS 视频文件 ID | TTS 上传 `POST /api/v1/open/file-upload/tts-video` 返回 |
| `shareId` | 普通发布追踪 ID | 普通发布 `POST /api/v1/open/tiktok/video/publish` 返回，用于轮询发布状态 |
| `videoId` | TikTok 视频 ID | 挂车发布直接返回；普通发布从状态轮询结果的 `post_ids[0]` 中获取 |
| `productId` | 商品 ID | 查询商品 `POST /api/v1/open/tts/products/query` 返回的商品列表中的 `id` 字段 |
| `productTitle` | 商品标题 | 同上，商品列表中的 `title` 字段（最多 29 字符） |
| `itemIds` | 视频 ID 数组 | 来自 `videoId`，用于查询视频统计数据 |

**参数传递链路图：**

```
OAuth 回调
  ├─ ttAbId  → businessId ──────────→ publish → shareId → poll-status → post_ids[0] → videoId → query
  └─ ttsAbId → creatorUserOpenId ──→ upload/tts-video → fileId ──→ shoppable/publish → videoId
                    └──→ products/query → productId + productTitle ──→ shoppable/publish
```

## 完整业务流程参考

### 普通视频发布（TT）

**前置条件：** 需要 `businessId`。如已持久化则直接使用，否则先完成授权流程获取。

```
[无 businessId 时] 授权获取 businessId：
  1. 获取 OAuth URL    GET /api/v1/open/thirdparty-auth/tt-url
  2. 用户跳转授权      回调返回 ttAbId → 即 businessId
  3. 获取账号详情      POST /api/v1/open/account/info → 持久化账号信息

[有 businessId 后] 发布流程：
  1. 获取上传凭证      POST /api/v1/open/upload-token/generate
  2. 上传视频文件      POST /api/v1/open/file-upload（返回 fileUrl）
  3. 发布视频          POST /api/v1/open/tiktok/video/publish（返回 shareId）
  4. 轮询发布状态      POST /api/v1/open/tiktok/video/status（直到 PUBLISH_COMPLETE）
  5. 拉取视频数据      POST /api/v1/open/tiktok/video/query（获取播放量等）
```

### 挂车视频发布（TTS）

**前置条件：** 需要 `creatorUserOpenId`。如已持久化则直接使用，否则先完成授权流程获取。

```
[无 creatorUserOpenId 时] 授权获取 creatorUserOpenId：
  1. 获取 OAuth URL    GET /api/v1/open/thirdparty-auth/tts-url
  2. 用户跳转授权      回调返回 ttsAbId → 即 creatorUserOpenId
  3. 获取账号详情      POST /api/v1/open/account/info → 持久化账号信息

[有 creatorUserOpenId 后] 发布流程：
  1. 查询商品列表      POST /api/v1/open/tts/products/query（用户选择商品）
  2. 获取上传凭证      POST /api/v1/open/upload-token/generate
  3. 上传视频文件      POST /api/v1/open/file-upload/tts-video（返回 videoFileId）
  4. 发布挂车视频      POST /api/v1/open/tts/shoppable-video/publish（立即完成）
```

详细的请求/响应示例见 → `references/api-reference.md`

## CLI 命令

推荐使用已安装的 `beervid` 命令。仓库中的 `scripts/` 目录仅作为 legacy 参考保留，不随 npm 包发布。

**前置条件：** 设置环境变量后即可使用：
```bash
export BEERVID_APP_KEY="your-api-key"
export BEERVID_APP_BASE_URL="https://open.beervid.ai"  # 可选，有默认值
```

### 命令一览

| 命令 | 功能 | 核心参数 |
|------|------|---------|
| `beervid get-oauth-url` | 获取 OAuth 授权链接 | `--type tt\|tts` |
| `beervid get-account-info` | 查询账号信息 | `--type TT\|TTS --account-id <id>` |
| `beervid upload` | 上传视频（支持本地文件和 URL） | `--file <路径或URL> [--type tts --creator-id <id>]` |
| `beervid publish` | 发布视频（普通/挂车） | `--type normal\|shoppable` + 对应参数 |
| `beervid poll-status` | 轮询发布状态 | `--business-id <id> --share-id <id>` |
| `beervid query-video` | 查询视频数据 | `--business-id <id> --item-ids <id1,id2>` |
| `beervid query-products` | 查询 TTS 商品 | `--creator-id <id>` |

### 使用示例

#### 获取授权链接
```bash
beervid get-oauth-url --type tt
beervid get-oauth-url --type tts
```

#### 查询账号信息
```bash
beervid get-account-info --type TT --account-id 7281234567890
```

#### 上传视频
```bash
# 本地文件上传
beervid upload --file ./my-video.mp4

# 远程 URL 上传（自动下载后上传）
beervid upload --file https://example.com/video.mp4

# TTS 挂车上传
beervid upload --file ./video.mp4 --type tts --creator-id open_user_abc

# 使用已有的上传凭证（跳过自动获取）
beervid upload --file ./video.mp4 --token upt.xxx
```

#### 发布视频
```bash
# 普通发布
beervid publish --type normal \
  --business-id biz_12345 \
  --video-url https://cdn.beervid.ai/uploads/xxx.mp4 \
  --caption "Amazing video! #viral"

# 挂车发布
beervid publish --type shoppable \
  --creator-id open_user_abc \
  --file-id vf_abc123 \
  --product-id prod_789 \
  --product-title "Premium Widget" \
  --caption "Product review"
```

#### 轮询发布状态
```bash
# 默认每 3 秒轮询一次，最多 60 次
beervid poll-status --business-id biz_12345 --share-id share_abc123

# 自定义间隔和次数
beervid poll-status --business-id biz_12345 --share-id share_abc123 --interval 5 --max-polls 30
```

#### 查询视频数据
```bash
# 单个视频
beervid query-video --business-id biz_12345 --item-ids 7123456789012345678

# 多个视频
beervid query-video --business-id biz_12345 --item-ids 7123456789012345678,7123456789012345679
```

#### 查询商品列表
```bash
# 全部商品（shop + showcase 合并去重）
beervid query-products --creator-id open_user_abc

# 仅店铺商品
beervid query-products --creator-id open_user_abc --product-type shop

# 分页查询
beervid query-products --creator-id open_user_abc --cursor eyJ...
```

### 仓库源码中的 legacy 脚本

如果你是在仓库源码中做二次开发，legacy 脚本仍可复用 `scripts/api-client.mjs`：
- `openApiGet/Post/Upload` — 统一认证和错误处理的请求函数
- `resolveFileInput(input)` — 自动判断 URL 或本地路径，统一转为 File 对象
- `parseArgs / requireArgs` — 命令行参数解析和校验
- `printResult` — JSON 格式化输出

在自定义脚本中可直接引用：
```javascript
import { openApiPost, resolveFileInput, parseArgs } from './api-client.mjs'
```

### 完整业务流程示例（CLI 串联）

**普通视频从上传到数据查询：**
```bash
# 1. 上传视频
beervid upload --file ./video.mp4
# 输出: { "fileUrl": "https://cdn.beervid.ai/uploads/xxx.mp4", ... }

# 2. 发布视频
beervid publish --type normal --business-id biz_123 --video-url https://cdn.beervid.ai/uploads/xxx.mp4 --caption "My video"
# 输出: { "shareId": "share_abc", ... }

# 3. 轮询状态直到完成
beervid poll-status --business-id biz_123 --share-id share_abc
# 输出: 视频 ID: 7123456789012345678

# 4. 查询数据
beervid query-video --business-id biz_123 --item-ids 7123456789012345678
```
