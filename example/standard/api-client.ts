/**
 * BEERVID Open API 通用客户端封装
 *
 * 提供 openApiGet / openApiPost / openApiUpload 三个基础请求函数，
 * 包含统一的认证、错误处理和可选的重试机制。
 *
 * 使用方式：
 *   import { openApiGet, openApiPost, openApiUpload } from './api-client.js'
 */

// ─── 环境配置 ───────────────────────────────────────────────────────────────

const API_KEY = process.env['BEERVID_APP_KEY'] ?? ''
const BASE_URL = process.env['BEERVID_APP_BASE_URL'] ?? 'https://open.beervid.ai'

if (!API_KEY) {
  console.error('错误: 请设置环境变量 BEERVID_APP_KEY')
  console.error('  export BEERVID_APP_KEY="your-api-key"')
  process.exit(1)
}

// ─── 类型定义 ───────────────────────────────────────────────────────────────

interface OpenApiResponse<T> {
  code: number
  message: string
  data: T
  error: boolean
  success: boolean
}

// ─── 响应处理 ───────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok && res.status >= 500) {
    throw new Error(`HTTP ${res.status} — ${path}`)
  }

  const json = (await res.json()) as OpenApiResponse<T>

  if (json.code !== 0 || !json.success) {
    throw new Error(
      `Open API 错误 [${path}]: ${json.message ?? '未知错误'} (code: ${json.code})`
    )
  }

  return json.data
}

// ─── GET 请求 ───────────────────────────────────────────────────────────────

export async function openApiGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
  })

  return handleResponse<T>(res, path)
}

// ─── POST 请求 ──────────────────────────────────────────────────────────────

export async function openApiPost<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(path, BASE_URL)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return handleResponse<T>(res, path)
}

// ─── 文件上传 ───────────────────────────────────────────────────────────────

export async function openApiUpload<T>(
  path: string,
  formData: FormData,
  options?: {
    params?: Record<string, string>
    uploadToken?: string
  }
): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  // 上传使用 X-UPLOAD-TOKEN 认证（非 X-API-KEY）
  const headerName = options?.uploadToken ? 'X-UPLOAD-TOKEN' : 'X-API-KEY'
  const headerValue = options?.uploadToken ?? API_KEY

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { [headerName]: headerValue },
    body: formData,
  })

  return handleResponse<T>(res, path)
}

// ─── 重试封装 ───────────────────────────────────────────────────────────────

interface RetryOptions {
  maxRetries: number
  baseDelay: number
  label?: string
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxRetries: 3, baseDelay: 1000 }
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error

      if (attempt > options.maxRetries) break

      // 只重试网络错误和 5xx
      const msg = lastError.message
      const isRetryable =
        msg.includes('fetch failed') ||
        msg.includes('ECONNRESET') ||
        /HTTP 5\d\d/.test(msg)
      if (!isRetryable) break

      const delay = options.baseDelay * Math.pow(2, attempt - 1)
      const label = options.label ?? 'API 调用'
      console.warn(`${label} 第 ${attempt} 次失败，${(delay / 1000).toFixed(1)}s 后重试...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw lastError
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 轮询间隔策略（阶梯递增）
 *
 * 前 6 次（0-30s）：每 5 秒   → 覆盖大部分快速完成的场景
 * 第 7-12 次（30s-90s）：每 10 秒  → 中等耗时视频
 * 第 13 次起（90s+）：每 15 秒     → 长耗时视频，降低 API 压力
 */
export function getPollingInterval(pollCount: number): number {
  if (pollCount <= 6) return 5_000
  if (pollCount <= 12) return 10_000
  return 15_000
}
