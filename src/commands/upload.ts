import type { CAC } from 'cac'
import { printResult } from '../client/index.js'
import { uploadNormalVideo, uploadTtsVideo } from '../utils/upload.js'
import type { NormalUploadResult, TtsUploadResult } from '../types/index.js'
import { rethrowIfProcessExit } from './utils.js'

const VALID_UPLOAD_TYPES = ['normal', 'tts']

export function register(cli: CAC): void {
  cli
    .command('upload', '上传视频文件（支持本地文件和 URL）')
    .option('--file <path>', '视频文件路径或 URL（必填）')
    .option('--type <type>', '上传类型: normal（默认）或 tts')
    .option('--creator-id <id>', 'TTS 账号 creatorUserOpenId（type=tts 时必填）')
    .option('--token <token>', '已有的上传凭证（可选，不传则自动获取）')
    .action(
      async (options: {
        file?: string
        type?: string
        creatorId?: string
        token?: string
      }) => {
        if (!options.file) {
          console.error('缺少必填参数: --file\n')
          console.error(
            '用法: beervid upload --file <路径或URL> [--type tts --creator-id <id>]'
          )
          process.exit(1)
        }

        const uploadType = (options.type ?? 'normal').toLowerCase()
        if (!VALID_UPLOAD_TYPES.includes(uploadType)) {
          console.error('错误: --type 必须为 normal 或 tts')
          process.exit(1)
        }

        if (uploadType === 'tts' && !options.creatorId) {
          console.error('错误: TTS 上传模式需要 --creator-id 参数')
          process.exit(1)
        }

        try {
          let data: NormalUploadResult | TtsUploadResult

          if (uploadType === 'tts') {
            console.log(`TTS 上传模式，creatorUserOpenId: ${options.creatorId!}`)
            data = await uploadTtsVideo(options.file, options.creatorId!, options.token)
          } else {
            console.log('普通上传模式')
            data = await uploadNormalVideo(options.file, options.token)
          }

          console.log('\n上传成功:')
          printResult(data)
        } catch (err) {
          rethrowIfProcessExit(err)
          console.error('上传失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
