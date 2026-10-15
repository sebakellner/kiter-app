import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import type {
  Sample,
  SourceReinclusionRequest,
} from '../../../../shared/domain/sample.ts'
import type {
  DiscoveredAudioFile,
  SourceRoot,
} from '../../../../shared/domain/source.ts'
import { isDiscoveredAudioFile } from '../../../../shared/domain/source.ts'
import {
  DomainValidationError,
  requireEntityId,
} from '../../../../shared/domain/validation.ts'
import { DbError } from '../../errors.ts'
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'
import { excludedSources, sourceRoots } from '../../schema/sources.ts'
import { getSample } from '../samples/operations.ts'

export function getReinclusionRoot(
  db: AppDatabase,
  input: SourceReinclusionRequest,
): SourceRoot {
  requireEntityId(input.sourceRootId)
  if (
    typeof input.canonicalPath !== 'string' ||
    !isAbsolute(input.canonicalPath)
  ) {
    throw new DomainValidationError('Invalid excluded source location.')
  }
  if (
    !db
      .select()
      .from(excludedSources)
      .where(eq(excludedSources.canonicalPath, input.canonicalPath))
      .get()
  ) {
    throw new DbError('NOT_FOUND', 'The source is no longer excluded.')
  }
  const root = db
    .select()
    .from(sourceRoots)
    .where(
      and(
        eq(sourceRoots.id, input.sourceRootId),
        eq(sourceRoots.registered, true),
      ),
    )
    .get()
  if (!root) {
    throw new DbError('NOT_FOUND', 'The source directory is not registered.')
  }
  const location = relative(root.canonicalPath, input.canonicalPath)
  if (
    !location ||
    location === '..' ||
    location.startsWith(`..${sep}`) ||
    isAbsolute(location)
  ) {
    throw new DomainValidationError(
      'The excluded source is outside the registered directory.',
    )
  }
  return root
}

export function reincludeSource(
  db: AppDatabase,
  input: SourceReinclusionRequest,
  file: DiscoveredAudioFile,
): Sample {
  if (!isDiscoveredAudioFile(file) || file.path !== input.canonicalPath) {
    throw new DomainValidationError('Invalid source observation.')
  }
  return db.transaction(
    () => {
      getReinclusionRoot(db, input)
      if (
        db
          .select()
          .from(sampleSources)
          .where(eq(sampleSources.canonicalPath, input.canonicalPath))
          .get()
      ) {
        throw new DbError(
          'DB_INTEGRITY',
          'The excluded source already has a Sample.',
        )
      }
      const id = randomUUID()
      db.delete(excludedSources)
        .where(eq(excludedSources.canonicalPath, input.canonicalPath))
        .run()
      db.insert(samples).values({ id, originAssignment: 'manual' }).run()
      db.insert(sampleSources)
        .values({
          sampleId: id,
          canonicalPath: file.path,
          availability: 'available',
          observedSizeBytes: file.observedSizeBytes,
          observedMtimeMs: file.observedMtimeMs,
          lastCheckedAt: new Date().toISOString(),
        })
        .run()
      db.insert(sourceRootSamples)
        .values({
          sourceRootId: input.sourceRootId,
          sampleId: id,
          present: true,
        })
        .run()
      return getSample(db, id)
    },
    { behavior: 'immediate' },
  )
}
