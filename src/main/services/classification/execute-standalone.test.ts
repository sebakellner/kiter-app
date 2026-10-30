import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import { readClassificationRejections } from '../../db/operations/classification/rejections.ts'
import { readStandaloneClassificationContext } from '../../db/operations/classification/standalone-context.ts'
import { executeStandaloneClassificationTarget } from '../../db/operations/classification/execute.ts'
import {
  readSampleType,
  saveSampleType,
} from '../../db/operations/classification/sample-type.ts'
import { sampleInstruments } from '../../db/schema/index.ts'
import { createStandaloneReviewSession } from './standalone-session.ts'
import { executeStandaloneDraft } from './execute-standalone.ts'
import type { StandaloneReviewDatabase } from './standalone-batch.ts'
import type {
  ClassificationBatchDraft,
  ClassificationReviewRow,
} from '../../../shared/features/classification/batch-schemas.ts'
import type {
  StandaloneExecutionTargetRequest,
  StandaloneExecutionTargetResult,
} from '../../../shared/features/classification/execution-schemas.ts'

type Database = ReturnType<typeof createMemoryDatabase>['db']
type Catalog = StandaloneReviewDatabase & {
  connection: ReturnType<typeof createMemoryDatabase>
}

function fixture(t: TestContext): Catalog {
  const connection = createMemoryDatabase(t)
  return {
    connection,
    readStandaloneClassificationContext: async (input) =>
      readStandaloneClassificationContext(connection.db, input),
    readClassificationRejections: async (input) =>
      readClassificationRejections(connection.db, input),
    executeStandaloneClassificationTarget: async (input) =>
      executeStandaloneClassificationTarget(connection.db, input),
  }
}

function sampleNamed(db: Database, folder: string): { id: string } {
  const root = path.resolve(folder)
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  return importFolder(db, root, [file])[0]
}

function kickRow(rows: ClassificationReviewRow[]): ClassificationReviewRow {
  const row = rows.find(
    (item) =>
      item.target.dimension === 'instrument' &&
      item.target.key === 'instrument:kick',
  )
  assert.ok(row, 'expected a Kick proposal')
  return row
}

test('session executes staged acceptances, writes the catalog and consumes the review', async (t) => {
  const catalog = fixture(t)
  const sample = sampleNamed(catalog.connection.db, 'House')
  const session = createStandaloneReviewSession(catalog)
  const prepared = await session.prepare({
    subjects: [{ kind: 'sample', id: sample.id }],
  })
  const page = session.listProposals({
    reviewId: prepared.reviewId,
    revision: prepared.revision,
    token: prepared.token,
    limit: 100,
  })
  const row = kickRow(page.items)
  const staged = session.stage({
    reviewId: page.reviewId,
    revision: page.revision,
    token: page.token,
    choices: [{ proposalKey: row.proposalKey, decision: 'accept' }],
  })

  const result = await session.execute({
    reviewId: staged.reviewId,
    revision: staged.revision,
    token: staged.token,
  })

  assert.deepEqual(result.totals, {
    committed: 1,
    stale: 0,
    blocked: 0,
    failed: 0,
  })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].outcome, 'committed')
  assert.equal(result.results[0].assignments, 1)
  const assigned = catalog.connection.db
    .select({ id: sampleInstruments.instrumentId })
    .from(sampleInstruments)
    .where(eq(sampleInstruments.sampleId, sample.id))
    .all()
  assert.equal(assigned.length, 1)
  // Execution consumes the review, so the same draft cannot be replayed.
  assert.throws(
    () =>
      session.listProposals({
        reviewId: result.reviewId,
        revision: result.revision,
        token: result.token,
      }),
    /no longer available/u,
  )
})

test('session refuses to execute a review without decisions and keeps it', async (t) => {
  const catalog = fixture(t)
  const sample = sampleNamed(catalog.connection.db, 'House')
  const session = createStandaloneReviewSession(catalog)
  const prepared = await session.prepare({
    subjects: [{ kind: 'sample', id: sample.id }],
  })
  await assert.rejects(
    () =>
      session.execute({
        reviewId: prepared.reviewId,
        revision: prepared.revision,
        token: prepared.token,
      }),
    /Nothing to execute/u,
  )
  const page = session.listProposals({
    reviewId: prepared.reviewId,
    revision: prepared.revision,
    token: prepared.token,
  })
  assert.ok(page.total >= 1, 'an empty attempt must not consume the review')
})

test('execution commits independent targets and reports a stale one without writing it', async (t) => {
  const catalog = fixture(t)
  const first = sampleNamed(catalog.connection.db, 'House')
  const second = sampleNamed(catalog.connection.db, 'Techno')
  const session = createStandaloneReviewSession(catalog)
  const prepared = await session.prepare({
    subjects: [
      { kind: 'sample', id: first.id },
      { kind: 'sample', id: second.id },
    ],
  })
  const accepted = session.acceptAll({
    reviewId: prepared.reviewId,
    revision: prepared.revision,
    token: prepared.token,
  })
  // A saved Sample type moves one target beneath the review that staged it.
  saveSampleType(catalog.connection.db, {
    ...readSampleType(catalog.connection.db, { sampleId: second.id }),
    sampleType: 'loop',
  })

  const result = await session.execute({
    reviewId: accepted.reviewId,
    revision: accepted.revision,
    token: accepted.token,
  })

  assert.equal(result.totals.committed, 1)
  assert.equal(result.totals.stale, 1)
  const stale = result.results.find((item) => item.outcome === 'stale')
  assert.ok(stale)
  assert.equal(stale.subject.id, second.id)
  assert.equal(stale.assignments, 0)
  // The whole path explains the refusal: the preparation captured the reviewed
  // field digests, the session resolved them from the review it retained, and the
  // worker compared them against the state it read inside the refused transaction.
  assert.deepEqual(stale.changedFields, ['currentType'])
  const staleSample = catalog.connection.db
    .select({ id: sampleInstruments.instrumentId })
    .from(sampleInstruments)
    .where(eq(sampleInstruments.sampleId, second.id))
    .all()
  assert.deepEqual(staleSample, [], 'a stale target writes nothing')
  const committedSample = catalog.connection.db
    .select({ id: sampleInstruments.instrumentId })
    .from(sampleInstruments)
    .where(eq(sampleInstruments.sampleId, first.id))
    .all()
  assert.ok(committedSample.length > 0, 'the unrelated target still commits')
})

// Drafts come from the review core in production. These cases drive the
// orchestrator directly to pin ordering and outcome mapping.
function row(
  subjectId: string,
  overrides: Partial<ClassificationReviewRow> = {},
): ClassificationReviewRow {
  return {
    proposalKey: 'c'.repeat(64),
    subject: {
      kind: 'sample',
      identity: { kind: 'catalog', id: subjectId },
    },
    stateToken: 'd'.repeat(64),
    currentType: null,
    replacesType: false,
    evidenceKeys: ['e'.repeat(64)],
    remembered: false,
    reviewable: true,
    assigned: false,
    decision: 'accept',
    target: {
      dimension: 'genre',
      key: 'genre:house',
      name: 'House',
      entityId: null,
    },
    evidence: [
      {
        kind: 'pack-genre',
        packId: 'pack-1',
        genreKey: 'genre:house',
      },
    ],
    dependencies: [],
    ...overrides,
  }
}

function draftOf(
  decisions: ClassificationReviewRow[],
  overrides: Partial<ClassificationBatchDraft> = {},
): ClassificationBatchDraft {
  return {
    reviewId: 'review-1',
    revision: 2,
    token: 'f'.repeat(64),
    contractVersion: 1,
    dependenciesSatisfied: true,
    dependencyBlocks: [],
    decisions,
    rejectionChanges: { remember: [], forget: [] },
    ...overrides,
  } as ClassificationBatchDraft
}

function recorder(
  outcomes: Record<string, StandaloneExecutionTargetResult['outcome']> = {},
  error?: unknown,
): {
  database: {
    executeStandaloneClassificationTarget: (
      input: StandaloneExecutionTargetRequest,
    ) => Promise<StandaloneExecutionTargetResult>
  }
  calls: StandaloneExecutionTargetRequest[]
} {
  const calls: StandaloneExecutionTargetRequest[] = []
  return {
    calls,
    database: {
      executeStandaloneClassificationTarget: async (input) => {
        calls.push(input)
        if (error) {
          throw error
        }
        return {
          subject: input.subject,
          outcome: outcomes[input.subject.id] ?? 'committed',
          assignments: input.accepts.length,
          created: { instruments: 0, genres: 0 },
          typeChanged: false,
          remembered: input.rejections.remember.length,
          forgotten: input.rejections.forget.length,
        }
      },
    },
  }
}

test('orchestrator executes Packs before dependent Samples and blocks the Sample it cannot commit', async () => {
  const packId = '00000000-0000-4000-8000-000000000001'
  const sampleId = '00000000-0000-4000-8000-000000000002'
  const packRow = row(packId, {
    proposalKey: '1'.repeat(64),
    subject: { kind: 'pack', identity: { kind: 'catalog', id: packId } },
  })
  const sampleRow = row(sampleId, {
    proposalKey: '2'.repeat(64),
    dependencies: [
      {
        subject: { kind: 'pack', identity: { kind: 'catalog', id: packId } },
        genreKey: 'genre:house',
      },
    ],
  })
  // The Sample is listed first on purpose: ordering must come from the draft.
  const { database, calls } = recorder({ [packId]: 'failed' })
  const result = await executeStandaloneDraft(
    database,
    draftOf([sampleRow, packRow]),
  )
  assert.deepEqual(
    calls.map((call) => call.subject.kind),
    ['pack'],
    'a blocked Sample must not reach the database',
  )
  assert.deepEqual(
    result.results.map((item) => item.outcome),
    ['failed', 'blocked'],
  )
  assert.deepEqual(result.totals, {
    committed: 0,
    stale: 0,
    blocked: 1,
    failed: 1,
  })
})

test('orchestrator splits acceptances and rejection changes per target', async () => {
  const sampleId = '00000000-0000-4000-8000-000000000003'
  const subject = {
    kind: 'sample' as const,
    identity: { kind: 'catalog' as const, id: sampleId },
  }
  const accept = row(sampleId, { proposalKey: '3'.repeat(64) })
  const reject = row(sampleId, {
    proposalKey: '4'.repeat(64),
    decision: 'reject',
    target: {
      dimension: 'instrument',
      key: 'instrument:drums',
      name: 'Drums',
      entityId: null,
    },
  })
  const { database, calls } = recorder()
  await executeStandaloneDraft(
    database,
    draftOf([accept, reject], {
      rejectionChanges: {
        remember: [
          {
            contractVersion: 1,
            subject,
            target: { dimension: 'instrument', key: 'instrument:drums' },
            evidenceKeys: ['5'.repeat(64)],
          },
        ],
        forget: [
          {
            subject,
            target: { dimension: 'genre', key: 'genre:house' },
          },
        ],
      },
    }),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].accepts.length, 1)
  assert.equal(calls[0].accepts[0].key, 'genre:house')
  assert.equal(calls[0].rejections.remember.length, 1)
  assert.equal(calls[0].rejections.forget.length, 1)
})

test('orchestrator maps a stale and a failed target without stopping the batch', async () => {
  const first = '00000000-0000-4000-8000-000000000004'
  const second = '00000000-0000-4000-8000-000000000005'
  const next = '00000000-0000-4000-8000-000000000006'
  const draft = draftOf([
    row(first, { proposalKey: '6'.repeat(64) }),
    row(second, { proposalKey: '7'.repeat(64) }),
    row(next, { proposalKey: '8'.repeat(64) }),
  ])
  const seen: string[] = []
  const database = {
    executeStandaloneClassificationTarget: async (
      input: StandaloneExecutionTargetRequest,
    ): Promise<StandaloneExecutionTargetResult> => {
      seen.push(input.subject.id)
      if (input.subject.id === first) {
        throw Object.assign(new Error('Reviewed state changed.'), {
          code: 'STALE_REVIEW',
        })
      }
      if (input.subject.id === second) {
        throw new Error('x'.repeat(900))
      }
      return {
        subject: input.subject,
        outcome: 'committed',
        assignments: 1,
        created: { instruments: 0, genres: 0 },
        typeChanged: false,
        remembered: 0,
        forgotten: 0,
      }
    },
  }
  const result = await executeStandaloneDraft(database, draft)
  assert.deepEqual(seen, [first, second, next])
  assert.deepEqual(
    result.results.map((item) => item.outcome),
    ['stale', 'failed', 'committed'],
  )
  assert.equal(result.results[1].message?.length, 500)
})

test('orchestrator refuses an import draft instead of silently dropping it', async () => {
  const { database } = recorder()
  await assert.rejects(
    () =>
      executeStandaloneDraft(
        database,
        draftOf([], {
          explicitAssignments: [
            {
              subject: {
                kind: 'sample',
                identity: {
                  kind: 'import',
                  preparationId: 'prep-1',
                  id: 'candidate-1',
                },
              },
              assignments: [
                {
                  dimension: 'genre',
                  key: 'genre:house',
                  name: 'House',
                  entityId: null,
                },
              ],
            },
          ],
        }),
      ),
    /import draft assignments/u,
  )
})
