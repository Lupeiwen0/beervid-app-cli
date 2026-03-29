/**
 * GET /api/products?creatorId=xxx&type=shop&pageSize=20&pageToken=
 * 查询 TTS 商品列表
 */
import { NextRequest, NextResponse } from 'next/server'
import { openApiPost } from '@/lib/beervid-client'

export async function GET(request: NextRequest) {
  const creatorId = request.nextUrl.searchParams.get('creatorId')
  const productType = request.nextUrl.searchParams.get('type') ?? 'shop'
  const pageSize = parseInt(request.nextUrl.searchParams.get('pageSize') ?? '20', 10)
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? ''

  if (!creatorId) {
    return NextResponse.json({ error: '缺少 creatorId 参数' }, { status: 400 })
  }

  try {
    const data = await openApiPost('/api/v1/open/tts/products/query', {
      creatorUserOpenId: creatorId,
      productType,
      pageSize,
      pageToken,
    })

    // 解析商品图片 URL + 按 id 去重
    const groups = Array.isArray(data) ? data : [data]
    const seen = new Set<string>()
    const list: Record<string, unknown>[] = []
    let nextPageToken: string | null = null

    for (const group of groups as Array<{ products?: Array<Record<string, unknown>>; nextPageToken?: string | null }>) {
      for (const product of group.products ?? []) {
        const id = product['id'] as string
        if (seen.has(id)) continue
        seen.add(id)

        if (Array.isArray(product['images'])) {
          product['images'] = (product['images'] as string[]).map((img) => {
            const match = img.match(/url=([^,}]+)/)
            return match?.[1]?.trim() ?? img
          })
        }

        list.push(product)
      }
      if (group.nextPageToken !== undefined) {
        nextPageToken = group.nextPageToken ?? null
      }
    }

    return NextResponse.json({ success: true, data: { list, nextPageToken } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
