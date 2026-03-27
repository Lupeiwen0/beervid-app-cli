/**
 * BEERVID Open API — 服务端客户端封装
 *
 * 仅在服务端使用（API Route / Server Component），
 * 通过环境变量读取配置，不暴露给客户端。
 */

// ─── 配置 ───────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env['BEERVID_APP_KEY']
  if (!key) throw new Error('缺少环境变量 BEERVID_APP_KEY')
  return key
}

function getBaseUrl(): string {
  return process.env['BEERVID_APP_BASE_URL'] ?? 'https://open.beervid.ai'
}

// ─── 类型 ───────────────────────────────────────────────────────────────────

interface OpenApiResponse<T> {
  code: number
  message: string
  data: T
  success: boolean
}

// ─── 响应处理 ───────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok && res.status >= 500) {
    throw new Error(`HTTP ${res.status} — ${path}`)
  }
  const json = (await res.json()) as OpenApiResponse<T>
  if (json.code !== 0 || !json.success) {
    throw new Error(`Open API 错误 [${path}]: ${json.message} (code: ${json.code})`)
  }
  return json.data
}

// ─── 请求函数 ───────────────────────────────────────────────────────────────

export async function openApiGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, getBaseUrl())
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
    cache: 'no-store',
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
    headers: { 'X-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  return handleResponse<T>(res, path)
}

export async function openApiUpload<T>(
  path: string,
  formData: FormData,
  options?: { params?: Record<string, string>; uploadToken?: string }
): Promise<T> {
  const url = new URL(path, getBaseUrl())
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) url.searchParams.set(k, v)
  }
  const headerName = options?.uploadToken ? 'X-UPLOAD-TOKEN' : 'X-API-KEY'
  const headerValue = options?.uploadToken ?? getApiKey()
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { [headerName]: headerValue },
    body: formData,
  })
  return handleResponse<T>(res, path)
}

// ─── 轮询策略 ───────────────────────────────────────────────────────────────

/**
 * 阶梯递增轮询间隔（毫秒）
 * 前 6 次：5s → 7-12 次：10s → 之后：15s
 */
export function getPollingInterval(pollCount: number): number {
  if (pollCount <= 6) return 5_000
  if (pollCount <= 12) return 10_000
  return 15_000
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
