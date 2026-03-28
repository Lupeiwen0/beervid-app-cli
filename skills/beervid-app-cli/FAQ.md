# 常见问题（FAQ）

本文档只保留 BEERVID Open API 接入中的高频误区和补充说明；首次接入请先看 [QUICKSTART.md](./QUICKSTART.md)。

## 目录

1. [基础概念](#基础概念)
2. [账号授权](#账号授权)
3. [视频上传](#视频上传)
4. [视频发布](#视频发布)
5. [数据查询](#数据查询)
6. [CLI 使用](#cli-使用)

---

## 基础概念

### Q: TT 和 TTS 有什么区别？

**A:**
- **TT**：普通 TikTok 账号，用于普通视频发布，也支持视频数据查询
- **TTS**：TikTok Shop 跨境账号，用于挂车视频发布，不支持视频数据查询

### Q: businessId 和 creatorUserOpenId 有什么区别？

**A:**
- `businessId`：TT 账号的业务 ID，来自 OAuth 回调里的 `ttAbId`
- `creatorUserOpenId`：TTS 账号的 OpenId，来自 OAuth 回调里的 `ttsAbId`

它们都是后续 API 的核心入参，但分别服务于不同账号体系。

### Q: 同一个达人既要做 TTS 挂车发布，又要查视频数据，应该怎么授权？

**A:**
- 需要分别完成两次授权：一次 TTS，一次 TT
- TTS 授权用于挂车发布、商品查询
- TT 授权用于视频数据查询
- 不能只授权 TTS 就去查视频数据

### Q: TT 和 TTS 账号怎么建立关联？

**A:**
- 官方当前没有提供 `uno_id` 这类可直接关联 TT/TTS 的稳定字段
- 当前推荐在授权完成后分别调用 `account/info`
- 用两边返回的 `username` 作为你方系统内的关联键，建立 TT 和 TTS 的软关联
- 真正调用 API 时仍然分别使用 `businessId` 和 `creatorUserOpenId`

### Q: API 是否支持国内 TikTok（抖音）？

**A:**
当前这套 Open API 面向国际版 TikTok 和 TikTok Shop 跨境账号；如果是抖音场景，不要默认这套接口可直接复用。

---

## 账号授权

### Q: 用户授权后，如何拿到 ttAbId 或 ttsAbId？

**A:**
从回调 URL 的 `state` 参数中解析 JSON：

```javascript
const urlParams = new URLSearchParams(window.location.search)
const stateJson = decodeURIComponent(urlParams.get('state'))
const state = JSON.parse(stateJson)

const ttAbId = state.ttAbId
const ttsAbId = state.ttsAbId
```

更完整的处理方式见 [oauth-callback.md](./docs/oauth-callback.md)。

### Q: 一个用户可以绑定多个 TikTok 账号吗？

**A:**
可以。每次授权返回的 `ttAbId` / `ttsAbId` 都是独立账号标识，你可以在自己系统里做一对多关联。

如果同一达人既授权了 TT 又授权了 TTS，也建议保存成两条独立记录，再通过 `username` 建立关联关系。

### Q: 如何解绑账号？

**A:**
当前 API 不提供单独的解绑接口。通常做法是在你自己的系统中删除或停用对应账号记录。

---

## 视频上传

### Q: `--file` 支持本地路径还是 URL？

**A:**
两者都支持：

```bash
beervid upload --file ./video.mp4
beervid upload --file https://example.com/video.mp4
```

如果传 URL，当前 CLI 会先下载再上传。

### Q: 上传凭证的有效期是多久？

**A:**
当前项目参考里使用的是 `expiresIn: 1800`，也就是 30 分钟。稳妥做法是每次上传前重新获取，不要长期缓存旧 token。

### Q: 如何实现上传进度显示？

**A:**
如果你不是直接用 CLI，而是自己封装上传，当前更适合用 XHR 做进度监听，而不是裸 `fetch`。

---

## 视频发布

### Q: 为什么 TT 发布需要轮询，TTS 通常不需要？

**A:**
- **TT**：发布接口先返回 `shareId`，后续还要轮询状态，直到 `PUBLISH_COMPLETE` 且 `post_ids` 非空
- **TTS**：挂车发布接口通常直接返回 `videoId`

### Q: TT 发布成功的判定条件是什么？

**A:**
不是只看 `status === PUBLISH_COMPLETE`，还要同时满足 `post_ids` 非空。只有这两个条件同时成立，才能把 `post_ids[0]` 当成真正的 `videoId` 使用。

### Q: TTS 发布时 productTitle 为什么要截断？

**A:**
当前 OpenAPI 约束是 `productTitle` 最多 30 字符，超出要提前截断：

```typescript
const productTitle = originalTitle.length > 30
  ? originalTitle.slice(0, 30)
  : originalTitle
```

### Q: 发布失败后可以直接重试吗？

**A:**
读接口和写接口要分开看：
- `query-products`、`query-video`、`poll-status` 这类读操作适合退避重试
- `publish` 这类写操作先考虑幂等，再决定是否补偿重试

详见 [retry-and-idempotency.md](./docs/retry-and-idempotency.md)。

---

## 数据查询

### Q: TTS 账号可以查询视频数据吗？

**A:**
不可以。视频数据查询只适用于 TT 账号。

如果你要查询某个 TTS 达人的视频数据，需要额外为同一达人完成 TT 授权，再使用 TT 的 `businessId` 调用 `query-video`。

### Q: `query-video` 一定要传 itemIds 吗？

**A:**
不一定。当前 CLI 既支持指定 `itemIds`：

```bash
beervid query-video --business-id biz_123 --item-ids 7123,7124
```

也支持按分页方式查列表：

```bash
beervid query-video --business-id biz_123 --cursor 0 --max-count 20
```

### Q: 商品分页里的 cursor 是怎么来的？

**A:**
当前实现不是直接透传后端的单个 token，而是把：

- `shopToken`
- `showcaseToken`

组成一个 JSON 对象，再做 base64 编码。这样可以同时追踪 `shop` 和 `showcase` 两个来源的分页进度。

---

## CLI 使用

### Q: 配置保存在哪里？

**A:**
默认保存在 `~/.beervid/config.json`。

### Q: 环境变量和配置文件哪个优先级高？

**A:**
优先级是：

`环境变量 > 配置文件 > 默认值`

### Q: CLI 命令执行失败时先看什么？

**A:**
优先看这三步：

1. `beervid config --show`
2. `beervid get-oauth-url --type tt`
3. 查看 [troubleshooting.md](./docs/troubleshooting.md)

---

## 相关文档

- [快速开始指南](./QUICKSTART.md)
- [完整 API 参考](./references/api-reference.md)
- [OAuth 回调](./docs/oauth-callback.md)
- [故障排查指南](./docs/troubleshooting.md)
