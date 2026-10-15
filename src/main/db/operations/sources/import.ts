import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import type { DiscoveredAudioFile } from '../../../../shared/domain/source.ts'
import { isDiscoveredAudioFile } from '../../../../shared/domain/source.ts'
import {
  DomainValidationError,
  isEntityId,
} from '../../../../shared/domain/validation.ts'
import type { LibrarySample } from '../../../../shared/ipc/library.ts'
import { DbError } from '../../errors.ts'
import { excludedSources, sourceRoots } from '../../schema/sources.ts'
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'

export function importFolder(
  db: AppDatabase,
  root: string,
  files: DiscoveredAudioFile[],
): LibrarySample[] {
  if (!isAbsolute(root)) {
    throw new DomainValidationError('Invalid source directory')
  }
  const paths = new Set<string>()
  for (const file of files) {
    if (!isDiscoveredAudioFile(file) || !isAbsolute(file.path)) {
      throw new DomainValidationError('Invalid source observation')
    }
    const location = relative(root, file.path)
    if (
      !location ||
      location === '..' ||
      location.startsWith(`..${sep}`) ||
      isAbsolute(location)
    ) {
      throw new DomainValidationError(
        'Source is outside the selected directory',
      )
    }
    if (paths.has(file.path)) {
      throw new DomainValidationError('Repeated source location')
    }
    paths.add(file.path)
  }
  return db.transaction(
    (tx) => {
      const now = new Date().toISOString()
      tx.insert(sourceRoots)
        .values({ id: randomUUID(), canonicalPath: root })
        .onConflictDoUpdate({
          target: sourceRoots.canonicalPath,
          set: { registered: true },
        })
        .run()
      const rootId = tx
        .select({ id: sourceRoots.id })
        .from(sourceRoots)
        .where(eq(sourceRoots.canonicalPath, root))
        .get()?.id
      if (!isEntityId(rootId)) {
        throw new DbError('DB_INTEGRITY', 'Invalid source directory record.')
      }
      tx.update(sourceRootSamples)
        .set({ present: false })
        .where(eq(sourceRootSamples.sourceRootId, rootId))
        .run()
      const excluded = tx
        .select()
        .from(excludedSources)
        .where(eq(excludedSources.canonicalPath, sql.placeholder('path')))
        .prepare()
      const select = tx
        .select({
          id: samples.id,
          favorite: samples.favorite,
          observedSizeBytes: sampleSources.observedSizeBytes,
          observedMtimeMs: sampleSources.observedMtimeMs,
        })
        .from(sampleSources)
        .innerJoin(samples, eq(samples.id, sampleSources.sampleId))
        .where(eq(sampleSources.canonicalPath, sql.placeholder('path')))
        .prepare()
      const insertSample = tx
        .insert(samples)
        .values({ id: sql.placeholder('id') })
        .prepare()
      const insertSource = tx
        .insert(sampleSources)
        .values({
          sampleId: sql.placeholder('id'),
          canonicalPath: sql.placeholder('path'),
          availability: 'available',
          lastCheckedAt: now,
          observedSizeBytes: sql.placeholder('size'),
          observedMtimeMs: sql.placeholder('mtime'),
        })
        .prepare()
      const updateSource = tx
        .update(sampleSources)
        .set({
          availability: 'available',
          lastErrorCode: null,
          lastCheckedAt: now,
          observedSizeBytes: sql`${sql.placeholder('size')}`,
          observedMtimeMs: sql`${sql.placeholder('mtime')}`,
          revision: sql`${sampleSources.revision} + ${sql.placeholder('increment')}`,
        })
        .where(eq(sampleSources.sampleId, sql.placeholder('id')))
        .prepare()
      const associate = tx
        .insert(sourceRootSamples)
        .values({
          sourceRootId: rootId,
          sampleId: sql.placeholder('id'),
          present: true,
        })
        .onConflictDoUpdate({
          target: [sourceRootSamples.sourceRootId, sourceRootSamples.sampleId],
          set: { present: true },
        })
        .prepare()
      const result: LibrarySample[] = []
      for (const file of files) {
        if (excluded.get({ path: file.path })) {
          continue
        }
        let row = select.get({ path: file.path })
        const observation = {
          path: file.path,
          size: file.observedSizeBytes,
          mtime: file.observedMtimeMs,
        }
        if (!row) {
          const id = randomUUID()
          insertSample.run({ id })
          insertSource.run({ ...observation, id })
          row = {
            id,
            favorite: false,
            observedSizeBytes: file.observedSizeBytes,
            observedMtimeMs: file.observedMtimeMs,
          }
        } else {
          const changed =
            row.observedSizeBytes !== file.observedSizeBytes ||
            row.observedMtimeMs !== file.observedMtimeMs
          updateSource.run({
            ...observation,
            id: row.id,
            increment: changed ? 1 : 0,
          })
        }
        if (!isEntityId(row.id)) {
          throw new DbError('DB_INTEGRITY', 'Invalid sample record.')
        }
        associate.run({ id: row.id })
        result.push({
          name: file.name,
          path: file.path,
          relativePath: file.relativePath,
          id: row.id,
          favorite: row.favorite,
        })
      }
      tx.update(sourceRoots)
        .set({
          lastScanAt: now,
          lastScanOutcome: 'completed',
          lastScanErrorCode: null,
        })
        .where(eq(sourceRoots.id, rootId))
        .run()
      return result
    },
    { behavior: 'immediate' },
  )
}
