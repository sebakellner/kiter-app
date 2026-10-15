import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { imageAssets } from '../../schema/assets.ts'
import { collections } from '../../schema/collections.ts'
import { packs } from '../../schema/packs.ts'
import { userProfiles } from '../../schema/profile.ts'

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

export function isReferenced(db: AppDatabase, id: string): boolean {
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
