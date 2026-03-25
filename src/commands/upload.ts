import type { CAC } from 'cac'
import { openApiPost, openApiUpload, resolveFileInput, printResult } from '../client/index.js'
import type { UploadTokenData, NormalUploadResult, TtsUploadResult } from '../types/index.js'

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
          // 1. 获取上传凭证
          let uploadToken = options.token

          if (!uploadToken) {
            console.log('正在获取上传凭证...')
            const tokenData = await openApiPost<UploadTokenData>(
              '/api/v1/open/upload-token/generate'
            )
            uploadToken = tokenData.uploadToken
            console.log(`上传凭证获取成功，有效期 ${tokenData.expiresIn} 秒`)
          }

          // 2. 解析文件入参
          console.log(`正在处理文件: ${options.file}`)
          const file = await resolveFileInput(options.file)
          console.log(`文件就绪: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

          // 3. 构建 FormData
          const formData = new FormData()
          formData.append('file', file)

          const auth = { headerName: 'X-UPLOAD-TOKEN', headerValue: uploadToken }

          // 4. 执行上传
          let data: NormalUploadResult | TtsUploadResult

          if (uploadType === 'tts') {
            console.log(`TTS 上传模式，creatorUserOpenId: ${options.creatorId!}`)
            data = await openApiUpload<TtsUploadResult>(
              '/api/v1/open/file-upload/tts-video',
              formData,
              { creatorUserOpenId: options.creatorId! },
              auth
            )
          } else {
            console.log('普通上传模式')
            data = await openApiUpload<NormalUploadResult>(
              '/api/v1/open/file-upload',
              formData,
              undefined,
              auth
            )
          }

          console.log('\n上传成功:')
          printResult(data)
        } catch (err) {
          console.error('上传失败:', (err as Error).message)
          process.exit(1)
        }
      }
    )
}
