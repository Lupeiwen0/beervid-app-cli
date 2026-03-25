#!/usr/bin/env node

/**
 * 获取 TikTok OAuth 授权链接
 *
 * 用法:
 *   node get-oauth-url.mjs --type tt
 *   node get-oauth-url.mjs --type tts
 *
 * 参数:
 *   --type  账号类型: tt（普通账号）或 tts（Shop 账号）
 */

import { openApiGet, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['type'], 'node get-oauth-url.mjs --type <tt|tts>')

const type = args.type.toLowerCase()

if (type !== 'tt' && type !== 'tts') {
  console.error('错误: --type 必须为 tt 或 tts')
  process.exit(1)
}

try {
  if (type === 'tt') {
    const url = await openApiGet('/api/v1/open/thirdparty-auth/tt-url')
    console.log('TT OAuth 授权链接:')
    printResult({ type: 'tt', url })
  } else {
    const data = await openApiGet('/api/v1/open/thirdparty-auth/tts-url')
    console.log('TTS OAuth 授权链接:')
    printResult({ type: 'tts', url: data.crossBorderUrl })
  }
} catch (err) {
  console.error('获取 OAuth URL 失败:', err.message)
  process.exit(1)
}
