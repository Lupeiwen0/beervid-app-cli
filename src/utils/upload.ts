import { openApiPost, openApiUpload, resolveFileInput } from '../client/index.js'
import type { UploadTokenData, NormalUploadResult, TtsUploadResult } from '../types/index.js'

export async function getUploadToken(existingToken?: string): Promise<string> {
  if (existingToken) return existingToken

  const tokenData = await openApiPost<UploadTokenData>('/api/v1/open/upload-token/generate')
  return tokenData.uploadToken
}

export async function uploadNormalVideo(
  fileInput: string,
  uploadToken?: string
): Promise<NormalUploadResult> {
  const file = await resolveFileInput(fileInput)
  const token = await getUploadToken(uploadToken)
  const formData = new FormData()
  formData.append('file', file)

  return openApiUpload<NormalUploadResult>(
    '/api/v1/open/file-upload',
    formData,
    undefined,
    { headerName: 'X-UPLOAD-TOKEN', headerValue: token }
  )
}

export async function uploadTtsVideo(
  fileInput: string,
  creatorId: string,
  uploadToken?: string
): Promise<TtsUploadResult> {
  const file = await resolveFileInput(fileInput)
  const token = await getUploadToken(uploadToken)
  const formData = new FormData()
  formData.append('file', file)

  return openApiUpload<TtsUploadResult>(
    '/api/v1/open/file-upload/tts-video',
    formData,
    { creatorUserOpenId: creatorId },
    { headerName: 'X-UPLOAD-TOKEN', headerValue: token }
  )
}
