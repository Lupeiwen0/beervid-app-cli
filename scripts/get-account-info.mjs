#!/usr/bin/env node

/**
 * 查询 TikTok 账号信息
 *
 * 用法:
 *   node get-account-info.mjs --type tt --account-id 7281234567890
 *
 * 参数:
 *   --type        账号类型: TT 或 TTS
 *   --account-id  账号 ID
 */

import { openApiPost, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['type', 'account-id'], 'node get-account-info.mjs --type <TT|TTS> --account-id <id>')

const accountType = args.type.toUpperCase()
if (accountType !== 'TT' && accountType !== 'TTS') {
  console.error('错误: --type 必须为 TT 或 TTS')
  process.exit(1)
}

try {
  const data = await openApiPost('/api/v1/open/account/info', {
    accountType,
    accountId: args['account-id'],
  })
  printResult(data)
} catch (err) {
  console.error('查询账号信息失败:', err.message)
  process.exit(1)
}
