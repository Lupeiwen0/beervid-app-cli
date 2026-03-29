# BEERVID CLI 参考

> 本文档是 `beervid` CLI 的完整使用参考，包括命令参数、使用示例、输出结构和注意事项。

## 安装与前置

```bash
npm install -g beervid-app-cli
beervid config --app-key "your-api-key"
export BEERVID_APP_BASE_URL="https://open.beervid.ai"
```

## 命令参数详情

| 命令                       | 功能                  | 常用参数                                                                     |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `beervid config`           | 设置或查看全局配置    | `--app-key`, `--base-url`, `--show`                                          |
| `beervid get-oauth-url`    | 获取 OAuth 授权链接   | `--type tt                                                                   | tts`                      |
| `beervid get-account-info` | 查询账号信息          | `--type TT                                                                   | TTS`, `--account-id`      |
| `beervid upload`           | 上传视频              | `--file`, `--type tts`, `--creator-id`, `--token`                            |
| `beervid publish`          | 发布普通或挂车视频    | `--type normal                                                               | shoppable` 加对应业务参数 |
| `beervid poll-status`      | 轮询 TT 发布状态      | `--business-id`, `--share-id`, `--interval`, `--max-polls`                   |
| `beervid query-video`      | 查询视频数据          | `--business-id`, `--item-ids`, `--cursor`, `--max-count`                     |
| `beervid query-products`   | 查询 TTS 商品         | `--creator-id`, `--product-type`, `--cursor`                                 |
| `beervid publish-tt-flow`  | 执行 TT 完整发布流程  | `--business-id`, `--file`, `--caption`                                       |
| `beervid publish-tts-flow` | 执行 TTS 完整发布流程 | `--creator-id`, `--file`, `--interactive`, `--product-id`, `--product-title` |

## 使用示例

```bash
# 设置 APP Key
beervid config --app-key "your-api-key"

# 获取授权链接
beervid get-oauth-url --type tt
beervid get-oauth-url --type tts

# 查询账号信息
beervid get-account-info --type TT --account-id 7281234567890

# 上传普通视频（--file 同时支持本地文件路径和 URL 地址）
beervid upload --file ./video.mp4
beervid upload --file https://example.com/video.mp4

# 上传 TTS 视频（--file 同时支持本地文件路径和 URL 地址）
beervid upload --file ./video.mp4 --type tts --creator-id=open_user_abc

# 普通发布（--video-url 需要传可访问的视频 URL）
beervid publish --type normal --business-id=biz_12345 --video-url https://cdn.beervid.ai/uploads/xxx.mp4 --caption "My video"

# 挂车发布
beervid publish --type shoppable --creator-id=open_user_abc --file-id vf_abc123 --product-id prod_789 --product-title "Premium Widget" --caption "Product review"

# 轮询状态
beervid poll-status --business-id=biz_12345 --share-id share_abc123

# 查询视频数据
beervid query-video --business-id=biz_12345 --item-ids 7123456789012345678
beervid query-video --business-id=biz_12345 --cursor 0 --max-count 20

# 查询商品
beervid query-products --creator-id=open_user_abc

# TT 一键完整流程（--file 同时支持本地文件路径和 URL 地址）
beervid publish-tt-flow --business-id=biz_12345 --file ./video.mp4 --caption "My video"
beervid publish-tt-flow --business-id=biz_12345 --file https://example.com/video.mp4 --caption "My video"

# TTS 一键完整流程（--file 同时支持本地文件路径和 URL 地址）
beervid publish-tts-flow --creator-id=open_user_abc --file ./video.mp4
beervid publish-tts-flow --creator-id=open_user_abc --file https://example.com/video.mp4
```

## 注意事项

- 当参数值本身以 `-` 开头时，必须写成 `--option=value`，否则 CLI 会把值误判为新的选项
- `--file` 参数同时支持本地文件路径和 URL 地址

## 输出结构

大多数命令直接输出 API 响应的 `data` 字段（JSON 格式）。以下命令有特殊处理：

### `query-products` 输出

商品查询会合并 shop + showcase 两个来源并按 `id` 去重，输出扁平列表而非 API 原始分组：

```json
{
  "list": [
    {
      "id": "prod_123",
      "title": "Premium Widget Pro",
      "price": { "amount": "29.99", "currency": "USD" },
      "images": ["{height=200, url=https://img.tiktokcdn.com/xxx.jpg, width=200}"],
      "salesCount": 1500,
      "brandName": "WidgetCo",
      "shopName": "Widget Store",
      "source": "shop",
      "reviewStatus": "APPROVED",
      "inventoryStatus": "IN_STOCK",
      "productType": "shop"
    }
  ],
  "nextPage": "eyJ..."
}
```

- `list`：去重后的商品列表，每项保留 API 原始字段并附加 `productType`（`shop` / `showcase`）
- `nextPage`：复合分页游标，可直接传给 `--cursor` 翻页；`null` 表示已到最后一页

### `publish-tts-flow` 输出

TTS 完整发布流程输出多步骤组合结果，其中 `products` 使用与 `query-products` 相同的去重扁平列表结构：

```json
{
  "products": [{ /* 同 query-products 的 list item */ }],
  "selectedProduct": { /* 被选中发布的商品 */ },
  "upload": { /* file-upload/tts-video API data */ },
  "publish": { /* shoppable-video/publish API data */ }
}
```

- 手动指定 `--product-id` + `--product-title` 时 `products` 为 `null`（跳过商品查询）
