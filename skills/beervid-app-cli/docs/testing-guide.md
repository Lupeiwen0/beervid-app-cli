# 测试指南

本文档提供 BEERVID Open API 集成的测试策略和最佳实践。

## 目录

1. [测试策略](#测试策略)
2. [单元测试](#单元测试)
3. [集成测试](#集成测试)
4. [端到端测试](#端到端测试)
5. [Mock 数据](#mock-数据)
6. [测试环境配置](#测试环境配置)
7. [CI/CD 集成](#cicd-集成)

---

## 测试策略

### 测试金字塔

```
       /\
      /E2E\       少量端到端测试
     /------\
    /  集成  \     适量集成测试
   /----------\
  /   单元测试   \   大量单元测试
 /--------------\
```

### 测试覆盖目标

| 层级 | 覆盖率目标 | 重点 |
|------|-----------|------|
| 单元测试 | > 80% | 业务逻辑、工具函数 |
| 集成测试 | > 60% | API 调用、数据流 |
| 端到端测试 | 核心流程 | 关键用户路径 |

---

## 单元测试

### 1. 测试工具函数

```typescript
// src/utils/validation.ts
export function validateBusinessId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0
}

export function truncateProductTitle(title: string, maxLength = 30): string {
  return title.length > maxLength ? title.slice(0, maxLength) : title
}
```

```typescript
// tests/utils/validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateBusinessId, truncateProductTitle } from '@/utils/validation'

describe('validateBusinessId', () => {
  it('should accept valid business IDs', () => {
    expect(validateBusinessId('biz_123')).toBe(true)
    expect(validateBusinessId('7281234567890')).toBe(true)
  })

  it('should reject invalid business IDs', () => {
    expect(validateBusinessId('')).toBe(false)
    expect(validateBusinessId('biz@123')).toBe(false)
    expect(validateBusinessId('biz 123')).toBe(false)
  })
})

describe('truncateProductTitle', () => {
  it('should not truncate short titles', () => {
    expect(truncateProductTitle('Short Title')).toBe('Short Title')
  })

  it('should truncate long titles', () => {
    const longTitle = 'This is a very long product title that exceeds the limit'
    expect(truncateProductTitle(longTitle)).toHaveLength(30)
    expect(truncateProductTitle(longTitle)).toBe(longTitle.slice(0, 30))
  })

  it('should respect custom max length', () => {
    expect(truncateProductTitle('Hello World', 5)).toBe('Hello')
  })
})
```

### 2. 测试 API 客户端

```typescript
// tests/client/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openApiGet, openApiPost } from '@/client'

// Mock fetch
global.fetch = vi.fn()

describe('openApiGet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should make GET request with correct headers', async () => {
    const mockResponse = {
      code: 0,
      success: true,
      data: { url: 'https://example.com' }
    }

    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const result = await openApiGet('/api/v1/open/test')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/open/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-KEY': expect.any(String)
        })
      })
    )

    expect(result).toEqual(mockResponse.data)
  })

  it('should throw error on API failure', async () => {
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 400,
        success: false,
        message: 'Bad Request'
      })
    })

    await expect(openApiGet('/api/v1/open/test')).rejects.toThrow('Bad Request')
  })
})
```

### 3. 测试业务逻辑

```typescript
// tests/workflows/tt-publish.test.ts
import { describe, it, expect, vi } from 'vitest'
import { publishTTFlow } from '@/workflows'

vi.mock('@/client', () => ({
  getUploadToken: vi.fn().mockResolvedValue('token_123'),
  uploadVideo: vi.fn().mockResolvedValue('https://cdn.beervid.ai/video.mp4'),
  publishVideo: vi.fn().mockResolvedValue('share_abc'),
  pollStatus: vi.fn().mockResolvedValue({
    status: 'PUBLISH_COMPLETE',
    post_ids: ['7123456789012345678']
  }),
  queryVideo: vi.fn().mockResolvedValue({
    playCount: 100,
    likeCount: 10
  })
}))

describe('publishTTFlow', () => {
  it('should complete full TT publish flow', async () => {
    const result = await publishTTFlow({
      businessId: 'biz_123',
      file: new File([''], 'video.mp4'),
      caption: 'Test video'
    })

    expect(result).toMatchObject({
      success: true,
      videoId: '7123456789012345678',
      stats: expect.objectContaining({
        playCount: 100,
        likeCount: 10
      })
    })
  })
})
```

---

## 集成测试

### 1. 测试 API 集成

```typescript
// tests/integration/api.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { openApiGet } from '@/client'

// 使用测试环境的真实 API
describe('API Integration', () => {
  beforeAll(() => {
    // 确保使用测试环境配置
    process.env.BEERVID_APP_KEY = process.env.TEST_API_KEY
    process.env.BEERVID_APP_BASE_URL = 'https://test.beervid.ai'
  })

  it('should get TT OAuth URL', async () => {
    const url = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')

    expect(url).toMatch(/^https:\/\/www\.tiktok\.com/)
    expect(url).toContain('client_key')
  })

  it('should handle invalid API key', async () => {
    process.env.BEERVID_APP_KEY = 'invalid_key'

    await expect(
      openApiGet('/api/v1/open/thirdparty-auth/tt-url')
    ).rejects.toThrow(/401|Unauthorized/)
  })
})
```

### 2. 测试数据库集成

```typescript
// tests/integration/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'

describe('Database Integration', () => {
  beforeEach(async () => {
    // 清理测试数据
    await db.accounts.deleteMany({ where: { userId: 'test_user' } })
  })

  afterEach(async () => {
    // 清理测试数据
    await db.accounts.deleteMany({ where: { userId: 'test_user' } })
  })

  it('should save and retrieve account', async () => {
    const account = await db.accounts.create({
      data: {
        userId: 'test_user',
        accountType: 'TT',
        accountId: 'biz_123',
        username: 'test_account'
      }
    })

    expect(account.id).toBeDefined()

    const retrieved = await db.accounts.findUnique({
      where: { id: account.id }
    })

    expect(retrieved).toMatchObject({
      userId: 'test_user',
      accountType: 'TT',
      accountId: 'biz_123'
    })
  })
})
```

---

## 端到端测试

### 1. 使用 Playwright

```typescript
// tests/e2e/publish-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('TT Publish Flow', () => {
  test('should complete full publish flow', async ({ page }) => {
    // 登录
    await page.goto('/login')
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'password')
    await page.click('button[type="submit"]')

    // 等待跳转到仪表板
    await expect(page).toHaveURL('/dashboard')

    // 点击发布按钮
    await page.click('text=发布视频')

    // 上传视频
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/video.mp4')

    // 填写标题
    await page.fill('[name="caption"]', 'Test video from E2E')

    // 提交发布
    await page.click('button:has-text("发布")')

    // 等待发布完成
    await expect(page.locator('text=发布成功')).toBeVisible({ timeout: 60000 })

    // 验证视频出现在列表中
    await page.goto('/videos')
    await expect(page.locator('text=Test video from E2E')).toBeVisible()
  })
})
```

### 2. CLI 端到端测试

```typescript
// tests/e2e/cli.test.ts
import { describe, it, expect } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

describe('CLI E2E', () => {
  it('should show help', async () => {
    const { stdout } = await execAsync('beervid --help')
    expect(stdout).toContain('beervid')
    expect(stdout).toContain('config')
    expect(stdout).toContain('upload')
  })

  it('should get OAuth URL', async () => {
    const { stdout } = await execAsync('beervid get-oauth-url --type tt')
    const result = JSON.parse(stdout)
    expect(result.url).toMatch(/^https:\/\/www\.tiktok\.com/)
  })
})
```

---

## Mock 数据

### 1. Mock API 响应

```typescript
// tests/mocks/api-responses.ts
export const mockOAuthUrl = {
  code: 0,
  success: true,
  message: 'ok',
  data: 'https://www.tiktok.com/v2/auth/authorize?client_key=test'
}

export const mockAccountInfo = {
  code: 0,
  success: true,
  data: {
    accountType: 'TT',
    accountId: '7281234567890',
    username: 'test_user',
    displayName: 'Test User',
    profileUrl: 'https://example.com/avatar.jpg',
    followersCount: 1000
  }
}

export const mockUploadToken = {
  code: 0,
  success: true,
  data: {
    uploadToken: 'token_abc123',
    uploadUrl: 'https://upload.beervid.ai'
  }
}

export const mockPublishResponse = {
  code: 0,
  success: true,
  data: {
    shareId: 'share_abc123'
  }
}

export const mockPollStatus = {
  code: 0,
  success: true,
  data: {
    status: 'PUBLISH_COMPLETE',
    post_ids: ['7123456789012345678']
  }
}

export const mockVideoStats = {
  code: 0,
  success: true,
  data: {
    videos: [{
      itemId: '7123456789012345678',
      playCount: 1000,
      likeCount: 100,
      commentCount: 10,
      shareCount: 5,
      shareUrl: 'https://www.tiktok.com/@user/video/7123456789012345678'
    }]
  }
}
```

### 2. Mock 服务器（MSW）

```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node'
import { rest } from 'msw'
import * as responses from './api-responses'

export const server = setupServer(
  rest.get('https://open.beervid.ai/api/v1/open/thirdparty-auth/tt-url', (req, res, ctx) => {
    return res(ctx.json(responses.mockOAuthUrl))
  }),

  rest.post('https://open.beervid.ai/api/v1/open/account/info', (req, res, ctx) => {
    return res(ctx.json(responses.mockAccountInfo))
  }),

  rest.post('https://open.beervid.ai/api/v1/open/upload-token/generate', (req, res, ctx) => {
    return res(ctx.json(responses.mockUploadToken))
  })
)

// 测试设置
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### 3. 使用 Mock 服务器

```typescript
// tests/integration/with-mock.test.ts
import { describe, it, expect } from 'vitest'
import { server } from '../mocks/server'
import { openApiGet } from '@/client'

describe('API with Mock Server', () => {
  it('should get OAuth URL', async () => {
    const url = await openApiGet<string>('/api/v1/open/thirdparty-auth/tt-url')
    expect(url).toBe('https://www.tiktok.com/v2/auth/authorize?client_key=test')
  })
})
```

---

## 测试环境配置

### 1. 环境变量

```bash
# .env.test
BEERVID_APP_KEY=test_key_123
BEERVID_APP_BASE_URL=https://test.beervid.ai
DATABASE_URL=postgresql://test:test@localhost:5432/beervid_test
```

### 2. Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

### 3. 测试设置文件

```typescript
// tests/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'
import dotenv from 'dotenv'

// 加载测试环境变量
dotenv.config({ path: '.env.test' })

// 设置 Mock 服务器
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// 全局测试超时
vi.setConfig({ testTimeout: 10000 })
```

---

## CI/CD 集成

### 1. GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: beervid_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run typecheck

      - name: Run tests
        env:
          BEERVID_APP_KEY: ${{ secrets.TEST_API_KEY }}
          DATABASE_URL: postgresql://postgres:test@localhost:5432/beervid_test
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### 2. 测试脚本

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test"
  }
}
```

---

## 测试最佳实践

### 1. 遵循 AAA 模式

```typescript
it('should truncate long product titles', () => {
  // Arrange（准备）
  const longTitle = 'This is a very long product title'

  // Act（执行）
  const result = truncateProductTitle(longTitle, 10)

  // Assert（断言）
  expect(result).toBe('This is a ')
  expect(result).toHaveLength(10)
})
```

### 2. 使用描述性测试名称

```typescript
// ❌ 不好
it('test 1', () => { ... })

// ✅ 好
it('should return 401 when API key is invalid', () => { ... })
```

### 3. 测试边界情况

```typescript
describe('validateBusinessId', () => {
  it('should handle empty string', () => {
    expect(validateBusinessId('')).toBe(false)
  })

  it('should handle very long IDs', () => {
    const longId = 'a'.repeat(1000)
    expect(validateBusinessId(longId)).toBe(true)
  })

  it('should handle special characters', () => {
    expect(validateBusinessId('biz@123')).toBe(false)
    expect(validateBusinessId('biz_123')).toBe(true)
    expect(validateBusinessId('biz-123')).toBe(true)
  })
})
```

### 4. 避免测试实现细节

```typescript
// ❌ 测试实现细节
it('should call fetch with correct URL', () => {
  expect(fetch).toHaveBeenCalledWith('https://...')
})

// ✅ 测试行为
it('should return OAuth URL', async () => {
  const url = await getOAuthUrl('tt')
  expect(url).toMatch(/^https:\/\/www\.tiktok\.com/)
})
```

### 5. 保持测试独立

```typescript
// ❌ 测试相互依赖
let sharedState: any

it('test 1', () => {
  sharedState = { value: 1 }
})

it('test 2', () => {
  expect(sharedState.value).toBe(1) // 依赖 test 1
})

// ✅ 测试独立
it('test 1', () => {
  const state = { value: 1 }
  expect(state.value).toBe(1)
})

it('test 2', () => {
  const state = { value: 1 }
  expect(state.value).toBe(1)
})
```

---

## 相关文档

- [故障排查指南](./troubleshooting.md)
- [安全最佳实践](./security-best-practices.md)
- [性能与限流](./performance-and-limits.md)
- [示例工程](../example/)
