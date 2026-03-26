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

详细用法见 [SKILL.md](./SKILL.md)。完整 API 参考见 [references/api-reference.md](./references/api-reference.md)。
