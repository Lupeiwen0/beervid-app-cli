import type { CAC } from 'cac'
import { openApiPost, printResult } from '../client/index.js'
import { rethrowIfProcessExit } from './utils.js'

export function register(cli: CAC): void {
  cli
    .command('get-account-info', '查询 TikTok 账号信息')
    .option('--type <type>', '账号类型: TT 或 TTS')
    .option('--account-id <id>', '账号 ID')
    .action(async (options: { type?: string; accountId?: string }) => {
      if (!options.type || !options.accountId) {
        const missing = [!options.type && '--type', !options.accountId && '--account-id']
          .filter(Boolean)
          .join(', ')
        console.error(`缺少必填参数: ${missing}\n`)
        console.error('用法: beervid get-account-info --type <TT|TTS> --account-id <id>')
        process.exit(1)
      }

      const accountType = options.type.toUpperCase()
      if (accountType !== 'TT' && accountType !== 'TTS') {
        console.error('错误: --type 必须为 TT 或 TTS')
        process.exit(1)
      }

      try {
        const data = await openApiPost<unknown>('/api/v1/open/account/info', {
          accountType,
          accountId: options.accountId,
        })
        printResult(data)
      } catch (err) {
        rethrowIfProcessExit(err)
        console.error('查询账号信息失败:', (err as Error).message)
        process.exit(1)
      }
    })
}
