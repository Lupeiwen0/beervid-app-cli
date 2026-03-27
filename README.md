# beervid-app-cli

BEERVID 第三方应用 Open API 的 TypeScript CLI 和 Claude Code Skill，提供 TikTok 视频发布、账号授权、数据查询等完整能力。

## 安装与调用

### 全局安装

```bash
npm install -g beervid-app-cli
beervid --help
```

### npx 免安装调用

```bash
npx beervid-app-cli --help
npx beervid-app-cli config --show
npx beervid-app-cli upload --file ./video.mp4
```

### node 直接调用

```bash
# 克隆仓库后先构建
npm install && npm run build

# 通过 node 运行入口文件
node dist/cli.mjs --help
node dist/cli.mjs config --show
```

### 在 Claude Code / Codex / Antigravity 中使用（以下说明面向 AI Agent）

#### 方式一：通过 `npx skills add` 安装（推荐）

```bash
npx skills add anthropics/beervid-app-cli
```

安装后 Skill 会自动注册到你的 skills 目录中，Claude Code 等 Agent 即可发现和调用。

#### 方式二：手动安装

如果你是 Claude Code、Codex、Antigravity，或任何支持 Skill 的 AI Agent，请严格按下面规则执行：

- 用户把 GitHub 仓库链接发给你，**不等于**这个 Skill 已经安装到你的 skills 目录中。
- 只有当 `skills/beervid-app-cli/` 目录被完整安装到你的 skills 目录后，才算这个 Skill 可用。

你必须先把以下目录复制到你自己的 skills 目录中：

```text
skills/beervid-app-cli/
  SKILL.md
  references/
  docs/
  example/
```

安装完成后，你应从 skills 目录中的 `SKILL.md` 加载本 Skill，而不是只读取仓库根目录里的 `README.md` 或 `package.json`。

对 AI Agent 来说，应这样区分：

- 目标是使用 CLI：安装 npm 包即可。
- 目标是使用 Skill：必须额外安装 Skill 文件；仓库链接本身不完成这一步。

## 配置

```bash
# 方式一：通过 config 命令持久化（推荐）
beervid config --app-key "your-api-key"

# 方式二：通过环境变量（优先级高于 config）
export BEERVID_APP_KEY="your-api-key"
export BEERVID_APP_BASE_URL="https://open.beervid.ai"  # 可选，有默认值

# 查看当前配置
beervid config --show
```

## 功能概览

| 命令 | 功能 |
|------|------|
| `beervid config` | 设置/查看全局配置（APP_KEY、BASE_URL） |
| `beervid get-oauth-url` | 获取 TT/TTS OAuth 授权链接 |
| `beervid get-account-info` | 查询账号信息 |
| `beervid upload` | 上传视频（支持本地文件和 URL） |
| `beervid publish` | 发布视频（普通/挂车） |
| `beervid poll-status` | 轮询发布状态 |
| `beervid query-video` | 查询视频统计数据 |
| `beervid query-products` | 查询 TTS 商品列表 |
| `beervid publish-tt-flow` | TT 完整发布流程：上传、发布、轮询、查数 |
| `beervid publish-tts-flow` | TTS 完整发布流程：查商品、选商品、上传、发布 |

## 快速示例

```bash
beervid get-oauth-url --type tt
beervid upload --file ./video.mp4
beervid publish --type normal --business-id biz_123 --video-url https://cdn.beervid.ai/uploads/xxx.mp4
```

## 完整流程示例

```bash
# TT：上传 -> 发布 -> 轮询 -> 查询数据
beervid publish-tt-flow --business-id biz_123 --file ./video.mp4 --caption "My video"

# TTS：自动选商品 -> 上传 -> 挂车发布
beervid publish-tts-flow --creator-id open_user_abc --file ./video.mp4

# TTS：交互式选商品
beervid publish-tts-flow --creator-id open_user_abc --file ./video.mp4 --interactive

# TTS：手动指定商品
beervid publish-tts-flow --creator-id open_user_abc --file ./video.mp4 --product-id prod_123 --product-title "Widget"
```

详细用法见 [SKILL.md](./skills/beervid-app-cli/SKILL.md)。完整 API 参考见 [references/api-reference.md](./skills/beervid-app-cli/references/api-reference.md)。

## 落地文档

面向接入方后端工程师的项目落地建议：

| 文档 | 内容 |
|------|------|
| [数据表字段建议](./skills/beervid-app-cli/docs/database-schema.md) | accounts/videos/products 表结构设计 |
| [OAuth 回调存储建议](./skills/beervid-app-cli/docs/oauth-callback.md) | State Token 防 CSRF、回调持久化、异步头像同步 |
| [TT 轮询任务建议](./skills/beervid-app-cli/docs/tt-poll-task.md) | 阶梯递增轮询间隔、Cron/队列三层保障 |
| [TTS 商品缓存建议](./skills/beervid-app-cli/docs/tts-product-cache.md) | 全量拉取、缓存过期、图片 URL 解析 |
| [失败重试与幂等建议](./skills/beervid-app-cli/docs/retry-and-idempotency.md) | 各 API 幂等性分析、指数退避、幂等键设计 |

## 示例工程

三种接入场景的可运行示例：

| 示例 | 场景 | 入口 |
|------|------|------|
| [Standard](./skills/beervid-app-cli/example/standard/) | 纯 Node.js 脚本，快速验证 | `npx tsx tt-publish-flow.ts` |
| [Express](./skills/beervid-app-cli/example/express/) | Express 后端服务，含 OAuth 回调 | `npx tsx server.ts` |
| [Next.js](./skills/beervid-app-cli/example/nextjs/) | Next.js App Router API Route | `npm run dev` |
