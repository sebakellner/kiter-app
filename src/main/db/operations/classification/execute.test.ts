import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
} from '../packs/operations.ts'
import { executeStandaloneClassificationTarget } from './execute.ts'
import { readStandaloneClassificationContext } from './standalone-context.ts'
import { targetStateToken } from './target-state.ts'
import { readClassificationRejections } from './rejections.ts'
import { readSampleType } from './sample-type.ts'
import {
  recognitionVocabulary,
  sampleGenres,
  sampleInstruments,
} from '../../schema/index.ts'
import type {
  ClassificationRejection,
  ClassificationSubject,
} from '../../../../shared/features/classification/batch-schemas.ts'
import type {
  StandaloneExecutionSubject,
  StandaloneExecutionTargetRequest,
} from '../../../../shared/features/classification/execution-schemas.ts'

type Database = ReturnType<typeof createMemoryDatabase>['db']

function seedCatalog(t: Parameters<typeof createMemoryDatabase>[0]): {
  db: Database
  native: { serialize: () => Buffer }
  sample: { id: string }
  pack: { id: string }
} {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('execute-classification')
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  const sample = importFolder(db, root, [file])[0]
  const source = getPackSourceRoot(db, root)
  const pack = importPack(db, {
    sourceRootId: source.id,
    name: 'Pack',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  return { db, native, sample, pack }
}

// The reviewed digest comes from the same read the preparation uses, so these
// tests fail if the worker ever stops agreeing with the snapshot builder.
function reviewedState(
  db: Database,
  subject: StandaloneExecutionSubject,
): { expectedStateToken: string } {
  const context = readStandaloneClassificationContext(db, {
    targets: [subject],
    offset: 0,
  })
  return {
    expectedStateToken: targetStateToken(context.targets[0]),
  }
}

function targetRequest(
  subject: StandaloneExecutionSubject,
  state: ReturnType<typeof reviewedState>,
  overrides: Partial<StandaloneExecutionTargetRequest> = {},
): StandaloneExecutionTargetRequest {
  return {
    subject,
    ...state,
    accepts: [],
    rejections: { remember: [], forget: [] },
    ...overrides,
  }
}

function catalogSubject(id: string): StandaloneExecutionSubject {
  return { kind: 'sample', id }
}

function rejection(sampleId: string): ClassificationRejection {
  return {
    contractVersion: 1,
    subject: catalogRejectionSubject(sampleId),
    target: { dimension: 'genre', key: 'genre:house' },
    evidenceKeys: ['a'.repeat(64)],
  }
}

function catalogRejectionSubject(sampleId: string): ClassificationSubject {
  return {
    kind: 'sample' as const,
    identity: { kind: 'catalog' as const, id: sampleId },
  }
}

test('execution commits accepted proposals and required vocabulary in one transaction', (t) => {
  const { db, native, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  const state = reviewedState(db, subject)
  const before = native.serialize()
  const result = executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, state, {
      accepts: [
        {
          dimension: 'instrument',
          key: 'instrument:kick',
          name: 'Kick',
          entityId: null,
        },
        {
          dimension: 'genre',
          key: 'genre:house',
          name: 'House',
          entityId: null,
        },
      ],
    }),
  )
  assert.equal(result.outcome, 'committed')
  // The surface shows the Sample's own name, not a raw identity.
  assert.equal(result.label, 'kick.wav')
  assert.equal(result.assignments, 2)
  // The seeded House Genre already exists; only the Instrument is created.
  assert.deepEqual(result.created, { instruments: 1, genres: 0 })
  assert.notDeepEqual(native.serialize(), before)
  const kick = db
    .select()
    .from(recognitionVocabulary)
    .where(eq(recognitionVocabulary.key, 'instrument:kick'))
    .get()!
  assert.equal(kick.state, 'active')
  assert.ok(kick.instrumentId)
  const instruments = db
    .select({ id: sampleInstruments.instrumentId })
    .from(sampleInstruments)
    .where(eq(sampleInstruments.sampleId, sample.id))
    .all()
  assert.deepEqual(
    instruments.map((row) => row.id),
    [kick.instrumentId],
  )
  const genres = db
    .select({ id: sampleGenres.genreId })
    .from(sampleGenres)
    .where(eq(sampleGenres.sampleId, sample.id))
    .all()
  assert.equal(genres.length, 1)
})

test('execution writes nothing when the reviewed read state changed', (t) => {
  const { db, native, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  const stale = reviewedState(db, subject)
  executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, stale, {
      accepts: [
        {
          dimension: 'instrument',
          key: 'instrument:kick',
          name: 'Kick',
          entityId: null,
        },
      ],
    }),
  )
  const before = native.serialize()
  const result = executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, stale, {
      accepts: [
        {
          dimension: 'genre',
          key: 'genre:house',
          name: 'House',
          entityId: null,
        },
      ],
    }),
  )
  assert.equal(result.outcome, 'stale')
  assert.equal(result.label, 'kick.wav')
  assert.equal(result.assignments, 0)
  assert.deepEqual(native.serialize(), before)
})

test('execution applies rejection changes in the same transaction as the assignment', (t) => {
  const { db, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  const state = reviewedState(db, subject)
  const committed = executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, state, {
      accepts: [
        {
          dimension: 'instrument',
          key: 'instrument:kick',
          name: 'Kick',
          entityId: null,
        },
      ],
      rejections: { remember: [rejection(sample.id)], forget: [] },
    }),
  )
  assert.equal(committed.remembered, 1)
  const memory = readClassificationRejections(db, {
    subjects: [catalogRejectionSubject(sample.id)],
  })
  assert.equal(memory.rejections.length, 1)
  assert.equal(memory.rejections[0].target.key, 'genre:house')
  // Committing the assignment moved the target, so forgetting its rejected
  // alternative comes from a fresh review of the same subject.
  const forgotten = executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, reviewedState(db, subject), {
      rejections: {
        remember: [],
        forget: [
          {
            subject: catalogRejectionSubject(sample.id),
            target: { dimension: 'genre', key: 'genre:house' },
          },
        ],
      },
    }),
  )
  assert.equal(forgotten.outcome, 'committed')
  assert.equal(forgotten.forgotten, 1)
  assert.equal(
    readClassificationRejections(db, {
      subjects: [catalogRejectionSubject(sample.id)],
    }).rejections.length,
    0,
  )
})

test('execution replaces a differing Sample type', (t) => {
  const { db, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  assert.equal(
    readSampleType(db, { sampleId: sample.id }).sampleType,
    'unknown',
  )
  const result = executeStandaloneClassificationTarget(
    db,
    targetRequest(subject, reviewedState(db, subject), {
      accepts: [{ dimension: 'sample-type', key: 'one-shot' }],
    }),
  )
  assert.equal(result.outcome, 'committed')
  assert.equal(result.typeChanged, true)
  assert.equal(
    readSampleType(db, { sampleId: sample.id }).sampleType,
    'one-shot',
  )
})

test('execution refuses a Sample type for a Pack and writes nothing', (t) => {
  const { db, native, pack } = seedCatalog(t)
  const subject: StandaloneExecutionSubject = { kind: 'pack', id: pack.id }
  const state = reviewedState(db, subject)
  const before = native.serialize()
  assert.throws(
    () =>
      executeStandaloneClassificationTarget(
        db,
        targetRequest(subject, state, {
          accepts: [{ dimension: 'sample-type', key: 'loop' }],
        }),
      ),
    /has no Sample type/u,
  )
  assert.deepEqual(native.serialize(), before)
})

test('execution refuses a duplicate decision for one classification', (t) => {
  const { db, native, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  const state = reviewedState(db, subject)
  const before = native.serialize()
  assert.throws(
    () =>
      executeStandaloneClassificationTarget(
        db,
        targetRequest(subject, state, {
          accepts: [
            {
              dimension: 'genre',
              key: 'genre:house',
              name: 'House',
              entityId: null,
            },
            {
              dimension: 'genre',
              key: 'genre:house',
              name: 'House',
              entityId: null,
            },
          ],
        }),
      ),
    /submitted twice/u,
  )
  assert.deepEqual(native.serialize(), before)
})

test('execution refuses a vocabulary key remapped since review', (t) => {
  const { db, native, sample } = seedCatalog(t)
  const subject = catalogSubject(sample.id)
  const state = reviewedState(db, subject)
  const before = native.serialize()
  assert.throws(
    () =>
      executeStandaloneClassificationTarget(
        db,
        targetRequest(subject, state, {
          accepts: [
            {
              dimension: 'genre',
              key: 'genre:house',
              name: 'House',
              entityId: randomUUID(),
            },
          ],
        }),
      ),
    /changed/u,
  )
  assert.deepEqual(native.serialize(), before)
})

test('execution refuses a retired vocabulary identity', (t) => {
  const { db, native, sample } = seedCatalog(t)
  db.update(recognitionVocabulary)
    .set({ state: 'deleted' })
    .where(eq(recognitionVocabulary.key, 'instrument:kick'))
    .run()
  const subject = catalogSubject(sample.id)
  const state = reviewedState(db, subject)
  const before = native.serialize()
  assert.throws(
    () =>
      executeStandaloneClassificationTarget(
        db,
        targetRequest(subject, state, {
          accepts: [
            {
              dimension: 'instrument',
              key: 'instrument:kick',
              name: 'Kick',
              entityId: null,
            },
          ],
        }),
      ),
    /changed/u,
  )
  assert.deepEqual(native.serialize(), before)
})
