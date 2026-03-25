// ─── Shared response envelope ────────────────────────────────────────────────

export interface OpenApiResponse<T> {
  code: number
  message: string
  data: T
  error: boolean
  success: boolean
}

// ─── Account types ────────────────────────────────────────────────────────────

/** API-level account type (uppercase) */
export type AccountType = 'TT' | 'TTS'

/** CLI --type param for OAuth (lowercase) */
export type OAuthAccountType = 'tt' | 'tts'

// ─── Publish types ────────────────────────────────────────────────────────────

export type PublishType = 'normal' | 'shoppable'

// ─── Upload types ─────────────────────────────────────────────────────────────

export type UploadType = 'normal' | 'tts'

// ─── Product types ────────────────────────────────────────────────────────────

export type ProductType = 'shop' | 'showcase' | 'all'

// ─── Video status ─────────────────────────────────────────────────────────────

export type VideoStatus = 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED' | string

// ─── OAuth ────────────────────────────────────────────────────────────────────

export interface TtOAuthUrlData {
  url: string
}

export interface TtsOAuthUrlData {
  crossBorderUrl: string
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadTokenData {
  uploadToken: string
  expiresIn: number
}

export interface NormalUploadResult {
  fileUrl: string
  [key: string]: unknown
}

export interface TtsUploadResult {
  videoFileId: string
  [key: string]: unknown
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface NormalPublishResult {
  shareId: string
  [key: string]: unknown
}

export interface ShoppablePublishResult {
  videoId: string
  [key: string]: unknown
}

// ─── Poll status ──────────────────────────────────────────────────────────────

export interface VideoStatusData {
  status?: VideoStatus
  Status?: VideoStatus
  reason?: string
  post_ids?: string[]
  [key: string]: unknown
}

// ─── Query video ──────────────────────────────────────────────────────────────

export interface RawVideoItem {
  itemId?: string
  item_id?: string
  videoViews?: number
  video_views?: number
  likes?: number
  comments?: number
  shares?: number
  thumbnailUrl?: string
  thumbnail_url?: string
  shareUrl?: string
  share_url?: string
  [key: string]: unknown
}

export interface NormalizedVideoItem {
  itemId: string | undefined
  videoViews: number
  likes: number
  comments: number
  shares: number
  thumbnailUrl: string
  shareUrl: string
}

export interface QueryVideoData {
  videoList?: RawVideoItem[]
  videos?: RawVideoItem[]
  [key: string]: unknown
}

// ─── Query products ───────────────────────────────────────────────────────────

export interface RawProductItem {
  id: string
  title: string
  price?: unknown
  images?: string[]
  salesCount?: number
  brandName?: string
  shopName?: string
  source?: string
  reviewStatus?: string
  inventoryStatus?: string
  [key: string]: unknown
}

export interface NormalizedProductItem {
  id: string
  title: string
  price: unknown
  images: string[]
  salesCount: number
  brandName: string
  shopName: string
  source: string
  reviewStatus: string | undefined
  inventoryStatus: string | undefined
}

export interface ProductPageData {
  nextPageToken?: string | null
  products?: RawProductItem[]
  [key: string]: unknown
}

export interface ProductCursor {
  shopToken: string
  showcaseToken: string
}
