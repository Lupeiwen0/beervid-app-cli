# Standard 标准请求示例

使用纯 Node.js + TypeScript + 原生 `fetch` 直接调用 BEERVID Open API 的独立脚本集合。

## 前置条件

- Node.js ≥ 20
- BEERVID APP_KEY

## 安装

```bash
cd example/standard
npm install
```

## 配置

```bash
export BEERVID_APP_KEY="your-api-key"
# 可选：自定义 API 地址
export BEERVID_APP_BASE_URL="https://open.beervid.ai"
```

## 运行

每个脚本独立可运行：

```bash
# 获取 OAuth 授权 URL
npx tsx get-oauth-url.ts

# TT 完整发布流程（最佳实践）
npx tsx tt-publish-flow.ts --file ./video.mp4 --business-id biz_123

# TTS 完整发布流程（最佳实践）
npx tsx tts-publish-flow.ts --file ./video.mp4 --creator-id open_user_abc

# 商品查询与分页
npx tsx query-products.ts --creator-id open_user_abc
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `api-client.ts` | 通用 API 客户端封装（openApiGet/Post/Upload + 重试 + 错误处理） |
| `tt-publish-flow.ts` | ⭐ TT 完整发布流程最佳实践（含阶梯递增轮询间隔） |
| `tts-publish-flow.ts` | ⭐ TTS 完整发布流程最佳实践（含商品筛选策略） |
| `get-oauth-url.ts` | 获取 TT/TTS OAuth 授权 URL |
| `query-products.ts` | TTS 商品查询与分页遍历 |
