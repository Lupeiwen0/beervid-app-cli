# 安全最佳实践

本文档只保留与 BEERVID Open API 接入直接相关的安全要求，避免掺入与当前 API 无关的通用后端模板内容。

## 目录

1. [API Key 使用](#api-key-使用)
2. [OAuth 回调处理](#oauth-回调处理)
3. [请求与日志](#请求与日志)
4. [账号与 Token 存储](#账号与-token-存储)
5. [上线前检查](#上线前检查)

---

## API Key 使用

### 1. 不要硬编码 `BEERVID_APP_KEY`

```typescript
const apiKey = process.env.BEERVID_APP_KEY
if (!apiKey) {
  throw new Error('BEERVID_APP_KEY is required')
}
```

### 2. 只在服务端保存和使用 API Key

- 不要把 `BEERVID_APP_KEY` 下发到浏览器或移动端
- 前端如果需要调用能力，应先请求你自己的后端，再由后端调用 Open API
- CLI 场景下优先使用 `beervid config --app-key` 或环境变量，不要把 Key 写进代码仓库

### 3. 区分不同环境的 Key

- 测试、预发、生产环境分别使用独立 Key
- 怀疑泄露时立即轮换 Key
- 不要在日志、截图、报错信息里输出完整 Key

---

## OAuth 回调处理

### 1. 校验并持久化 `state`

BEERVID 的 TT / TTS OAuth 流程依赖回调 URL 中的 `state` 参数；你至少应做到：

- 生成授权链接时为当前用户生成一次性 `state`
- 回调时校验 `state` 是否存在、是否过期、是否已使用
- 从 `state` 中提取 `ttAbId` / `ttsAbId` 后再落库

推荐直接参考 [oauth-callback.md](./oauth-callback.md) 中的完整落地方式。

### 2. 回调地址使用 HTTPS

- 生产环境回调 URL 使用 HTTPS
- 只在你自己控制的域名下接收回调
- 不要把完整回调 URL 原样打进日志，避免把 `state` 暴露出去

---

## 请求与日志

### 1. 统一通过服务端封装请求

建议统一封装 `openApiGet`、`openApiPost`、`openApiUpload` 这类函数，集中处理：

- `X-API-KEY` 注入
- 基础地址拼接
- 超时控制
- 响应解包
- 错误格式化

### 2. 日志里只打印脱敏后的关键信息

推荐记录：

- 接口路径
- 业务账号 ID（`businessId` / `creatorUserOpenId`）
- `shareId` / `videoId`
- Open API `code`、`message`

不要记录：

- 完整 API Key
- 完整 access token
- 完整 OAuth `state`
- 含敏感 query 参数的原始 URL

### 3. 对外错误信息保持收敛

- 对用户返回“授权失效”“参数错误”“上传失败”这类业务级信息
- 详细堆栈和 Open API 原始报错只保留在服务端日志中

---

## 账号与 Token 存储

### 1. 只存必须的账号字段

对当前项目来说，真正高频使用的字段通常是：

- `accountType`
- `accountId`
- `businessId`
- `creatorUserOpenId`
- `username`
- `displayName`
- `sellerName`
- `profileUrl`
- `followersCount`

### 2. `accessToken` 按需存储

`account/info` 会返回 `accessToken`。如果你的业务不会直接使用它：

- 可以不入库
- 或仅短期缓存，不作为常规展示字段返回给前端

如果必须持久化，至少做到：

- 数据库字段与普通展示字段分开
- 日志脱敏
- 读取权限最小化

---

## 上线前检查

- `BEERVID_APP_KEY` 仅存在于服务端环境变量或本地 CLI 配置中
- OAuth 回调已校验 `state`，且 `ttAbId` / `ttsAbId` 已正确落库
- 对外接口不会返回 API Key、access token、原始 `state`
- Open API 请求封装已统一超时和错误处理
- 业务日志里只保留脱敏后的账号 ID、`shareId`、`videoId`
