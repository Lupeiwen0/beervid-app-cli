# beervid-app-cli

BEERVID 第三方应用 Open API 的 TypeScript CLI 和 Claude Code Skill，提供 TikTok 视频发布、账号授权、数据查询等完整能力。

## 安装

### npm CLI

```bash
npm install -g beervid-app-cli
beervid --help
```

### Claude Code Skill

将本仓库克隆到 Claude Code 的 skills 目录：

```bash
git clone <repo-url> ~/.claude/skills/beervid-app-cli
```

## 环境变量

```bash
export BEERVID_APP_KEY="your-api-key"
export BEERVID_APP_BASE_URL="https://open.beervid.ai"  # 可选，有默认值
```

## 功能概览

| 命令 | 功能 |
|------|------|
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

详细用法见 [SKILL.md](./SKILL.md)。如需查看完整 API 参考，请在仓库源码中阅读 `references/api-reference.md`。
