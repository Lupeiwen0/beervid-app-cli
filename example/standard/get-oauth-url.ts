/**
 * 获取 OAuth 授权 URL 示例
 *
 * 用法：
 *   npx tsx get-oauth-url.ts --type tt
 *   npx tsx get-oauth-url.ts --type tts
 */

import { parseArgs } from 'node:util'
import { openApiGet } from './api-client.js'

const { values } = parseArgs({
  options: {
    type: { type: 'string', default: 'tt' },
  },
  strict: false,
})

const accountType = (values['type'] ?? 'tt').toLowerCase()

if (accountType !== 'tt' && accountType !== 'tts') {
  console.error('错误: --type 必须为 tt 或 tts')
  process.exit(1)
}

console.log(`获取 ${accountType.toUpperCase()} OAuth 授权 URL...\n`)

if (accountType === 'tt') {
  // TT 账号：返回值即 URL 字符串
  const url = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
  console.log('TT OAuth URL:')
  console.log(url)
} else {
  // TTS 账号：返回值是包含 crossBorderUrl 的对象
  const data = await openApiGet<{ crossBorderUrl: string }>('/api/v1/open/thirdparty-auth/tts-url')
  console.log('TTS OAuth URL (跨境):')
  console.log(data.crossBorderUrl)
}

console.log('\n请将 URL 提供给用户，用户在浏览器中完成授权后，你的回调 URL 将收到 accountId。')
