---
name: beervid-app-cli
description: >
  BEERVID 第三方应用 Open API 集成开发指南。本 skill 专用于 BEERVID 面向第三方应用开放的 API（需 BEERVID_APP_KEY 认证），
  不同于 BEERVID 自身应用内部的 API。当用户需要以第三方应用身份调用 BEERVID 平台接口、开发 TikTok 视频发布/上传/数据统计功能、
  处理 TT/TTS 账号授权绑定、查询商品列表、或涉及 openApiGet/openApiPost/openApiUpload 相关代码时，使用此 skill。
  包括：账号 OAuth 授权、视频上传与发布（普通/挂车）、发布状态轮询、视频数据查询、TTS 商品查询等完整业务流程。
  当用户在 BEERVID 项目上下文中提到"发布视频"、"绑定账号"、"查询视频数据"、"挂车发布"、"BEERVID 第三方应用"、"BEERVID_APP_KEY"等关键词时，应触发此 skill。
---

# BEERVID 第三方应用 Open API 集成指南

本 skill 是 **BEERVID 第三方应用 Open API** 的入口导航，重点提供：

- 何时使用这套 API
- TT 与 TTS 两条业务流如何判断
- 关键参数如何在各接口之间传递
- 该去哪里找详细接口、接入文档、示例工程和 CLI 实现

不要把这里当成完整 API 手册。详细请求/响应、字段示例、错误码和长示例统一下沉到引用文档，按需读取。

## 适用范围

如果问题满足以下任一条件，就应使用本 skill：

- 请求路径是 `/api/v1/open/` 前缀
- 认证依赖 `BEERVID_APP_KEY` 或请求头 `X-API-KEY`
- 需求涉及第三方应用身份的 TikTok 授权、上传、发布、查询
- 代码里出现 `openApiGet`、`openApiPost`、`openApiUpload`
- 需求涉及 TT 普通视频发布或 TTS 挂车视频发布

以下内容 **不属于** 本 skill：

- BEERVID 自身产品内部 API
- 与第三方开放平台无关的业务接口
- 认证方式不是 `BEERVID_APP_KEY` 的接口体系

## 最小背景

### 环境变量

| 变量                   | 用途                                                    |
| ---------------------- | ------------------------------------------------------- |
| `BEERVID_APP_KEY`      | Open API 密钥，请求头使用 `X-API-KEY`                   |
| `BEERVID_APP_BASE_URL` | Open API 基础地址，默认通常为 `https://open.beervid.ai` |

### 认证方式

| 场景          | 请求头           | 值                               |
| ------------- | ---------------- | -------------------------------- |
| 常规 API 调用 | `X-API-KEY`      | `BEERVID_APP_KEY`                |
| 视频上传      | `X-UPLOAD-TOKEN` | 上传凭证接口返回的 `uploadToken` |

### 统一响应格式

所有端点都返回统一信封：

```ts
interface OpenApiResponse<T> {
  code: number;
  message: string;
  data: T;
  error: boolean;
  success: boolean;
}
```

失败判定统一按 `code !== 0 || !success` 处理即可。

## 先判断你在哪条业务流

### TT 普通账号

- `accountType: 'TT'`
- 用于普通视频发布
- 可查询视频数据
- 发布后通常需要轮询状态

### TTS Shop 账号

- `accountType: 'TTS'`
- 用于挂车视频发布和商品查询
- 发布挂车视频时依赖商品信息
- 发布后通常立即完成，不走 TT 的轮询链路

## 六类核心能力

只保留能力定位，详细接口说明去看引用文档：

| 能力         | 作用                                          | 详细资料                                                                                                                   |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 账号授权     | 获取 TT/TTS OAuth URL、回调绑定、拉取账号详情 | [`references/api-reference.md`](./references/api-reference.md), [`docs/oauth-callback.md`](./docs/oauth-callback.md)       |
| 视频上传     | 先换上传凭证，再直传文件                      | [`references/api-reference.md`](./references/api-reference.md)                                                             |
| 视频发布     | TT 普通发布或 TTS 挂车发布                    | [`references/api-reference.md`](./references/api-reference.md)                                                             |
| 状态轮询     | 仅 TT 普通发布需要轮询                        | [`references/api-reference.md`](./references/api-reference.md), [`docs/tt-poll-task.md`](./docs/tt-poll-task.md)           |
| 视频数据查询 | 查询播放、点赞、评论、分享等统计              | [`references/api-reference.md`](./references/api-reference.md)                                                             |
| 商品查询     | 为 TTS 挂车发布提供商品列表                   | [`references/api-reference.md`](./references/api-reference.md), [`docs/tts-product-cache.md`](./docs/tts-product-cache.md) |

## 核心流程速记

### TT 普通视频发布

```text
获取 TT OAuth URL
  -> 用户授权回调得到 ttAbId
  -> ttAbId 作为 businessId 持久化
  -> 获取上传凭证
  -> 上传普通视频，拿到 fileUrl
  -> 发布普通视频，拿到 shareId
  -> 轮询发布状态，直到 status = PUBLISH_COMPLETE 且 post_ids 非空
  -> 从 post_ids[0] 得到 videoId
  -> 查询视频数据
```

### TTS 挂车视频发布

```text
获取 TTS OAuth URL
  -> 用户授权回调得到 ttsAbId
  -> ttsAbId 作为 creatorUserOpenId 持久化
  -> 查询商品，得到 productId + productTitle
  -> 获取上传凭证
  -> 上传 TTS 视频，拿到 videoFileId/fileId
  -> 发布挂车视频
```

## 关键参数链路

这是主文件里最值得保留的部分，因为它决定了接口如何串起来：

| 参数                     | 含义                 | 产出来源                                           |
| ------------------------ | -------------------- | -------------------------------------------------- |
| `businessId`             | TT 账号业务 ID       | OAuth 回调参数 `ttAbId`                            |
| `creatorUserOpenId`      | TTS 账号 OpenId      | OAuth 回调参数 `ttsAbId`                           |
| `accountId`              | 平台账号 ID          | 即 `ttAbId` 或 `ttsAbId`，用于查询账号详情         |
| `uploadToken`            | 上传凭证             | `upload-token/generate` 返回                       |
| `fileUrl`                | 普通上传后的视频 URL | `file-upload` 返回                                 |
| `videoFileId` / `fileId` | TTS 视频文件 ID      | `file-upload/tts-video` 返回                       |
| `shareId`                | TT 普通发布追踪 ID   | `tiktok/video/publish` 返回                        |
| `videoId`                | TikTok 视频 ID       | TTS 发布直接返回；TT 从状态查询 `post_ids[0]` 获取 |
| `productId`              | 商品 ID              | `tts/products/query` 返回的商品列表                |
| `productTitle`           | 商品标题             | 同上，最多 29 字符，超出应先截断                   |
| `itemIds`                | 视频 ID 数组         | 来源于 `videoId`，用于查询视频数据                 |

```text
TT:
ttAbId -> businessId -> publish -> shareId
      -> poll-status (只有 status = PUBLISH_COMPLETE 且 post_ids 非空才算完成)
      -> post_ids[0] -> videoId -> query-video

TTS:
ttsAbId -> creatorUserOpenId -> query-products -> productId/productTitle
creatorUserOpenId -> upload-tts-video -> fileId -> shoppable-publish -> videoId
```

## 实现时优先遵循的约束

### API 封装

建议统一封装三个基础请求函数：

- `openApiGet`
- `openApiPost`
- `openApiUpload`

这三个函数应共享：

- 基础地址拼接
- `X-API-KEY` 注入
- 统一响应解包
- 错误抛出格式

### 常见业务约束

- TT 普通视频发布后需要轮询；只有 `PUBLISH_COMPLETE` 且 `post_ids` 非空才算成功完成；TTS 挂车视频通常不需要
- 仅 TT 授权账号可查询视频数据
- `productTitle` 最多 29 字符，超出时应提前截断
- 商品图片字段可能是特殊字符串格式，解析细节见 [`docs/tts-product-cache.md`](./docs/tts-product-cache.md)
- 视频查询接口可能同时返回 camelCase 与 snake_case 字段，兼容细节见 [`references/api-reference.md`](./references/api-reference.md)

### 上传侧建议

- 上传前先换取 `uploadToken`
- 上传请求头使用 `X-UPLOAD-TOKEN`
- 如需上传进度与取消能力，优先用 XHR 而非裸 `fetch`

## CLI 工具

本 Skill 配套提供 `beervid` CLI；可直接在终端调用所有 Open API 能力。如需使用 CLI，请先安装：

```bash
npm install -g beervid-app-cli
```

### CLI 前置

```bash
beervid config --app-key "your-api-key"
export BEERVID_APP_BASE_URL="https://open.beervid.ai"
```

### CLI 命令一览

| 命令                       | 功能                  | 常用参数                                                                     |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `beervid config`           | 设置或查看全局配置    | `--app-key`, `--base-url`, `--show`                                          |
| `beervid get-oauth-url`    | 获取 OAuth 授权链接   | `--type tt                                                                   | tts`                      |
| `beervid get-account-info` | 查询账号信息          | `--type TT                                                                   | TTS`, `--account-id`      |
| `beervid upload`           | 上传视频              | `--file`, `--type tts`, `--creator-id`, `--token`                            |
| `beervid publish`          | 发布普通或挂车视频    | `--type normal                                                               | shoppable` 加对应业务参数 |
| `beervid poll-status`      | 轮询 TT 发布状态      | `--business-id`, `--share-id`, `--interval`, `--max-polls`                   |
| `beervid query-video`      | 查询视频数据          | `--business-id`, `--item-ids`                                                |
| `beervid query-products`   | 查询 TTS 商品         | `--creator-id`, `--product-type`, `--cursor`                                 |
| `beervid publish-tt-flow`  | 执行 TT 完整发布流程  | `--business-id`, `--file`, `--caption`                                       |
| `beervid publish-tts-flow` | 执行 TTS 完整发布流程 | `--creator-id`, `--file`, `--interactive`, `--product-id`, `--product-title` |

### 使用示例

最常用的最小示例如下：

```bash
# 设置 APP Key
beervid config --app-key "your-api-key"

# 获取授权链接
beervid get-oauth-url --type tt
beervid get-oauth-url --type tts

# 查询账号信息
beervid get-account-info --type TT --account-id 7281234567890

# 上传普通视频（--file 同时支持本地文件路径和 URL 地址）
beervid upload --file ./video.mp4
beervid upload --file https://example.com/video.mp4

# 上传 TTS 视频（--file 同时支持本地文件路径和 URL 地址）
beervid upload --file ./video.mp4 --type tts --creator-id=open_user_abc

# 普通发布（--video-url 需要传可访问的视频 URL）
beervid publish --type normal --business-id=biz_12345 --video-url https://cdn.beervid.ai/uploads/xxx.mp4 --caption "My video"

# 挂车发布
beervid publish --type shoppable --creator-id=open_user_abc --file-id vf_abc123 --product-id prod_789 --product-title "Premium Widget" --caption "Product review"

# 轮询状态
beervid poll-status --business-id=biz_12345 --share-id share_abc123

# 查询视频数据
beervid query-video --business-id=biz_12345 --item-ids 7123456789012345678

# 查询商品
beervid query-products --creator-id=open_user_abc

# TT 一键完整流程（--file 同时支持本地文件路径和 URL 地址）
beervid publish-tt-flow --business-id=biz_12345 --file ./video.mp4 --caption "My video"
beervid publish-tt-flow --business-id=biz_12345 --file https://example.com/video.mp4 --caption "My video"

# TTS 一键完整流程（--file 同时支持本地文件路径和 URL 地址）
beervid publish-tts-flow --creator-id=open_user_abc --file ./video.mp4
beervid publish-tts-flow --creator-id=open_user_abc --file https://example.com/video.mp4
```

### CLI 特别注意

当参数值本身以 `-` 开头时，必须写成 `--option=value`，否则 CLI 会把值误判为新的选项。

## 读哪份文档

### 接口细节

当你需要以下内容时，直接读取 [`references/api-reference.md`](./references/api-reference.md)：

- 具体端点路径
- 请求参数
- 响应字段
- 错误码
- 新旧字段兼容方式

### 接入设计

按场景读取：

- OAuth 回调与 State Token：[`docs/oauth-callback.md`](./docs/oauth-callback.md)
- 数据表设计：[`docs/database-schema.md`](./docs/database-schema.md)
- TT 轮询任务：[`docs/tt-poll-task.md`](./docs/tt-poll-task.md)
- TTS 商品缓存：[`docs/tts-product-cache.md`](./docs/tts-product-cache.md)
- 重试与幂等：[`docs/retry-and-idempotency.md`](./docs/retry-and-idempotency.md)

### 示例工程

当用户需要“可运行参考实现”时，按技术栈读取：

- 纯脚本示例：[`example/standard/README.md`](./example/standard/README.md)
- Express 示例：[`example/express/README.md`](./example/express/README.md)
- Next.js API Route 示例：[`example/nextjs/README.md`](./example/nextjs/README.md)

## 推荐工作方式

处理相关需求时，优先按这个顺序行动：

1. 先判断是 TT 还是 TTS，是 API 集成还是 CLI 使用。
2. 再确认当前缺的是哪一段链路：授权、上传、发布、轮询、查询、商品。
3. 主流程和参数链路在本文件中快速定位。
4. 需要具体字段、示例或错误码时，再读取对应 `references/` 或 `docs/`。
5. 需要代码落地时，优先复用现有 `src/commands/`、`src/client/`、`src/workflows/` 和 `example/`。

## 不要在主文件重复维护的内容

以下内容不应继续扩写回 `SKILL.md`，避免再次膨胀：

- 单个端点的完整请求/响应示例
- CLI 的长命令样例清单
- 各种错误码详表
- 数据库字段大表
- OAuth 安全细节展开说明
- 轮询/缓存/重试的长篇策略说明

这些内容已经分别存在于 `references/`、`docs/`、`example/` 中，应按需引用，不要复制。
