import { and, eq, gt, sql } from 'drizzle-orm'
import type {
  ImageAsset,
  ImageTarget,
  ImageReferenceRequest,
  ImagePublicationRequest,
} from '../../../shared/domain/imageAsset.ts'
import {
  requireEntityId,
  DomainValidationError,
} from '../../../shared/domain/validation.ts'
import { isAssetRequest } from '../assetProtocol.ts'
import { DbError } from '../errors.ts'
import { readLocalProfile } from './profile.ts'
import type { AppDatabase } from '../connection.ts'
import { imageAssets } from '../schema/assets.ts'
import { collections } from '../schema/collections.ts'
import { packs } from '../schema/packs.ts'
import { userProfiles } from '../schema/profile.ts'

export function scheduleUnusedImageCleanup(
  db: AppDatabase,
  assetId: string | null,
): void {
  if (assetId === null) {
    return
  }
  db.update(imageAssets)
    .set({ state: 'cleanup_pending' })
    .where(
      and(
        eq(imageAssets.id, assetId),
        sql`not exists (select 1 from ${collections} where ${collections.coverAssetId} = ${assetId})`,
        sql`not exists (select 1 from ${packs} where ${packs.coverAssetId} = ${assetId})`,
        sql`not exists (select 1 from ${userProfiles} where ${userProfiles.avatarAssetId} = ${assetId})`,
      ),
    )
    .run()
}

function isReferenced(db: AppDatabase, id: string): boolean {
  return Boolean(
    db
      .select({ id: packs.id })
      .from(packs)
      .where(eq(packs.coverAssetId, id))
      .get() ||
    db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.coverAssetId, id))
      .get() ||
    db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.avatarAssetId, id))
      .get(),
  )
}

export function getImage(db: AppDatabase, id: string): ImageAsset | null {
  requireEntityId(id)
  return (
    db.select().from(imageAssets).where(eq(imageAssets.id, id)).get() ?? null
  )
}

function currentReference(db: AppDatabase, target: ImageTarget): string | null {
  if (target.kind === 'profile') {
    return readLocalProfile(db).profile.avatarAssetId
  }
  const table = target.kind === 'pack' ? packs : collections
  const row = db
    .select({ assetId: table.coverAssetId })
    .from(table)
    .where(eq(table.id, target.id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The image target no longer exists.')
  }
  return row.assetId
}

function changeReference(
  db: AppDatabase,
  target: ImageTarget,
  assetId: string | null,
): void {
  if (target.kind === 'profile') {
    const { profile } = readLocalProfile(db)
    db.update(userProfiles)
      .set({ avatarAssetId: assetId })
      .where(eq(userProfiles.id, profile.id))
      .run()
  } else if (target.kind === 'pack') {
    db.update(packs)
      .set({ coverAssetId: assetId })
      .where(eq(packs.id, target.id))
      .run()
  } else {
    db.update(collections)
      .set({ coverAssetId: assetId })
      .where(eq(collections.id, target.id))
      .run()
  }
}

export function setImageReference(
  db: AppDatabase,
  input: ImageReferenceRequest,
): { assetId: string | null } {
  if (!isAssetRequest({ action: 'set-image-reference', input })) {
    throw new DomainValidationError('Invalid image reference.')
  }
  return db.transaction(
    () => {
      const previous = currentReference(db, input.target)
      if (previous !== input.expectedAssetId) {
        throw new DbError(
          'STALE_REVIEW',
          'The image changed. Reload before replacing it.',
        )
      }
      if (
        input.assetId !== null &&
        getImage(db, input.assetId)?.state !== 'ready'
      ) {
        throw new DbError('NOT_FOUND', 'The managed image is unavailable.')
      }
      changeReference(db, input.target, input.assetId)
      scheduleUnusedImageCleanup(db, previous)
      return { assetId: input.assetId }
    },
    { behavior: 'immediate' },
  )
}

export function publishImage(
  db: AppDatabase,
  input: ImagePublicationRequest,
): ImageAsset {
  if (!isAssetRequest({ action: 'publish-image', input })) {
    throw new DomainValidationError('Invalid image publication.')
  }
  return db.transaction(
    () => {
      db.insert(imageAssets).values(input.asset).run()
      setImageReference(db, {
        target: input.target,
        expectedAssetId: input.expectedAssetId,
        assetId: input.asset.id,
      })
      return input.asset
    },
    { behavior: 'immediate' },
  )
}

export function listImages(
  db: AppDatabase,
  after: string | null,
): ImageAsset[] {
  if (after !== null) {
    requireEntityId(after)
  }
  return db
    .select()
    .from(imageAssets)
    .where(after === null ? undefined : gt(imageAssets.id, after))
    .orderBy(imageAssets.id)
    .limit(100)
    .all()
}

// Claiming is irreversible: pending assets cannot be attached while main deletes
// the file. A crash leaves a retryable claim, never an attachable missing image.
export function claimImageCleanup(
  db: AppDatabase,
  id: string,
): ImageAsset | null {
  requireEntityId(id)
  return db.transaction(
    () => {
      if (isReferenced(db, id)) {
        return null
      }
      scheduleUnusedImageCleanup(db, id)
      return getImage(db, id)
    },
    { behavior: 'immediate' },
  )
}

export function finishImageCleanup(
  db: AppDatabase,
  id: string,
): { id: string } {
  requireEntityId(id)
  return db.transaction(
    () => {
      const asset = getImage(db, id)
      if (
        asset &&
        (asset.state !== 'cleanup_pending' || isReferenced(db, id))
      ) {
        throw new DbError('STALE_REVIEW', 'The managed image is still in use.')
      }
      db.delete(imageAssets).where(eq(imageAssets.id, id)).run()
      return { id }
    },
    { behavior: 'immediate' },
  )
}
