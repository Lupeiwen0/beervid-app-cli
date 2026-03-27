import { describe, expect, it, vi } from 'vitest'
import { runCommand } from '../helpers/cli.js'

const { openApiPost, openApiUpload, resolveFileInput, printResult } = vi.hoisted(() => ({
  openApiPost: vi.fn(),
  openApiUpload: vi.fn(),
  resolveFileInput: vi.fn(),
  printResult: vi.fn(),
}))

vi.mock('../../src/client/index.js', () => ({
  openApiPost,
  openApiUpload,
  resolveFileInput,
  printResult,
}))

import { register } from '../../src/commands/upload.js'

describe('upload command', () => {
  it('fails when file is missing', async () => {
    const result = await runCommand(register, ['upload'])

    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('缺少必填参数: --file')
  })

  it('fails when type is invalid', async () => {
    const result = await runCommand(register, ['upload', '--file', '/tmp/video.mp4', '--type', 'bad'])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: --type 必须为 normal 或 tts')
  })

  it('fails when tts upload has no creator id', async () => {
    const result = await runCommand(register, ['upload', '--file', '/tmp/video.mp4', '--type', 'tts'])

    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('错误: TTS 上传模式需要 --creator-id 参数')
  })

  it('uploads normal video with generated token', async () => {
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' })
    openApiPost.mockResolvedValueOnce({ uploadToken: 'token-1', expiresIn: 600 })
    resolveFileInput.mockResolvedValueOnce(file)
    openApiUpload.mockResolvedValueOnce({ fileUrl: 'https://cdn/video.mp4' })

    const result = await runCommand(register, ['upload', '--file', '/tmp/video.mp4'])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).toHaveBeenCalledWith('/api/v1/open/upload-token/generate')
    expect(openApiUpload).toHaveBeenCalledWith(
      '/api/v1/open/file-upload',
      expect.any(FormData),
      undefined,
      { headerName: 'X-UPLOAD-TOKEN', headerValue: 'token-1' }
    )
    expect(printResult).toHaveBeenCalledWith({ fileUrl: 'https://cdn/video.mp4' })
  })

  it('uploads tts video with provided token', async () => {
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' })
    resolveFileInput.mockResolvedValueOnce(file)
    openApiUpload.mockResolvedValueOnce({ videoFileId: 'file-1' })

    const result = await runCommand(register, [
      'upload',
      '--file',
      '/tmp/video.mp4',
      '--type',
      'tts',
      '--creator-id',
      'creator-1',
      '--token',
      'token-2',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiPost).not.toHaveBeenCalled()
    expect(openApiUpload).toHaveBeenCalledWith(
      '/api/v1/open/file-upload/tts-video',
      expect.any(FormData),
      { creatorUserOpenId: 'creator-1' },
      { headerName: 'X-UPLOAD-TOKEN', headerValue: 'token-2' }
    )
    expect(printResult).toHaveBeenCalledWith({ videoFileId: 'file-1' })
  })

  it('preserves large numeric creator ids from raw argv in tts upload', async () => {
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' })
    resolveFileInput.mockResolvedValueOnce(file)
    openApiUpload.mockResolvedValueOnce({ videoFileId: 'file-1' })

    const result = await runCommand(register, [
      'upload',
      '--file',
      '/tmp/video.mp4',
      '--type',
      'tts',
      '--creator-id=7123456789012345678',
      '--token',
      'token-raw',
    ])

    expect(result.exitCode).toBeUndefined()
    expect(openApiUpload).toHaveBeenCalledWith(
      '/api/v1/open/file-upload/tts-video',
      expect.any(FormData),
      { creatorUserOpenId: '7123456789012345678' },
      { headerName: 'X-UPLOAD-TOKEN', headerValue: 'token-raw' }
    )
  })
})
