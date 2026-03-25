#!/usr/bin/env node

/**
 * 查询 TTS 商品列表
 *
 * 用法:
 *   # 查询全部商品（shop + showcase 合并去重）
 *   node query-products.mjs --creator-id open_user_abc
 *
 *   # 仅查询店铺商品
 *   node query-products.mjs --creator-id open_user_abc --product-type shop
 *
 *   # 分页查询
 *   node query-products.mjs --creator-id open_user_abc --page-size 10 --cursor eyJ...
 *
 * 参数:
 *   --creator-id    TTS 账号 creatorUserOpenId（必填）
 *   --product-type  商品来源: shop / showcase / all（默认 all）
 *   --page-size     每页数量（默认 20）
 *   --cursor        分页游标（首页不传）
 */

import { openApiPost, parseArgs, requireArgs, printResult } from './api-client.mjs'

const args = parseArgs(process.argv.slice(2))
requireArgs(args, ['creator-id'], 'node query-products.mjs --creator-id <id>')

const creatorId = args['creator-id']
const productType = (args['product-type'] || 'all').toLowerCase()
const pageSize = parseInt(args['page-size'] || '20', 10)
const cursor = args.cursor || ''

/**
 * 从特殊格式提取图片 URL
 * "{height=200, url=https://xxx.jpg, width=200}" → "https://xxx.jpg"
 */
function extractImageUrl(imageStr) {
  const match = imageStr.match(/url=([^,}]+)/)
  return match?.[1]?.trim() ?? imageStr
}

/**
 * 查询单种类型的商品
 */
async function queryProducts(type, pageToken) {
  return openApiPost('/api/v1/open/tts/products/query', {
    creatorUserOpenId: creatorId,
    productType: type,
    pageSize,
    pageToken: pageToken || '',
  })
}

try {
  // 解码游标
  let shopToken = ''
  let showcaseToken = ''
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString())
      shopToken = decoded.shopToken || ''
      showcaseToken = decoded.showcaseToken || ''
    } catch {
      console.error('错误: 无效的 cursor 格式')
      process.exit(1)
    }
  }

  const typesToQuery = productType === 'all' ? ['shop', 'showcase'] : [productType]
  const allProducts = new Map() // 按 id 去重
  let nextShopToken = null
  let nextShowcaseToken = null

  // 并行查询
  const results = await Promise.allSettled(
    typesToQuery.map(async (type) => {
      const token = type === 'shop' ? shopToken : showcaseToken
      const data = await queryProducts(type, token)
      return { type, data }
    })
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`查询失败:`, result.reason?.message)
      continue
    }

    const { type, data } = result.value
    const items = Array.isArray(data) ? data : [data]

    for (const group of items) {
      if (type === 'shop') nextShopToken = group.nextPageToken ?? null
      if (type === 'showcase') nextShowcaseToken = group.nextPageToken ?? null

      for (const product of group.products || []) {
        if (!allProducts.has(product.id)) {
          allProducts.set(product.id, {
            id: product.id,
            title: product.title,
            price: product.price,
            images: (product.images || []).map(extractImageUrl),
            salesCount: product.salesCount ?? 0,
            brandName: product.brandName ?? '',
            shopName: product.shopName ?? '',
            source: product.source ?? type,
            reviewStatus: product.reviewStatus,
            inventoryStatus: product.inventoryStatus,
          })
        }
      }
    }
  }

  const productList = Array.from(allProducts.values())

  // 构建下一页游标
  let nextCursor = null
  if (nextShopToken || nextShowcaseToken) {
    nextCursor = Buffer.from(
      JSON.stringify({ shopToken: nextShopToken || '', showcaseToken: nextShowcaseToken || '' })
    ).toString('base64')
  }

  console.log(`查询到 ${productList.length} 个商品:\n`)

  for (const p of productList) {
    console.log(`  [${p.source}] ${p.title}`)
    console.log(`    ID: ${p.id}  销量: ${p.salesCount}  品牌: ${p.brandName}`)
    if (p.images.length > 0) console.log(`    图片: ${p.images[0]}`)
    console.log('')
  }

  if (nextCursor) {
    console.log(`下一页游标: ${nextCursor}`)
    console.log(`使用: node query-products.mjs --creator-id ${creatorId} --cursor ${nextCursor}`)
  } else {
    console.log('已到最后一页')
  }

  printResult({ products: productList, nextCursor })
} catch (err) {
  console.error('查询商品失败:', err.message)
  process.exit(1)
}
