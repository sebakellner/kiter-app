import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requirePresentationName,
} from './validation.ts'

export const DEFAULT_PROFILE_NAME = 'Local profile'
export const DEFAULT_PREVIEW_VOLUME = 1

export interface UserProfile {
  id: string
  name: string
  avatarAssetId: string | null
  authorId: string | null
}

export interface UserPreferences {
  profileId: string
  previewVolume: number
}

export interface LocalProfile {
  profile: UserProfile
  preferences: UserPreferences
}

export interface ProfileUpdateRequest {
  name: string
  authorId: string | null
}

export function requireProfileUpdate(value: unknown): ProfileUpdateRequest {
  if (
    !isRecord(value) ||
    (value.authorId !== null && !isEntityId(value.authorId))
  ) {
    throw new DomainValidationError('Invalid profile update.')
  }
  return {
    name: requirePresentationName(value.name),
    authorId: value.authorId,
  }
}

export function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  try {
    return (
      requirePresentationName(value.name) === value.name &&
      (value.authorId === null || isEntityId(value.authorId)) &&
      (value.avatarAssetId === null || isEntityId(value.avatarAssetId))
    )
  } catch {
    return false
  }
}

export function isPreviewVolume(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

export function requirePreviewVolume(value: unknown): number {
  if (!isPreviewVolume(value)) {
    throw new DomainValidationError(
      'Preview volume must be a number between 0 and 1',
    )
  }
  return value
}
