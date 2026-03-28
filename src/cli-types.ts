import type {
  AccountType,
  OAuthAccountType,
  ProductType,
  PublishType,
  UploadType,
} from './types/index.js'

export type CliCommandName =
  | 'config'
  | 'get-oauth-url'
  | 'get-account-info'
  | 'upload'
  | 'publish'
  | 'poll-status'
  | 'query-video'
  | 'query-products'
  | 'publish-tt-flow'
  | 'publish-tts-flow'

export interface ConfigCommandOptions {
  appKey?: string
  baseUrl?: string
  show?: boolean
}

export interface GetOAuthUrlCommandOptions {
  type?: OAuthAccountType | string
}

export interface GetAccountInfoCommandOptions {
  type?: AccountType | string
  accountId?: string
}

export interface UploadCommandOptions {
  file?: string
  type?: UploadType | string
  creatorId?: string
  token?: string
}

export interface PublishCommandOptions {
  type?: PublishType | string
  businessId?: string
  videoUrl?: string
  creatorId?: string
  fileId?: string
  productId?: string
  productTitle?: string
  caption?: string
  brandOrganic?: boolean
  brandedContent?: boolean
  disableComment?: boolean
  disableDuet?: boolean
  disableStitch?: boolean
  thumbnailOffset?: string
}

export interface PollStatusCommandOptions {
  businessId?: string
  shareId?: string
  interval?: string
  maxPolls?: string
}

export interface QueryVideoCommandOptions {
  businessId?: string
  itemIds?: string
  cursor?: string
  maxCount?: string
}

export interface QueryProductsCommandOptions {
  creatorId?: string
  productType?: ProductType | string
  pageSize?: string
  cursor?: string
}

export interface PublishTTFlowCommandOptions {
  businessId?: string
  file?: string
  caption?: string
  token?: string
  brandOrganic?: boolean
  brandedContent?: boolean
  disableComment?: boolean
  disableDuet?: boolean
  disableStitch?: boolean
  thumbnailOffset?: string
  interval?: string
  maxPolls?: string
  queryInterval?: string
  queryMaxAttempts?: string
}

export interface PublishTTSFlowCommandOptions {
  creatorId?: string
  file?: string
  caption?: string
  token?: string
  productType?: ProductType | string
  pageSize?: string
  maxProductPages?: string
  productId?: string
  productTitle?: string
  interactive?: boolean
}
