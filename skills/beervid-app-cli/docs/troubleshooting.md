# 故障排查指南

本文档帮助你快速定位和解决 BEERVID Open API 集成中的常见问题。

## 目录

1. [认证问题](#认证问题)
2. [上传问题](#上传问题)
3. [发布问题](#发布问题)
4. [轮询问题](#轮询问题)
5. [查询问题](#查询问题)
6. [网络问题](#网络问题)
7. [调试技巧](#调试技巧)

---

## 认证问题

### 错误：401 Unauthorized

**症状：**
```json
{
  "code": 401,
  "message": "Unauthorized",
  "success": false
}
```

**可能原因：**
1. `BEERVID_APP_KEY` 未设置或错误
2. API Key 已过期或被撤销
3. 请求头 `X-API-KEY` 未正确设置

**解决方案：**

```bash
# 检查当前配置
beervid config --show

# 重新设置 API Key
beervid config --app-key "your-correct-api-key"

# 或使用环境变量
export BEERVID_APP_KEY="your-correct-api-key"
```

**验证：**
```bash
# 测试 API Key 是否有效
beervid get-oauth-url --type tt
```

### 错误：X-API-KEY header is required

**症状：**
API 返回缺少认证头的错误。

**解决方案：**

检查你的代码是否正确设置了请求头：

```typescript
const headers = {
  'X-API-KEY': process.env.BEERVID_APP_KEY,
  'Content-Type': 'application/json'
}
```

---

## 上传问题

### 错误：上传凭证获取失败

**症状：**
```json
{
  "code": 400,
  "message": "Invalid account type"
}
```

**可能原因：**
- TTS 上传需要 `creatorUserOpenId`，但你传了 `businessId`
- TT 上传不需要额外参数，但你传了 `creatorUserOpenId`

**解决方案：**

```bash
# TT 普通上传（不需要额外参数）
beervid upload --file ./video.mp4

# TTS 上传（需要 creator-id）
beervid upload --file ./video.mp4 --type tts --creator-id "open_user_abc"
```

### 错误：文件上传超时

**症状：**
上传大文件时请求超时。

**解决方案：**

1. **检查文件大小：** TikTok 限制视频大小通常为 4GB
2. **检查网络连接：** 确保网络稳定
3. **增加超时时间：** 如果使用代码集成，增加请求超时

```typescript
// 示例：增加超时时间
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 300000) // 5分钟

try {
  await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    signal: controller.signal
  })
} finally {
  clearTimeout(timeout)
}
```

### 错误：Invalid file format

**症状：**
```json
{
  "code": 400,
  "message": "Unsupported video format"
}
```

**解决方案：**

确保视频格式符合 TikTok 要求：
- 支持格式：MP4, MOV, MPEG, 3GP, AVI, WebM
- 推荐格式：MP4 (H.264 编码)
- 分辨率：最小 720p，推荐 1080p
- 时长：3秒 - 10分钟

---

## 发布问题

### 错误：businessId not found

**症状：**
```json
{
  "code": 404,
  "message": "Account not found"
}
```

**可能原因：**
1. `businessId` 或 `creatorUserOpenId` 错误
2. 账号未完成 OAuth 授权
3. 账号已被解绑

**解决方案：**

```bash
# 验证账号是否存在
beervid get-account-info --type TT --account-id "your-business-id"

# 如果账号不存在，重新获取授权
beervid get-oauth-url --type tt
```

### 错误：productTitle too long

**症状：**
TTS 发布时提示商品标题过长。

**解决方案：**

`productTitle` 最多 30 个字符，需要提前截断：

```typescript
const productTitle = originalTitle.length > 30
  ? originalTitle.slice(0, 30)
  : originalTitle
```

### 错误：Invalid video URL

**症状：**
TT 普通发布时提示视频 URL 无效。

**可能原因：**
1. `videoUrl` 不是可公开访问的 URL
2. URL 已过期
3. URL 格式错误

**解决方案：**

确保 `videoUrl` 是上传接口返回的 `fileUrl`：

```bash
# 先上传，获取 fileUrl
beervid upload --file ./video.mp4

# 使用返回的 fileUrl 发布
beervid publish --type normal \
  --business-id "biz_123" \
  --video-url "https://cdn.beervid.ai/uploads/xxx.mp4"
```

---

## 轮询问题

### 问题：轮询一直不返回 PUBLISH_COMPLETE

**症状：**
轮询状态一直是 `PROCESSING_DOWNLOAD` 或 `SEND_TO_USER_INBOX`。

**可能原因：**
1. TikTok 平台处理较慢（正常情况）
2. 视频文件有问题
3. TikTok 账号有限制

**解决方案：**

1. **增加轮询次数和间隔：**

```bash
beervid poll-status \
  --business-id "biz_123" \
  --share-id "share_abc" \
  --interval 10000 \
  --max-polls 60
```

2. **检查状态详情：**

```typescript
// 查看完整状态信息
const status = await pollStatus(businessId, shareId)
console.log('Status:', status.status)
console.log('Error:', status.error_code, status.error_message)
```

3. **常见状态及含义：**

| 状态 | 含义 | 是否正常 |
|------|------|----------|
| `PROCESSING_DOWNLOAD` | TikTok 正在下载视频 | 正常，继续等待 |
| `SEND_TO_USER_INBOX` | 视频已发送到收件箱 | 正常，继续等待 |
| `PUBLISH_COMPLETE` | 发布完成 | 成功 |
| `FAILED` | 发布失败 | 失败，检查错误信息 |

### 问题：post_ids 为空

**症状：**
状态是 `PUBLISH_COMPLETE`，但 `post_ids` 数组为空。

**解决方案：**

这通常表示视频还在处理中，需要继续轮询：

```typescript
// 正确的完成判断
const isComplete =
  status.status === 'PUBLISH_COMPLETE' &&
  status.post_ids &&
  status.post_ids.length > 0
```

---

## 查询问题

### 错误：Only TT accounts can query video data

**症状：**
使用 TTS 账号查询视频数据时报错。

**解决方案：**

视频数据查询仅支持 TT 账号：

```bash
# 正确：使用 TT 账号的 businessId
beervid query-video \
  --business-id "7281234567890" \
  --item-ids "7123456789012345678"

# 错误：使用 TTS 账号的 creatorUserOpenId
# TTS 账号不支持视频数据查询
```

如果同一达人已经完成了 TTS 授权，但你还想查询该账号的视频数据：

- 还需要额外完成一次 TT 授权
- 官方当前没有提供 `uno_id` 这类 TT/TTS 强关联字段
- 当前推荐在你方系统里通过 `account/info` 返回的 `username` 建立 TT/TTS 关联
- 查数时使用关联后的 TT `businessId`，不要直接使用 TTS `creatorUserOpenId`

### 问题：查询返回的字段不一致

**症状：**
有时返回 `playCount`，有时返回 `play_count`。

**解决方案：**

API 可能同时返回 camelCase 和 snake_case 字段，建议兼容处理：

```typescript
const playCount = data.playCount ?? data.play_count ?? 0
const likeCount = data.likeCount ?? data.like_count ?? 0
```

---

## 网络问题

### 错误：ECONNREFUSED 或 ETIMEDOUT

**症状：**
请求无法连接到服务器。

**解决方案：**

1. **检查 BASE_URL 配置：**

```bash
beervid config --show

# 确保 BASE_URL 正确
beervid config --base-url "https://open.beervid.ai"
```

2. **检查网络连接：**

```bash
# 测试网络连通性
curl -I https://open.beervid.ai/api/v1/open/thirdparty-auth/tt-url
```

3. **检查防火墙和代理：**

如果在企业网络环境，可能需要配置代理：

```bash
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
```

### 错误：SSL certificate problem

**症状：**
SSL 证书验证失败。

**解决方案：**

```bash
# 临时禁用 SSL 验证（仅用于调试，生产环境不推荐）
export NODE_TLS_REJECT_UNAUTHORIZED=0

# 更好的方案：更新系统证书
# macOS
brew install ca-certificates

# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ca-certificates
```

---

## 调试技巧

### 1. 启用详细日志

```bash
# 设置环境变量启用调试模式
export DEBUG=beervid:*

# 运行命令查看详细日志
beervid upload --file ./video.mp4
```

### 2. 使用 --verbose 标志

```bash
# 如果 CLI 支持 verbose 模式
beervid publish-tt-flow \
  --business-id "biz_123" \
  --file ./video.mp4 \
  --verbose
```

### 3. 检查原始响应

在代码中打印完整响应：

```typescript
try {
  const response = await openApiPost('/api/v1/open/tiktok/video/publish', data)
  console.log('Full response:', JSON.stringify(response, null, 2))
} catch (error) {
  console.error('Error details:', error)
}
```

### 4. 使用 curl 测试 API

```bash
# 测试获取授权链接
curl -X GET \
  -H "X-API-KEY: your-api-key" \
  https://open.beervid.ai/api/v1/open/thirdparty-auth/tt-url

# 测试账号信息查询
curl -X POST \
  -H "X-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"accountType":"TT","accountId":"7281234567890"}' \
  https://open.beervid.ai/api/v1/open/account/info
```

### 5. 检查 CLI 版本

```bash
# 确保使用最新版本
npm list -g beervid-app-cli

# 更新到最新版本
npm update -g beervid-app-cli
```

### 6. 清理本地配置

```bash
# 查看配置文件位置
ls -la ~/.beervid/

# 删除配置文件重新开始
rm -rf ~/.beervid/config.json

# 重新配置
beervid config --app-key "your-api-key"
```

---

## 常见错误码速查

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查参数格式和必填字段 |
| 401 | 认证失败 | 检查 API Key 是否正确 |
| 403 | 权限不足 | 检查账号权限或 API Key 权限 |
| 404 | 资源不存在 | 检查 ID 是否正确 |
| 429 | 请求过于频繁 | 降低请求频率，参考限流说明 |
| 500 | 服务器错误 | 稍后重试，或联系技术支持 |

---

## 仍然无法解决？

1. **查看完整 API 文档：** [references/api-reference.md](../references/api-reference.md)
2. **查看 FAQ：** [FAQ.md](../FAQ.md)
3. **查看示例代码：** [example/](../example/)
4. **提交 Issue：** https://github.com/Lupeiwen0/beervid-app-cli/issues
5. **联系技术支持：** support@beervid.ai
