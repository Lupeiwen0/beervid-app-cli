import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { loadConfig } from '../config.js'

// ─── Environment ──────────────────────────────────────────────────────────────

export function getApiKey(): string {
  const key = process.env['BEERVID_APP_KEY'] || loadConfig().appKey
  if (!key) {
    console.error('错误: 请先设置 APP_KEY，任选一种方式:')
    console.error('  1. beervid config --app-key <your-key>')
    console.error('  2. export BEERVID_APP_KEY=<your-key>')
    process.exit(1)
  }
  return key
}

export function getBaseUrl(): string {
  return process.env['BEERVID_APP_BASE_URL'] || loadConfig().baseUrl || 'https://open.beervid.ai'
}

// ─── Response handling ────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok && res.status >= 500) {
    throw new Error(`HTTP ${res.status} — ${path}`)
  }

  const json = (await res.json()) as { code: number; success: boolean; message?: string; data: T }

  if (json.code !== 0 || !json.success) {
    throw new Error(
      `Open API 错误 [${path}]: ${json.message ?? '未知错误'} (code: ${json.code})`
    )
  }

  return json.data
}

// ─── Request helpers ──────────────────────────────────────────────────────────

export async function openApiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, getBaseUrl())
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
    },
  })

  return handleResponse<T>(res, path)
}

export async function openApiPost<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(path, getBaseUrl())

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return handleResponse<T>(res, path)
}

export async function openApiUpload<T>(
  path: string,
  formData: FormData,
  params?: Record<string, string>,
  auth?: { headerName?: string; headerValue?: string }
): Promise<T> {
  const url = new URL(path, getBaseUrl())
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const headerName = auth?.headerName ?? 'X-API-KEY'
  const headerValue = auth?.headerValue ?? getApiKey()

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { [headerName]: headerValue },
    body: formData,
  })

  return handleResponse<T>(res, path)
}

// ─── File utilities ───────────────────────────────────────────────────────────

export function detectInputType(input: string): 'url' | 'file' {
  if (/^https?:\/\//i.test(input)) return 'url'
  return 'file'
}

export function localFileToFile(filePath: string): File {
  const absPath = resolve(filePath)
  if (!existsSync(absPath)) {
    console.error(`错误: 文件不存在 — ${absPath}`)
    process.exit(1)
  }

  const buffer = readFileSync(absPath)
  const fileName = basename(absPath)
  const ext = fileName.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
  }
  const contentType = (ext && mimeMap[ext]) ? mimeMap[ext]! : 'application/octet-stream'

  return new File([buffer], fileName, { type: contentType })
}

export async function urlToFile(url: string): Promise<File> {
  console.log(`正在下载: ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载失败: HTTP ${res.status} — ${url}`)
  }

  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'video/mp4'

  const urlPath = new URL(url).pathname
  const fileName = urlPath.split('/').pop() ?? 'video.mp4'

  console.log(`下载完成: ${fileName} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`)
  return new File([buffer], fileName, { type: contentType })
}

export async function resolveFileInput(input: string): Promise<File> {
  if (detectInputType(input) === 'url') {
    return urlToFile(input)
  }
  return localFileToFile(input)
}

// ─── Output ───────────────────────────────────────────────────────────────────

export function printResult(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}
