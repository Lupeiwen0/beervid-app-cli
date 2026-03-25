/**
 * BEERVID Open API — 共用基础模块
 *
 * 提供统一的认证、请求、错误处理能力，供其他脚本 import 使用。
 *
 * 环境变量：
 *   BEERVID_APP_KEY      — API 密钥
 *   BEERVID_APP_BASE_URL — API 基础地址（默认 https://open.beervid.ai）
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── 环境变量 ────────────────────────────────────────────────────

export function getApiKey() {
  const key = process.env.BEERVID_APP_KEY
  if (!key) {
    console.error('错误: 请设置环境变量 BEERVID_APP_KEY')
    process.exit(1)
  }
  return key
}

export function getBaseUrl() {
  return process.env.BEERVID_APP_BASE_URL || 'https://open.beervid.ai'
}

// ─── 通用请求 ────────────────────────────────────────────────────

/**
 * GET 请求
 * @param {string} path - API 路径，如 /api/v1/open/xxx
 * @param {Record<string, string>} [params] - query 参数
 * @returns {Promise<any>} data 字段
 */
export async function openApiGet(path, params) {
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

  return handleResponse(res, path)
}

/**
 * POST 请求（JSON body）
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<any>} data 字段
 */
export async function openApiPost(path, body) {
  const url = new URL(path, getBaseUrl())

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return handleResponse(res, path)
}

/**
 * 文件上传（FormData）
 * @param {string} path
 * @param {FormData} formData
 * @param {Record<string, string>} [params] - query 参数
 * @param {{ headerName?: string; headerValue?: string }} [auth] - 自定义认证头
 * @returns {Promise<any>} data 字段
 */
export async function openApiUpload(path, formData, params, auth) {
  const url = new URL(path, getBaseUrl())
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const headerName = auth?.headerName || 'X-API-KEY'
  const headerValue = auth?.headerValue || getApiKey()

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { [headerName]: headerValue },
    body: formData,
  })

  return handleResponse(res, path)
}

// ─── 响应处理 ────────────────────────────────────────────────────

async function handleResponse(res, path) {
  if (!res.ok && res.status >= 500) {
    throw new Error(`HTTP ${res.status} — ${path}`)
  }

  const json = await res.json()

  if (json.code !== 0 || !json.success) {
    throw new Error(
      `Open API 错误 [${path}]: ${json.message || '未知错误'} (code: ${json.code})`
    )
  }

  return json.data
}

// ─── 文件处理工具 ────────────────────────────────────────────────

/**
 * 判断输入是 URL 还是本地文件路径
 * @param {string} input
 * @returns {'url' | 'file'}
 */
export function detectInputType(input) {
  if (/^https?:\/\//i.test(input)) return 'url'
  return 'file'
}

/**
 * 将本地文件读取为可上传的 File 对象
 * @param {string} filePath
 * @returns {File}
 */
export function localFileToFile(filePath) {
  const absPath = resolve(filePath)
  if (!existsSync(absPath)) {
    console.error(`错误: 文件不存在 — ${absPath}`)
    process.exit(1)
  }

  const buffer = readFileSync(absPath)
  const fileName = absPath.split('/').pop()
  const ext = fileName.split('.').pop()?.toLowerCase()
  const mimeMap = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
  }
  const contentType = mimeMap[ext] || 'application/octet-stream'

  return new File([buffer], fileName, { type: contentType })
}

/**
 * 从 URL 下载文件并转为 File 对象
 * @param {string} url
 * @returns {Promise<File>}
 */
export async function urlToFile(url) {
  console.log(`正在下载: ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载失败: HTTP ${res.status} — ${url}`)
  }

  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') || 'video/mp4'

  // 从 URL 提取文件名
  const urlPath = new URL(url).pathname
  const fileName = urlPath.split('/').pop() || 'video.mp4'

  console.log(`下载完成: ${fileName} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`)
  return new File([buffer], fileName, { type: contentType })
}

/**
 * 将入参（URL 或本地路径）统一转为 File 对象
 * @param {string} input - URL 或本地文件路径
 * @returns {Promise<File>}
 */
export async function resolveFileInput(input) {
  if (detectInputType(input) === 'url') {
    return urlToFile(input)
  }
  return localFileToFile(input)
}

// ─── CLI 工具 ─────────────────────────────────────────────────────

/**
 * 解析命令行参数为键值对
 * 支持格式: --key value 或 --key=value
 * @param {string[]} args - process.argv.slice(2)
 * @returns {Record<string, string>}
 */
export function parseArgs(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex !== -1) {
        result[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1)
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result[arg.slice(2)] = args[i + 1]
        i++
      } else {
        result[arg.slice(2)] = 'true'
      }
    }
  }
  return result
}

/**
 * 校验必填参数，缺失时打印用法并退出
 * @param {Record<string, string>} args
 * @param {string[]} required - 必填参数名
 * @param {string} usage - 用法说明
 */
export function requireArgs(args, required, usage) {
  const missing = required.filter((k) => !args[k])
  if (missing.length > 0) {
    console.error(`缺少必填参数: ${missing.join(', ')}\n`)
    console.error(`用法: ${usage}`)
    process.exit(1)
  }
}

/**
 * 输出结果并退出
 * @param {any} data
 */
export function printResult(data) {
  console.log(JSON.stringify(data, null, 2))
}
