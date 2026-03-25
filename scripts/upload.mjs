#!/usr/bin/env node

/**
 * 上传视频文件到 BEERVID
 *
 * 支持两种入参：本地文件路径 或 远程 URL（会自动下载后上传）
 * 支持两种上传模式：普通上传（TT）和 TTS 上传（挂车）
 *
 * 用法:
 *   # 普通上传（本地文件）
 *   node upload.mjs --file ./video.mp4
 *
 *   # 普通上传（远程 URL）
 *   node upload.mjs --file https://example.com/video.mp4
 *
 *   # TTS 挂车上传
 *   node upload.mjs --file ./video.mp4 --type tts --creator-id open_user_abc
 *
 *   # 使用已有的上传凭证（跳过自动获取）
 *   node upload.mjs --file ./video.mp4 --token upt.xxx
 *
 * 参数:
 *   --file         视频文件路径或 URL（必填）
 *   --type         上传类型: normal（默认）或 tts
 *   --creator-id   TTS 账号的 creatorUserOpenId（type=tts 时必填）
 *   --token        已有的上传凭证（可选，不传则自动获取）
 */

import {
  openApiPost,
  openApiUpload,
  resolveFileInput,
  parseArgs,
  requireArgs,
  printResult,
} from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['file'], 'node upload.mjs --file <路径或URL> [--type tts --creator-id <id>]')

const uploadType = (args.type || 'normal').toLowerCase()

if (uploadType === 'tts' && !args['creator-id']) {
  console.error('错误: TTS 上传模式需要 --creator-id 参数')
  process.exit(1)
}

try {
  // 1. 获取上传凭证
  let uploadToken = args.token

  if (!uploadToken) {
    console.log('正在获取上传凭证...')
    const tokenData = await openApiPost('/api/v1/open/upload-token/generate')
    uploadToken = tokenData.uploadToken
    console.log(`上传凭证获取成功，有效期 ${tokenData.expiresIn} 秒`)
  }

  // 2. 解析文件入参（URL 自动下载，本地文件直接读取）
  console.log(`正在处理文件: ${args.file}`)
  const file = await resolveFileInput(args.file)
  console.log(`文件就绪: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

  // 3. 构建 FormData
  const formData = new FormData()
  formData.append('file', file)

  const auth = { headerName: 'X-UPLOAD-TOKEN', headerValue: uploadToken }

  // 4. 执行上传
  let data
  if (uploadType === 'tts') {
    console.log(`TTS 上传模式，creatorUserOpenId: ${args['creator-id']}`)
    data = await openApiUpload(
      '/api/v1/open/file-upload/tts-video',
      formData,
      { creatorUserOpenId: args['creator-id'] },
      auth
    )
  } else {
    console.log('普通上传模式')
    data = await openApiUpload(
      '/api/v1/open/file-upload',
      formData,
      undefined,
      auth
    )
  }

  console.log('\n上传成功:')
  printResult(data)
} catch (err) {
  console.error('上传失败:', err.message)
  process.exit(1)
}
