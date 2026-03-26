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

    // 解析商品图片 URL
    const groups = Array.isArray(data) ? data : [data]
    for (const group of groups as Array<{ products?: Array<{ images?: string[] }> }>) {
      for (const product of group.products ?? []) {
        if (product.images) {
          product.images = product.images.map((img: string) => {
            const match = img.match(/url=([^,}]+)/)
            return match?.[1]?.trim() ?? img
          })
        }
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
