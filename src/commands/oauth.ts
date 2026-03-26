import type { CAC } from 'cac'
import { openApiGet, printResult } from '../client/index.js'
import type { TtOAuthUrlData, TtsOAuthUrlData } from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

export function register(cli: CAC): void {
  cli
    .command('get-oauth-url', '获取 TikTok OAuth 授权链接')
    .option('--type <type>', '账号类型: tt（普通账号）或 tts（Shop 账号）')
    .action(async (options: { type?: string }) => {
      if (!options.type) {
        console.error('缺少必填参数: --type\n')
        console.error('用法: beervid get-oauth-url --type <tt|tts>')
        process.exit(1)
      }

      const type = options.type.toLowerCase()

      if (type !== 'tt' && type !== 'tts') {
        console.error('错误: --type 必须为 tt 或 tts')
        process.exit(1)
      }

      try {
        if (type === 'tt') {
          const data = await openApiGet<TtOAuthUrlData>('/api/v1/open/thirdparty-auth/tt-url')
          console.log('TT OAuth 授权链接:')
          printResult(data)
        } else {
          const data = await openApiGet<TtsOAuthUrlData>('/api/v1/open/thirdparty-auth/tts-url')
          console.log('TTS OAuth 授权链接:')
          printResult(data)
        }
      } catch (err) {
        rethrowIfProcessExit(err)
        console.error('获取 OAuth URL 失败:', (err as Error).message)
        process.exit(1)
      }
    })
}
