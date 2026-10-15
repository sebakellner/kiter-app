import { DomainValidationError } from './validation.ts'

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
