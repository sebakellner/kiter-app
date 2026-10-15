import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { and, count, eq, gt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { SQLiteSelect } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '../connection.ts'
import type {
  Sample,
  SampleUpdateRequest,
  SamplePage,
  SamplePageRequest,
  SampleReference,
  SampleReferencesRequest,
  SampleRemovalReview,
  SampleRemovalRequest,
  ExcludedSource,
  SourceReinclusionRequest,
} from '../../../shared/domain/sample.ts'
import {
  requireSampleDisplayName,
  requireSampleNotes,
  requireSamplePage,
} from '../../../shared/domain/sample.ts'
import type {
  DiscoveredAudioFile,
  SourceRoot,
} from '../../../shared/domain/source.ts'
import { isDiscoveredAudioFile } from '../../../shared/domain/source.ts'
import {
  DomainValidationError,
  requireEntityId,
} from '../../../shared/domain/validation.ts'
import { samples, sampleSources, sourceRootSamples } from '../schema/samples.ts'
import { excludedSources, sourceRoots } from '../schema/sources.ts'
import { collections, collectionSamples } from '../schema/collections.ts'
import {
  categories,
  authors,
  sampleCategories,
  sampleAuthors,
} from '../schema/classification.ts'
import { DbError } from '../errors.ts'

export function getSample(db: AppDatabase, id: string): Sample {
  requireEntityId(id)
  const row = db.select().from(samples).where(eq(samples.id, id)).get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  return row
}

export function updateSample(
  db: AppDatabase,
  input: SampleUpdateRequest,
): Sample {
  requireEntityId(input.id)
  const displayName = requireSampleDisplayName(input.displayName)
  const notes = requireSampleNotes(input.notes)
  const row = db
    .update(samples)
    .set({ displayName, notes })
    .where(eq(samples.id, input.id))
    .returning()
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  return row
}

export function listSampleReferences(
  db: AppDatabase,
  input: SampleReferencesRequest,
): SamplePage<SampleReference> {
  requireEntityId(input.id)
  const page = requireSamplePage(input)
  return db.transaction(() => {
    getSample(db, input.id)
    const query = referenceQuery(db, input)
    const total = db
      .select({ count: count() })
      .from(query.as('sample_references'))
      .get()!.count
    const items = query.limit(page.limit).offset(page.offset).all()
    return { items, total, ...page }
  })
}

function referenceQuery(
  db: AppDatabase,
  input: Pick<SampleReferencesRequest, 'id' | 'kind'>,
  after = '',
): SQLiteSelect<
  string,
  'sync',
  unknown,
  {
    id: SQL.Aliased<string>
    name: SQL.Aliased<string>
    position: SQL.Aliased<number | null>
  },
  'partial',
  Record<string, 'not-null'>
> {
  switch (input.kind) {
    case 'collection':
      return db
        .select({
          id: sql<string>`${collections.id}`.as('id'),
          name: sql<string>`${collections.name}`.as('name'),
          position: sql<number | null>`${collectionSamples.position}`.as(
            'position',
          ),
        })
        .from(collectionSamples)
        .innerJoin(
          collections,
          eq(collections.id, collectionSamples.collectionId),
        )
        .where(
          and(
            eq(collectionSamples.sampleId, input.id),
            gt(collections.id, after),
          ),
        )
        .orderBy(collections.id)
        .$dynamic()
    case 'category':
      return db
        .select({
          id: sql<string>`${categories.id}`.as('id'),
          name: sql<string>`${categories.name}`.as('name'),
          position: sql<number | null>`NULL`.as('position'),
        })
        .from(sampleCategories)
        .innerJoin(categories, eq(categories.id, sampleCategories.categoryId))
        .where(
          and(
            eq(sampleCategories.sampleId, input.id),
            gt(categories.id, after),
          ),
        )
        .orderBy(categories.id)
        .$dynamic()
    case 'author':
      return db
        .select({
          id: sql<string>`${authors.id}`.as('id'),
          name: sql<string>`${authors.name}`.as('name'),
          position: sql<number | null>`NULL`.as('position'),
        })
        .from(sampleAuthors)
        .innerJoin(authors, eq(authors.id, sampleAuthors.authorId))
        .where(and(eq(sampleAuthors.sampleId, input.id), gt(authors.id, after)))
        .orderBy(authors.id)
        .$dynamic()
    case 'root':
      return db
        .select({
          id: sql<string>`${sourceRoots.id}`.as('id'),
          name: sql<string>`${sourceRoots.canonicalPath}`.as('name'),
          position: sql<number | null>`NULL`.as('position'),
        })
        .from(sourceRootSamples)
        .innerJoin(
          sourceRoots,
          eq(sourceRoots.id, sourceRootSamples.sourceRootId),
        )
        .where(
          and(
            eq(sourceRootSamples.sampleId, input.id),
            gt(sourceRoots.id, after),
          ),
        )
        .orderBy(sourceRoots.id)
        .$dynamic()
    default:
      throw new DomainValidationError('Invalid Sample reference kind.')
  }
}

function removalReview(db: AppDatabase, id: string): SampleRemovalReview {
  const entity = getSample(db, id)
  const source = db
    .select()
    .from(sampleSources)
    .where(eq(sampleSources.sampleId, id))
    .get()
  if (!source) {
    throw new DbError(
      'DB_INTEGRITY',
      'The Sample source is missing from the catalog.',
    )
  }
  const hash = createHash('sha256').update(
    JSON.stringify(['sample', entity, source]),
  )
  const counts = { collection: 0, category: 0, author: 0, root: 0 }
  for (const kind of ['collection', 'category', 'author', 'root'] as const) {
    hash.update(kind)
    let after = ''
    for (;;) {
      const batch = referenceQuery(db, { id, kind }, after).limit(500).all()
      for (const row of batch) {
        hash.update(JSON.stringify(row))
      }
      counts[kind] += batch.length
      if (batch.length < 500) {
        break
      }
      after = batch[batch.length - 1].id
    }
  }
  return {
    entity,
    source,
    collectionCount: counts.collection,
    categoryCount: counts.category,
    authorCount: counts.author,
    rootCount: counts.root,
    token: hash.digest('hex'),
  }
}

export function reviewSampleRemoval(
  db: AppDatabase,
  id: string,
): SampleRemovalReview {
  return db.transaction(() => removalReview(db, id))
}

export function removeSample(
  db: AppDatabase,
  input: SampleRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) {
    throw new DomainValidationError('A removal review token is required.')
  }
  return db.transaction(
    () => {
      const review = removalReview(db, input.id)
      if (review.token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'The Sample changed. Review it again before removing.',
        )
      }
      db.insert(excludedSources)
        .values({ canonicalPath: review.source.canonicalPath })
        .run()
      db.delete(samples).where(eq(samples.id, input.id)).run()
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}

export function listExcludedSources(
  db: AppDatabase,
  input: SamplePageRequest = {},
): SamplePage<ExcludedSource> {
  const page = requireSamplePage(input)
  return db.transaction(() => ({
    items: db
      .select()
      .from(excludedSources)
      .orderBy(excludedSources.canonicalPath)
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(excludedSources).get()!.count,
    ...page,
  }))
}

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
