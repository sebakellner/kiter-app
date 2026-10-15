import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../connection.ts'
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
  requirePreviewVolume,
} from '../../../shared/domain/profile.ts'
import { DbError } from '../errors.ts'
import { userProfiles, userPreferences } from '../schema/profile.ts'
import { authors } from '../schema/classification.ts'

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
    !isUserProfile(row) ||
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

export function updateLocalProfile(
  db: AppDatabase,
  input: ProfileUpdateRequest,
): UserProfile {
  const update = requireProfileUpdate(input)
  return db.transaction(
    () => {
      const { profile } = readLocalProfile(db)
      if (
        update.authorId !== null &&
        !db
          .select({ id: authors.id })
          .from(authors)
          .where(eq(authors.id, update.authorId))
          .get()
      ) {
        throw new DbError('NOT_FOUND', 'The Author no longer exists.')
      }
      const result = db
        .update(userProfiles)
        .set(update)
        .where(eq(userProfiles.id, profile.id))
        .run()
      if (result.changes !== 1) {
        throw new DbError('DB_INTEGRITY', 'The local profile is unavailable.')
      }
      return readLocalProfile(db).profile
    },
    { behavior: 'immediate' },
  )
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
