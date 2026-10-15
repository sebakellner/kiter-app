import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../connection.ts'
import type {
  LocalProfile,
  UserPreferences,
} from '../../../shared/domain/profile.ts'
import {
  isPreviewVolume,
  requirePreviewVolume,
} from '../../../shared/domain/profile.ts'
import { isEntityId } from '../../../shared/domain/validation.ts'
import { DbError } from '../errors.ts'
import { userProfiles, userPreferences } from '../schema/profile.ts'

export function readLocalProfile(db: AppDatabase): LocalProfile {
  const rows = db
    .select({
      id: userProfiles.id,
      name: userProfiles.name,
      avatarAssetId: userProfiles.avatarAssetId,
      authorId: userProfiles.authorId,
      previewVolume: userPreferences.previewVolume,
    })
    .from(userProfiles)
    .innerJoin(userPreferences, eq(userPreferences.profileId, userProfiles.id))
    .all()
  const row = rows[0]
  if (
    rows.length !== 1 ||
    !row ||
    !isEntityId(row.id) ||
    !row.name.trim() ||
    (row.avatarAssetId !== null && !isEntityId(row.avatarAssetId)) ||
    (row.authorId !== null && !isEntityId(row.authorId)) ||
    !isPreviewVolume(row.previewVolume)
  ) {
    throw new DbError(
      'DB_INTEGRITY',
      'The local profile or preferences are invalid.',
    )
  }
  return {
    profile: {
      id: row.id,
      name: row.name,
      avatarAssetId: row.avatarAssetId,
      authorId: row.authorId,
    },
    preferences: { profileId: row.id, previewVolume: row.previewVolume },
  }
}

export function setPreviewVolume(
  db: AppDatabase,
  volume: unknown,
): UserPreferences {
  const previewVolume = requirePreviewVolume(volume)
  const { profile } = readLocalProfile(db)
  const result = db
    .update(userPreferences)
    .set({ previewVolume })
    .where(eq(userPreferences.profileId, profile.id))
    .run()
  if (result.changes !== 1) {
    throw new DbError('DB_INTEGRITY', 'The local preferences are unavailable.')
  }
  return { profileId: profile.id, previewVolume }
}
