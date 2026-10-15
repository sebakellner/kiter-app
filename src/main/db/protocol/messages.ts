import type {
  LibrarySample,
  FavoriteState,
} from '../../../shared/ipc/library.ts'
import type {
  LocalProfile,
  ProfileUpdateRequest,
  UserProfile,
  UserPreferences,
} from '../../../shared/domain/profile.ts'
import {
  isPreviewVolume,
  isUserProfile,
  requireProfileUpdate,
} from '../../../shared/domain/profile.ts'
import type { AssetRequest, AssetReply } from './assets.ts'
import { isAssetRequest, isAssetReply } from './assets.ts'
import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { isDiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import type { DbFailure } from '../errors.ts'
import type { SampleRequest, SampleReply } from './samples.ts'
import { isSampleRequest, isSampleReply } from './samples.ts'
import type { PackRequest, PackReply } from './packs.ts'
import { isPackRequest, isPackReply } from './packs.ts'
import type { CollectionRequest, CollectionReply } from './collections.ts'
import { isCollectionRequest, isCollectionReply } from './collections.ts'
import type {
  ClassificationRequest,
  ClassificationReply,
} from './classification.ts'
import {
  isClassificationRequest,
  isClassificationReply,
} from './classification.ts'

export type DbRequest =
  | (AssetRequest & { requestId: number })
  | (SampleRequest & { requestId: number })
  | (PackRequest & { requestId: number })
  | (CollectionRequest & { requestId: number })
  | (ClassificationRequest & { requestId: number })
  | {
      requestId: number
      action: 'import'
      root: string
      files: DiscoveredAudioFile[]
    }
  | { requestId: number; action: 'favorite'; id: string; favorite: boolean }
  | { requestId: number; action: 'profile' }
  | { requestId: number; action: 'update-profile'; input: ProfileUpdateRequest }
  | { requestId: number; action: 'volume'; volume: number }
  | { requestId: number; action: 'close' }

export type DbReply =
  | (AssetReply & { requestId: number })
  | (SampleReply & { requestId: number })
  | (PackReply & { requestId: number })
  | (CollectionReply & { requestId: number })
  | (ClassificationReply & { requestId: number })
  | { action: 'ready' }
  | { action: 'fatal'; failure: DbFailure }
  | { requestId: number; action: 'import'; result: LibrarySample[] }
  | { requestId: number; action: 'favorite'; result: FavoriteState }
  | { requestId: number; action: 'profile'; result: LocalProfile }
  | { requestId: number; action: 'update-profile'; result: UserProfile }
  | { requestId: number; action: 'volume'; result: UserPreferences }
  | { requestId: number; action: 'close' }
  | { requestId: number; action: 'error'; failure: DbFailure }

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isFailure(value: unknown): value is DbFailure {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    [
      'INVALID_INPUT',
      'UNSUPPORTED_FORMAT',
      'UNSUPPORTED_VERSION',
      'DB_INTEGRITY',
      'NOT_FOUND',
      'NAME_CONFLICT',
      'STALE_REVIEW',
      'STORAGE_FAILED',
      'WORKER_FAILED',
      'PROTOCOL_ERROR',
      'CLOSING',
    ].some((code) => code === value.code)
  )
}

function isPreferences(value: unknown): value is UserPreferences {
  return (
    isRecord(value) &&
    isEntityId(value.profileId) &&
    isPreviewVolume(value.previewVolume)
  )
}

function isProfile(value: unknown): value is LocalProfile {
  if (
    !isRecord(value) ||
    !isRecord(value.profile) ||
    !isPreferences(value.preferences)
  ) {
    return false
  }
  const profile = value.profile
  return isUserProfile(profile) && value.preferences.profileId === profile.id
}

export function isDbRequest(value: unknown): value is DbRequest {
  if (!isRecord(value) || !isRequestId(value.requestId)) {
    return false
  }
  switch (value.action) {
    case 'import':
      return (
        typeof value.root === 'string' &&
        Array.isArray(value.files) &&
        value.files.every(isDiscoveredAudioFile)
      )
    case 'favorite':
      return isEntityId(value.id) && typeof value.favorite === 'boolean'
    case 'volume':
      return isPreviewVolume(value.volume)
    case 'update-profile':
      try {
        requireProfileUpdate(value.input)
        return true
      } catch {
        return false
      }
    case 'profile':
    case 'close':
      return true
    default:
      return (
        isClassificationRequest(value) ||
        isAssetRequest(value) ||
        isCollectionRequest(value) ||
        isPackRequest(value) ||
        isSampleRequest(value)
      )
  }
}

export function isDbReply(value: unknown): value is DbReply {
  if (!isRecord(value)) {
    return false
  }
  if (value.action === 'ready') {
    return true
  }
  if (value.action === 'fatal') {
    return isFailure(value.failure)
  }
  if (!isRequestId(value.requestId)) {
    return false
  }
  switch (value.action) {
    case 'import':
      return (
        Array.isArray(value.result) &&
        value.result.every(
          (file) =>
            isRecord(file) &&
            typeof file.name === 'string' &&
            typeof file.path === 'string' &&
            typeof file.relativePath === 'string' &&
            isEntityId(file.id) &&
            typeof file.favorite === 'boolean',
        )
      )
    case 'favorite':
      return (
        isRecord(value.result) &&
        isEntityId(value.result.id) &&
        typeof value.result.favorite === 'boolean'
      )
    case 'profile':
      return isProfile(value.result)
    case 'update-profile':
      return isUserProfile(value.result)
    case 'volume':
      return isPreferences(value.result)
    case 'close':
      return true
    case 'error':
      return isFailure(value.failure)
    default:
      return (
        isClassificationReply(value) ||
        isAssetReply(value) ||
        isCollectionReply(value) ||
        isPackReply(value) ||
        isSampleReply(value)
      )
  }
}
