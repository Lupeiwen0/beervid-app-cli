# 快速开始指南

5 分钟从零到发布第一个 TikTok 视频。

## 前置准备

1. **获取 API Key**
   - 联系 BEERVID 平台获取 `BEERVID_APP_KEY`
   - 确保你的应用已在 BEERVID 平台注册

2. **安装 CLI**
   ```bash
   npm install -g beervid-app-cli
   ```

3. **配置 API Key**
   ```bash
   beervid config --app-key "your-api-key-here"
   ```

## 场景一：发布普通视频（TT 账号）

### 步骤 1：获取授权链接

```bash
beervid get-oauth-url --type tt
```

输出示例：
```json
"https://www.tiktok.com/v2/auth/authorize?client_key=..."
```

### 步骤 2：用户授权

1. 将上面的 URL 发送给用户
2. 用户点击授权后，会跳转到你配置的回调地址
3. 从回调 URL 的 `state` 参数中解析 JSON，获取 `ttAbId`

回调示例：
```
https://your-domain.com/callback?state=%7B%22ttAbId%22%3A%227281234567890%22%7D
```

解析后得到：
```json
{
  "ttAbId": "7281234567890"
}
```

### 步骤 3：一键发布视频

使用 `ttAbId` 作为 `businessId` 发布视频：

```bash
beervid publish-tt-flow \
  --business-id "7281234567890" \
  --file ./my-video.mp4 \
  --caption "我的第一个视频"
```

这个命令会自动完成：
- 获取上传凭证
- 上传视频文件
- 发布视频
- 轮询发布状态
- 查询视频数据

输出示例：
```json
{
  "upload": {
    "fileUrl": "https://cdn.beervid.ai/uploads/xxx.mp4"
  },
  "publish": {
    "shareId": "share_abc123"
  },
  "status": {
    "status": "PUBLISH_COMPLETE",
    "post_ids": ["7123456789012345678"]
  },
  "query": {
    "videoList": [
      {
        "itemId": "7123456789012345678",
        "shareUrl": "https://www.tiktok.com/@username/video/7123456789012345678"
      }
    ]
  }
}
```

完成！你的第一个视频已成功发布到 TikTok。

## 场景二：发布挂车视频（TTS 账号）

### 步骤 1：获取授权链接

```bash
beervid get-oauth-url --type tts
```

### 步骤 2：用户授权

从回调 URL 的 `state` 参数中解析 `ttsAbId`：

```json
{
  "ttsAbId": "open_user_abc123"
}
```

### 步骤 3：一键发布挂车视频

```bash
beervid publish-tts-flow \
  --creator-id "open_user_abc123" \
  --file ./product-video.mp4
```

CLI 会自动：
1. 查询可用商品列表
2. 自动选择一个可发布商品；如果你想手动挑选，请加 `--interactive`
3. 上传视频
4. 发布挂车视频

输出示例：
```json
{
  "products": [
    {
      "products": [
        {
          "id": "prod_789",
          "title": "Premium Widget"
        }
      ]
    }
  ],
  "selectedProduct": {
    "id": "prod_789",
    "title": "Premium Widget"
  },
  "upload": {
    "videoFileId": "vf_abc123def456"
  },
  "publish": {
    "videoId": "7234567890123456789"
  }
}
```

## 场景三：同一达人既要挂车发布，又要查询视频数据

如果这个达人是 TTS 账号，并且你还想查询该账号的视频播放、点赞、评论等数据，需要额外再完成一次 TT 授权。

### 步骤 1：先授权 TTS，用于挂车发布

拿到 `ttsAbId`，作为 `creatorUserOpenId` 使用：

```json
{
  "ttsAbId": "open_user_abc123"
}
```

### 步骤 2：再授权 TT，用于视频数据查询

拿到 `ttAbId`，作为 `businessId` 使用：

```json
{
  "ttAbId": "7281234567890"
}
```

### 步骤 3：分别调用账号详情接口，建立本地关联

官方当前没有提供 `uno_id` 这种可直接关联 TT/TTS 的字段，推荐调用 `account/info` 后，用 `username` 作为当前的关联键：

```text
TTS account/info -> username = creator_name
TT  account/info -> username = creator_name

=> 在你方系统里建立一条 TT <-> TTS 关联
```

### 步骤 4：按场景使用不同 ID

- 挂车发布：使用 `creatorUserOpenId`
- 商品查询：使用 `creatorUserOpenId`
- 视频数据查询：使用 `businessId`

## 下一步

- 查看 [SKILL.md](./SKILL.md) 了解完整功能
- 查看 [references/api-reference.md](./references/api-reference.md) 了解 API 详情
- 查看 [docs/](./docs/) 了解生产环境部署建议
- 查看 [example/](./example/) 了解代码集成示例

## 需要帮助？

- 查看 [FAQ.md](./FAQ.md) 常见问题
- 查看 [TROUBLESHOOTING.md](./docs/troubleshooting.md) 故障排查
- 提交 Issue: https://github.com/Lupeiwen0/beervid-app-cli/issues
