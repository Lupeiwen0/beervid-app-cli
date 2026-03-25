# beervid-app-cli

BEERVID 第三方应用 Open API 的 Claude Code Skill，提供 TikTok 视频发布、账号授权、数据查询等完整能力的 CLI 脚本和 API 参考文档。

## 安装

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

| 脚本 | 功能 |
|------|------|
| `scripts/get-oauth-url.mjs` | 获取 TT/TTS OAuth 授权链接 |
| `scripts/get-account-info.mjs` | 查询账号信息 |
| `scripts/upload.mjs` | 上传视频（支持本地文件和 URL） |
| `scripts/publish.mjs` | 发布视频（普通/挂车） |
| `scripts/poll-status.mjs` | 轮询发布状态 |
| `scripts/query-video.mjs` | 查询视频统计数据 |
| `scripts/query-products.mjs` | 查询 TTS 商品列表 |

详细用法见 [SKILL.md](./SKILL.md)，API 参考见 [references/api-reference.md](./references/api-reference.md)。
