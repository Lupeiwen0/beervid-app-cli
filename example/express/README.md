# Express 后端集成示例

使用 Express 框架集成 BEERVID Open API 的后端服务示例，包含 OAuth 回调处理、TT/TTS 完整发布流程。

## 前置条件

- Node.js ≥ 20
- BEERVID APP_KEY

## 安装

```bash
cd example/express
npm install
```

## 配置

```bash
export BEERVID_APP_KEY="your-api-key"
# 可选
export BEERVID_APP_BASE_URL="https://open.beervid.ai"
export PORT=3000
```

## 运行

```bash
npx tsx server.ts
```

服务启动后访问 `http://localhost:3000`。

## API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/oauth/tt` | 获取 TT OAuth URL 并重定向 |
| GET | `/oauth/tts` | 获取 TTS OAuth URL 并重定向 |
| GET | `/oauth/callback` | OAuth 回调处理 |
| POST | `/api/publish/tt` | TT 完整发布流程（含后台轮询） |
| POST | `/api/publish/tts` | TTS 完整发布流程 |
| GET | `/api/status/:shareId` | 查询发布状态 |
| GET | `/api/products/:creatorId` | 查询商品列表 |

## 请求示例

```bash
# TT 完整发布
curl -X POST http://localhost:3000/api/publish/tt \
  -H "Content-Type: application/json" \
  -d '{"businessId": "biz_123", "videoUrl": "https://cdn.beervid.ai/uploads/xxx.mp4", "caption": "My video"}'

# TTS 完整发布
curl -X POST http://localhost:3000/api/publish/tts \
  -H "Content-Type: application/json" \
  -d '{"creatorId": "open_user_abc", "videoFileId": "vf_abc123", "productId": "prod_789", "productTitle": "Widget"}'
```
