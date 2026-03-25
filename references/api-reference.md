# BEERVID 第三方应用 Open API — 请求/响应参考

> 本文档包含 BEERVID 面向第三方应用开放的所有端点的详细请求参数、响应结构和错误码示例。
> API 路径统一前缀：`/api/v1/open/`，认证方式：`X-API-KEY` 请求头。

## 目录

1. [账号授权](#1-账号授权)
2. [视频上传](#2-视频上传)
3. [视频发布](#3-视频发布)
4. [发布状态查询](#4-发布状态查询)
5. [视频数据查询](#5-视频数据查询)
6. [TTS 商品查询](#6-tts-商品查询)
7. [错误码速查表](#7-错误码速查表)

---

## 1. 账号授权

### GET /api/v1/open/thirdparty-auth/tt-url

获取 TikTok 普通账号 OAuth 授权链接。

**请求：** 无参数

**响应：**
```json
{
  "code": 0,
  "success": true,
  "message": "ok",
  "data": "https://www.tiktok.com/v2/auth/authorize?client_key=..."
}
```

**调用示例：**
```typescript
const { data: url } = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
// url = "https://www.tiktok.com/v2/auth/authorize?client_key=..."
```

---

### GET /api/v1/open/thirdparty-auth/tts-url

获取 TikTok Shop 账号 OAuth 授权链接（跨境）。

**请求：** 无参数

**响应：**
```json
{
  "code": 0,
  "success": true,
  "message": "ok",
  "data": {
    "crossBorderUrl": "https://services.tiktokshop.com/open/authorize?..."
  }
}
```

**调用示例：**
```typescript
const { data } = await openApiGet<{ crossBorderUrl: string }>('/api/v1/open/thirdparty-auth/tts-url')
const url = data.crossBorderUrl
```

---

### POST /api/v1/open/account/info

查询已授权账号的详细信息。

**请求：**
```json
{
  "accountType": "TT",
  "accountId": "7281234567890"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `accountType` | `'TT' \| 'TTS'` | 是 | 账号类型 |
| `accountId` | `string` | 是 | 平台返回的账号 ID |

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "accountType": "TT",
    "accountId": "7281234567890",
    "username": "creator_name",
    "displayName": "Creator Display Name",
    "sellerName": "",
    "profileUrl": "https://p16-sign.tiktokcdn.com/...",
    "followersCount": 15000,
    "accessToken": "act.xxx...",
    "ext": {}
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `accountType` | `string` | 账号类型 |
| `accountId` | `string` | 账号 ID |
| `username` | `string` | 用户名 |
| `displayName` | `string` | 显示名称 |
| `sellerName` | `string` | 卖家名称（TTS 账号） |
| `profileUrl` | `string` | 头像 URL |
| `followersCount` | `number` | 粉丝数 |
| `accessToken` | `string` | 访问令牌 |
| `ext` | `Record<string, unknown>` | 扩展字段 |

**调用示例：**
```typescript
const { data: accountInfo } = await openApiPost<AccountInfo>(
  '/api/v1/open/account/info',
  { accountType: 'TT', accountId: '7281234567890' }
)
```

---

## 2. 视频上传

### POST /api/v1/open/upload-token/generate

生成视频上传凭证。

**请求：** 无 body

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "uploadToken": "upt.xxx...",
    "expiresIn": 1800,
    "message": ""
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `uploadToken` | `string` | 上传凭证 |
| `expiresIn` | `number` | 过期时间（秒） |

---

### POST /api/v1/open/file-upload

上传普通视频文件（TT 账号使用）。

**请求：** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | `File` | 是 | 视频文件 |

**请求头：** `X-UPLOAD-TOKEN`（值为上传凭证接口返回的 `uploadToken`）

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "fileUrl": "https://cdn.beervid.ai/uploads/xxx.mp4",
    "fileName": "video.mp4",
    "fileSize": 15728640,
    "contentType": "video/mp4"
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `fileUrl` | `string` | 上传后的视频 URL，用于后续发布 |
| `fileName` | `string` | 文件名 |
| `fileSize` | `number` | 文件大小（字节） |
| `contentType` | `string` | MIME 类型 |

---

### POST /api/v1/open/file-upload/tts-video

上传挂车视频文件（TTS 账号使用）。

**请求：** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | `File` | 是 | 视频文件 |

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `creatorUserOpenId` | `string` | 是 | TTS 账号的 OpenId |

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "videoFileId": "vf_abc123def456",
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "uploadType": "tts"
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `videoFileId` | `string` | 视频文件 ID，用于后续挂车发布 |
| `md5` | `string` | 文件 MD5 |
| `uploadType` | `string` | 上传类型标识 |

**注意：** 普通上传返回 `fileUrl`，TTS 上传返回 `videoFileId`，两者用于不同的发布端点。

---

## 3. 视频发布

### POST /api/v1/open/tiktok/video/publish

发布普通 TikTok 视频。

**请求：**
```json
{
  "businessId": "biz_12345",
  "videoUrl": "https://cdn.beervid.ai/uploads/xxx.mp4",
  "caption": "Check out this amazing video! #viral"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `businessId` | `string` | 是 | TT 账号的 businessId |
| `videoUrl` | `string` | 是 | 上传后获得的视频 URL |
| `caption` | `string` | 否 | 视频描述/文案 |

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "shareId": "share_abc123",
    "status": "PROCESSING_DOWNLOAD",
    "message": ""
  }
}
```

**后续：** 使用返回的 `shareId` 轮询 `/api/v1/open/tiktok/video/status` 获取发布进度。

---

### POST /api/v1/open/tts/shoppable-video/publish

发布挂车视频（TTS 账号，带商品链接）。

**请求：**
```json
{
  "creatorUserOpenId": "open_user_abc",
  "fileId": "vf_abc123def456",
  "title": "Amazing product review",
  "productId": "prod_789",
  "productTitle": "Premium Widget Pro"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `creatorUserOpenId` | `string` | 是 | TTS 账号 OpenId |
| `fileId` | `string` | 是 | 上传返回的 `videoFileId` |
| `title` | `string` | 否 | 视频标题 |
| `productId` | `string` | 是 | 商品 ID |
| `productTitle` | `string` | 是 | 商品标题（**最多 29 字符**，超出应截断） |

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "videoId": "vid_xyz789",
    "status": "PUBLISH_COMPLETE",
    "message": ""
  }
}
```

**注意：** 挂车视频发布后立即完成（`PUBLISH_COMPLETE`），无需轮询状态。

---

## 4. 发布状态查询

### POST /api/v1/open/tiktok/video/status

查询普通视频的发布进度（仅 TT 普通视频需要，TTS 挂车视频无需轮询）。

**请求：**
```json
{
  "businessId": "biz_12345",
  "shareId": "share_abc123"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `businessId` | `string` | 是 | TT 账号的 businessId |
| `shareId` | `string` | 是 | 发布时返回的 shareId |

**响应 — 处理中：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "status": "PROCESSING_DOWNLOAD"
  }
}
```

**响应 — 发布成功：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "status": "PUBLISH_COMPLETE",
    "post_ids": ["7123456789012345678"]
  }
}
```

**响应 — 发布失败：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "status": "FAILED",
    "reason": "Video format not supported"
  }
}
```

**状态值说明：**

| 状态 | 含义 | 是否终态 |
|------|------|---------|
| `PROCESSING_DOWNLOAD` | 视频处理中 | 否，继续轮询 |
| `PUBLISH_COMPLETE` | 发布成功 | 是 |
| `FAILED` | 发布失败 | 是 |

**成功后：** `post_ids[0]` 即为 TikTok 上的视频 ID，可用于后续数据查询。

---

## 5. 视频数据查询

### POST /api/v1/open/tiktok/video/query

批量查询视频统计数据（播放量、点赞、评论、分享等）。

**请求：**
```json
{
  "businessId": "biz_12345",
  "itemIds": ["7123456789012345678", "7123456789012345679"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `businessId` | `string` | 是 | TT 账号的 businessId |
| `itemIds` | `string[]` | 是 | 视频 ID 数组 |

**响应（新版格式 — camelCase）：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "videoList": [
      {
        "itemId": "7123456789012345678",
        "thumbnailUrl": "https://p16-sign.tiktokcdn.com/...",
        "shareUrl": "https://www.tiktok.com/@user/video/...",
        "videoViews": 52300,
        "likes": 1200,
        "comments": 89,
        "shares": 45
      }
    ]
  }
}
```

**响应（旧版格式 — snake_case）：**
```json
{
  "code": 0,
  "success": true,
  "data": {
    "videos": [
      {
        "item_id": "7123456789012345678",
        "thumbnail_url": "https://...",
        "share_url": "https://...",
        "video_views": 52300,
        "likes": 1200,
        "comments": 89,
        "shares": 45
      }
    ]
  }
}
```

**字段对照表：**

| 数据项 | 新版字段 | 旧版字段 | 类型 |
|--------|---------|---------|------|
| 视频列表 | `videoList` | `videos` | `array` |
| 视频 ID | `itemId` | `item_id` | `string` |
| 缩略图 | `thumbnailUrl` | `thumbnail_url` | `string` |
| 分享链接 | `shareUrl` | `share_url` | `string` |
| 播放量 | `videoViews` | `video_views` | `number` |
| 点赞数 | `likes` | `likes` | `number` |
| 评论数 | `comments` | `comments` | `number` |
| 分享数 | `shares` | `shares` | `number` |

**兼容写法示例：**
```typescript
const list = data.videoList ?? data.videos ?? []
const video = list[0]
if (video) {
  const itemId = video.itemId ?? video.item_id
  const views = video.videoViews ?? video.video_views ?? 0
  const thumbnailUrl = video.thumbnailUrl ?? video.thumbnail_url
  const shareUrl = video.shareUrl ?? video.share_url
}
```

**约束：** 仅拥有 TT 授权的账号才可查询视频数据。TTS-only 账号无此能力。

---

## 6. TTS 商品查询

### POST /api/v1/open/tts/products/query

查询创作者的店铺/橱窗商品列表，用于挂车发布时选择商品。

**请求：**
```json
{
  "creatorUserOpenId": "open_user_abc",
  "productType": "shop",
  "pageSize": 20,
  "pageToken": ""
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `creatorUserOpenId` | `string` | 是 | TTS 账号 OpenId |
| `productType` | `'shop' \| 'showcase'` | 是 | 商品来源类型 |
| `pageSize` | `number` | 是 | 每页数量（建议 20） |
| `pageToken` | `string` | 否 | 分页游标（首页留空） |

**响应：**
```json
{
  "code": 0,
  "success": true,
  "data": [
    {
      "productType": "shop",
      "products": [
        {
          "id": "prod_123",
          "title": "Premium Widget Pro",
          "price": { "amount": "29.99", "currency": "USD" },
          "images": ["{height=200, url=https://img.tiktokcdn.com/xxx.jpg, width=200}"],
          "addedStatus": "ADDED",
          "reviewStatus": "APPROVED",
          "inventoryStatus": "IN_STOCK",
          "brandName": "WidgetCo",
          "shopName": "Widget Store",
          "salesCount": 1500,
          "source": "shop"
        }
      ],
      "totalCount": 45,
      "nextPageToken": "eyJ..."
    }
  ]
}
```

**商品字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 商品 ID，发布时传入 `productId` |
| `title` | `string` | 商品标题，发布时传入 `productTitle`（注意 29 字符限制） |
| `price` | `object` | 价格信息 |
| `images` | `string[]` | 商品图片（特殊格式，需解析） |
| `addedStatus` | `string` | 添加状态 |
| `reviewStatus` | `string` | 审核状态 |
| `inventoryStatus` | `string` | 库存状态 |
| `salesCount` | `number` | 销量 |
| `nextPageToken` | `string \| null` | 下一页游标（`null` 表示最后一页） |

**图片 URL 提取：**

商品图片返回特殊格式，需正则解析：
```typescript
// 原始格式: "{height=200, url=https://img.tiktokcdn.com/xxx.jpg, width=200}"
function extractImageUrl(imageStr: string): string {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? ''
}
```

**分页游标处理：**

建议同时查询 `shop` 和 `showcase` 两种类型，使用复合游标管理分页状态：
```typescript
// 编码游标
function encodeCursor(shopToken?: string, showcaseToken?: string): string {
  return btoa(JSON.stringify({ shopToken: shopToken ?? '', showcaseToken: showcaseToken ?? '' }))
}

// 解码游标
function decodeCursor(cursor: string): { shopToken: string; showcaseToken: string } {
  return JSON.parse(atob(cursor))
}
```

**去重合并：** 同一商品可能同时出现在 shop 和 showcase 中，应按 `id` 去重。

---

## 7. 错误码速查表

### Open API 层

所有端点共用的响应 `code` 字段：

| code | 含义 | 处理方式 |
|------|------|---------|
| `0` | 成功 | 正常处理 `data` 字段 |
| 非零 | 业务错误 | 读取 `message` 获取错误详情 |

### 常见业务错误场景

| 场景 | 建议 HTTP 状态码 | 建议 code | 示例 message |
|------|-----------------|-----------|-------------|
| 缺少必填参数 | 400 | 400 | `"accountId 为必填项"` |
| 参数值非法 | 400 | 400 | `"publishType 非法"` |
| 账号未授权 | 403 | 403 | `"该账号未授权普通视频发布"` |
| OAuth 授权过期 | 403 | 403 | `"授权已过期或无效，请重新授权"` |
| State Token 用户不匹配 | 403 | 403 | `"授权用户不匹配，请重新登录后授权"` |
| 资源不存在 | 404 | 404 | `"TikTok 账号不存在"` |
| Open API 调用失败 | 500 | 500 | `"Open API 错误 [/api/v1/open/xxx]: Bad request (code: 40001)"` |
| 上传凭证获取失败 | 500 | 500 | `"获取上传凭证失败"` |
| API 成功但本地存储失败 | 200 | 200 | `"视频已提交至 TikTok，但本地记录保存失败"`（附 `dbSaved: false`） |

### 客户端上传错误

| 错误消息 | 原因 | 处理建议 |
|---------|------|---------|
| `上传失败，响应解析失败` | 服务端返回非 JSON 内容 | 检查上传 URL 和凭证是否正确 |
| `上传失败，状态码: {status}` | HTTP 非 2xx | 检查认证头和文件格式 |
| `上传失败` | API 返回 `code !== 0` | 查看 `message` 获取具体原因 |
| `上传成功但未返回可用结果` | 响应中既无 `fileUrl` 也无 `videoFileId` | API 异常，需排查 |
| `上传失败，网络错误` | 网络连接中断 | 提示用户检查网络后重试 |
| `Upload aborted` | 用户取消或页面卸载 | 正常行为，无需处理 |

### 队列重试建议

| 参数 | 建议值 | 说明 |
|------|--------|------|
| 最大重试次数 | 3 | 超过后停止重试并记录日志 |
| 重试间隔 | 2 秒 | 固定间隔或指数退避均可 |
| 超限处理 | acknowledge | 防止消息无限重投 |
