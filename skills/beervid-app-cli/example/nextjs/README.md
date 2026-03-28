# Next.js API Route 集成示例

使用 Next.js App Router + API Route 模式集成 BEERVID Open API 的全栈示例。

## 前置条件

- Node.js ≥ 20
- BEERVID APP_KEY

## 安装

```bash
cd example/nextjs
npm install
```

## 配置

复制环境变量文件并填入 APP_KEY：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：
```
BEERVID_APP_KEY=your-api-key
BEERVID_APP_BASE_URL=https://open.beervid.ai
```

## 运行

```bash
npm run dev
```

访问 `http://localhost:3000`

## API Routes

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/oauth/url?type=tt` | 获取 OAuth URL |
| GET | `/api/oauth/callback` | OAuth 回调处理 |
| POST | `/api/publish/tt` | TT 完整发布流程 |
| POST | `/api/publish/tts` | TTS 完整发布流程 |
| GET | `/api/status/[shareId]?businessId=xxx` | 发布状态查询 |
| GET/POST | `/api/products?creatorId=xxx` | 商品查询 |

## 架构说明

- `lib/beervid-client.ts` — 服务端 BEERVID API 客户端封装
- `app/api/` — API Route Handlers
- `app/page.tsx` — 简单首页展示 API 调用方式

## 账号关联提醒

- TTS 账号只能用于挂车发布和商品查询，不能直接查视频数据。
- 如果同一达人还要查视频数据，需要额外完成 TT 授权。
- 官方当前没有提供 `uno_id` 这类 TT/TTS 关联字段，建议在 OAuth 回调后调用 `account/info`，并用返回的 `username` 建立本地关联。
