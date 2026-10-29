import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import path from 'node:path'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import { readClassificationRejections } from '../../db/operations/classification/rejections.ts'
import { readStandaloneClassificationContext } from '../../db/operations/classification/standalone-context.ts'
import { executeStandaloneClassificationTarget } from '../../db/operations/classification/execute.ts'
import { createStandaloneReviewSession } from './standalone-session.ts'
import type { StandaloneReviewDatabase } from './standalone-batch.ts'

function fixture(t: TestContext): ReturnType<typeof createMemoryDatabase> & {
  catalog: StandaloneReviewDatabase
} {
  const connection = createMemoryDatabase(t)
  const catalog: StandaloneReviewDatabase = {
    readStandaloneClassificationContext: async (input) =>
      readStandaloneClassificationContext(connection.db, input),
    readClassificationRejections: async (input) =>
      readClassificationRejections(connection.db, input),
    executeStandaloneClassificationTarget: async (input) =>
      executeStandaloneClassificationTarget(connection.db, input),
  }
  return { ...connection, catalog }
}

function catalogueSample(db: ReturnType<typeof createMemoryDatabase>['db']): {
  id: string
} {
  const root = path.resolve('House')
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  importFolder(db, root, [file])
  importFolder(db, path.join(root, 'Drums'), [file])
  return importFolder(db, root, [file])[0]
}

test('standalone session prepares a review and answers paged proposals without catalog writes', async (t) => {
  const { db, native, catalog } = fixture(t)
  const sample = catalogueSample(db)
  const session = createStandaloneReviewSession(catalog)
  const before = native.serialize()

  const prepared = await session.prepare({
    subjects: [{ kind: 'sample', id: sample.id }],
  })

  assert.equal(prepared.contractVersion, 1)
  assert.equal(prepared.targets, 1)
  assert.deepEqual(prepared.subjectScope, [{ kind: 'sample', id: sample.id }])
  assert.match(prepared.reviewId, /\S/u)
  assert.equal(prepared.revision, 1)

  const page = session.listProposals({
    reviewId: prepared.reviewId,
    revision: prepared.revision,
    token: prepared.token,
    limit: 100,
  })
  assert.ok(page.total >= 1)
  assert.equal(page.nextOffset, null)
  assert.deepEqual(
    native.serialize(),
    before,
    'review preparation must not write',
  )

  const staged = session.stage({
    reviewId: page.reviewId,
    revision: page.revision,
    token: page.token,
    choices: [{ proposalKey: page.items[0].proposalKey, decision: 'accept' }],
  })
  assert.equal(staged.accepted, 1)
  assert.deepEqual(
    native.serialize(),
    before,
    'staging acceptances must not write the catalog',
  )

  session.discard({ reviewId: prepared.reviewId })
  assert.throws(
    () =>
      session.listProposals({
        reviewId: prepared.reviewId,
        revision: staged.revision,
        token: staged.token,
      }),
    /no longer available/u,
  )
  assert.deepEqual(
    native.serialize(),
    before,
    'discard must not write the catalog',
  )
})

test('standalone session keeps prepared reviews independent and borrows no renderer scope', async (t) => {
  const { db, catalog } = fixture(t)
  const first = catalogueSample(db)
  const session = createStandaloneReviewSession(catalog)

  const a = await session.prepare({
    subjects: [{ kind: 'sample', id: first.id }],
  })
  const b = await session.prepare({
    subjects: [{ kind: 'sample', id: first.id }],
  })

  assert.notEqual(a.reviewId, b.reviewId)
  session.discard({ reviewId: a.reviewId })
  assert.doesNotThrow(() =>
    session.listProposals({
      reviewId: b.reviewId,
      revision: b.revision,
      token: b.token,
    }),
  )
})

test('standalone session rejects unknown reviews and stale references', async (t) => {
  const { db, catalog } = fixture(t)
  const sample = catalogueSample(db)
  const session = createStandaloneReviewSession(catalog)
  const prepared = await session.prepare({
    subjects: [{ kind: 'sample', id: sample.id }],
  })

  assert.throws(
    () =>
      session.listProposals({
        reviewId: 'missing-review',
        revision: 1,
        token: prepared.token,
      }),
    /no longer available/u,
  )
  assert.throws(
    () =>
      session.stage({
        reviewId: prepared.reviewId,
        revision: prepared.revision,
        token: 'b'.repeat(64),
        choices: [{ proposalKey: prepared.token, decision: 'accept' }],
      }),
    /Reload|stale/u,
  )
  assert.throws(
    () => session.discard({ reviewId: 'missing-review' }),
    /no longer available/u,
  )
})

test('standalone session validates every request before touching stored reviews', async (t) => {
  const { db, catalog } = fixture(t)
  catalogueSample(db)
  const session = createStandaloneReviewSession(catalog)

  // Deliberately invalid payloads cross the IPC boundary as untrusted input.
  const invalid: unknown[] = [
    {},
    { subjects: [] },
    { subjects: [{ kind: 'sample', id: '/kick.wav' }] },
    { reviewId: 'x', revision: 1, token: 'a'.repeat(64) },
    { reviewId: 'x', revision: 0, token: 'a'.repeat(64) },
  ]
  const [empty, noSubjects, uncontrolledPath, bareStage, staleAcceptAll] =
    invalid as [
      Record<string, never>,
      { subjects: unknown[] },
      { subjects: { kind: string; id: string }[] },
      { reviewId: string; revision: number; token: string },
      { reviewId: string; revision: number; token: string },
    ]

  await assert.rejects(() => session.prepare(noSubjects as never))
  await assert.rejects(() => session.prepare(uncontrolledPath as never))
  await assert.rejects(() => session.prepare(empty as never), /review/u)
  assert.throws(() => session.listProposals(empty as never), /review/u)
  assert.throws(() => session.stage(bareStage as never), /review/u)
  assert.throws(() => session.acceptAll(staleAcceptAll as never), /review/u)
  assert.throws(() => session.discard(empty as never), /review/u)
})
