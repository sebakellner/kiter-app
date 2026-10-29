import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import path from 'node:path'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
} from '../../db/operations/packs/operations.ts'
import {
  listGenres,
  setGenreAssignment,
} from '../../db/operations/classification/genres.ts'
import {
  createInstrument,
  setInstrumentAssignment,
} from '../../db/operations/classification/operations.ts'
import {
  applyClassificationRejections,
  readClassificationRejections,
} from '../../db/operations/classification/rejections.ts'
import { readStandaloneClassificationContext } from '../../db/operations/classification/standalone-context.ts'
import type {
  ClassificationBatchReview,
  ClassificationReviewRow,
} from './batch-review.ts'
import {
  prepareStandaloneReview,
  refreshStandaloneReview,
  type StandaloneReviewDatabase,
} from './standalone-batch.ts'
import { executeStandaloneClassificationTarget } from '../../db/operations/classification/execute.ts'

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

function rows(review: ClassificationBatchReview): ClassificationReviewRow[] {
  return review.listProposals({ ...review.getReference(), limit: 100 }).items
}

test('standalone review proposes cataloged recognition evidence for an imported Sample without writes', async (t) => {
  const { db, native, catalog } = fixture(t)
  const root = path.resolve('House')
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  const sample = importFolder(db, root, [file])[0]
  importFolder(db, path.join(root, 'Drums'), [file])
  const before = native.serialize()
  const prepared = await prepareStandaloneReview(catalog, [
    { kind: 'sample', id: sample.id },
  ])
  assert.match(prepared.token, /^[a-f0-9]{64}$/u)
  const summary = prepared.review.getSummary()
  assert.equal(summary.targets, 1)
  assert.equal(summary.proposals, 3)
  assert.equal(summary.reviewable, 3)
  // The bootstrap catalog already owns "House"; Drums and Kick still need creation.
  assert.equal(summary.requiredCreations, 2)
  const items = rows(prepared.review)
  assert.deepEqual(items.map((item) => item.target.key).sort(), [
    'genre:house',
    'instrument:drums',
    'instrument:kick',
  ])
  for (const item of items) {
    assert.deepEqual(item.subject, {
      kind: 'sample',
      identity: { kind: 'catalog', id: sample.id },
    })
    assert.ok(
      item.evidence.every(
        (evidence) =>
          evidence.kind === 'path' && evidence.availability === 'cataloged',
      ),
    )
  }
  // Overlapping roots contribute one physical clue for the shared folder.
  const drums = items.find((item) => item.target.key === 'instrument:drums')
  assert.equal(drums?.evidence.length, 1)
  const drumsEvidence = drums?.evidence[0]
  assert.equal(drumsEvidence?.kind, 'path')
  if (drumsEvidence?.kind === 'path') {
    assert.equal(drumsEvidence.occurrence, path.join(root, 'Drums'))
    assert.equal(drumsEvidence.component, 'folder')
  }
  const kick = items.find((item) => item.target.key === 'instrument:kick')
  const kickEvidence = kick?.evidence[0]
  assert.equal(kickEvidence?.kind, 'path')
  if (kickEvidence?.kind === 'path') {
    assert.equal(kickEvidence.occurrence, file.path)
    assert.equal(kickEvidence.component, 'filename')
  }
  assert.ok(kick)
  prepared.review.stage({
    ...prepared.review.getReference(),
    choices: [{ proposalKey: kick.proposalKey, decision: 'accept' }],
  })
  assert.equal(prepared.review.getSummary().accepted, 1)
  assert.deepEqual(native.serialize(), before)
  prepared.review.discard()
  assert.throws(() => prepared.review.getSummary(), { code: 'NOT_FOUND' })
  assert.deepEqual(native.serialize(), before)
})

test('standalone review binds Pack root evidence and origin Pack Genre evidence', async (t) => {
  const { db, catalog } = fixture(t)
  const root = path.resolve('Techno')
  const file = makeDiscoveredAudioFile(root, 'kick.wav')
  const sample = importFolder(db, root, [file])[0]
  const source = getPackSourceRoot(db, root)
  const pack = importPack(db, {
    sourceRootId: source.id,
    name: 'Pack',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  const house = listGenres(db, { search: 'House' }).items.find(
    (genre) => genre.name === 'House',
  )
  assert.ok(house)
  setGenreAssignment(db, {
    id: house.id,
    target: { kind: 'pack', id: pack.id },
    assigned: true,
  })
  const prepared = await prepareStandaloneReview(catalog, [
    { kind: 'pack', id: pack.id },
    { kind: 'sample', id: sample.id },
  ])
  const snapshotPack = prepared.snapshot.targets.find(
    (target) => target.subject.kind === 'pack',
  )
  assert.equal(snapshotPack?.currentType, null)
  assert.deepEqual(snapshotPack?.assignments, [
    { dimension: 'genre', key: 'genre:house' },
  ])
  const items = rows(prepared.review)
  const packRows = items.filter((item) => item.subject.kind === 'pack')
  assert.deepEqual(
    packRows.map((item) => item.target.key),
    ['genre:techno'],
  )
  const packEvidence = packRows[0].evidence[0]
  assert.equal(packEvidence.kind, 'path')
  if (packEvidence.kind === 'path') {
    assert.equal(packEvidence.component, 'root')
    assert.equal(packEvidence.occurrence, root)
    assert.equal(packEvidence.availability, 'cataloged')
  }
  const sampleHouse = items.find(
    (item) =>
      item.subject.kind === 'sample' && item.target.key === 'genre:house',
  )
  assert.deepEqual(sampleHouse?.evidence, [
    { kind: 'pack-genre', packId: pack.id, genreKey: 'genre:house' },
  ])
  assert.equal(sampleHouse?.reviewable, true)
})

test('remembered rejections make proposals non-reviewable without hiding new evidence', async (t) => {
  const { db, catalog } = fixture(t)
  const root = path.resolve('House')
  const sample = importFolder(db, root, [makeDiscoveredAudioFile(root)])[0]
  const first = await prepareStandaloneReview(catalog, [
    { kind: 'sample', id: sample.id },
  ])
  const kick = rows(first.review).find(
    (item) => item.target.key === 'instrument:kick',
  )
  assert.ok(kick && kick.reviewable && !kick.remembered)
  applyClassificationRejections(db, {
    remember: [
      {
        contractVersion: 1,
        subject: kick.subject,
        target: { dimension: kick.target.dimension, key: kick.target.key },
        evidenceKeys: kick.evidenceKeys,
      },
    ],
    forget: [],
  })
  const second = await prepareStandaloneReview(catalog, [
    { kind: 'sample', id: sample.id },
  ])
  const remembered = rows(second.review).find(
    (item) => item.proposalKey === kick.proposalKey,
  )
  assert.equal(remembered?.remembered, true)
  assert.equal(remembered?.reviewable, false)
  const summary = second.review.getSummary()
  assert.equal(summary.remembered, 1)
  assert.equal(summary.reviewable, 1)
})

test('refresh retains unrelated staged decisions and invalidates changed catalog inputs', async (t) => {
  const { db, catalog } = fixture(t)
  const rootA = path.resolve('Techno')
  const a = importFolder(db, rootA, [
    makeDiscoveredAudioFile(rootA, path.join('Drums', 'kick.wav')),
  ])[0]
  const rootB = path.resolve('Jazz')
  const b = importFolder(db, rootB, [
    makeDiscoveredAudioFile(rootB, 'snare.wav'),
  ])[0]
  const subjects = [
    { kind: 'sample' as const, id: a.id },
    { kind: 'sample' as const, id: b.id },
  ]
  const prepared = await prepareStandaloneReview(catalog, subjects)
  const items = rows(prepared.review)
  const kick = items.find(
    (item) =>
      item.subject.identity.id === a.id &&
      item.target.key === 'instrument:kick',
  )
  const snare = items.find(
    (item) =>
      item.subject.identity.id === b.id &&
      item.target.key === 'instrument:snare',
  )
  assert.ok(kick && snare)
  prepared.review.stage({
    ...prepared.review.getReference(),
    choices: [
      { proposalKey: kick.proposalKey, decision: 'accept' },
      { proposalKey: snare.proposalKey, decision: 'accept' },
    ],
  })
  const snareRecord = createInstrument(db, { name: 'Snare' })
  setInstrumentAssignment(db, {
    id: snareRecord.id,
    target: { kind: 'sample', id: b.id },
    assigned: true,
  })
  const result = await refreshStandaloneReview(
    catalog,
    prepared.review,
    subjects,
  )
  assert.equal(result.invalidated, 1)
  assert.equal(result.accepted, 1)
  const after = rows(prepared.review)
  assert.equal(
    after.find((item) => item.proposalKey === kick.proposalKey)?.decision,
    'accept',
  )
  const snareAfter = after.find(
    (item) => item.proposalKey === snare.proposalKey,
  )
  assert.equal(snareAfter?.assigned, true)
  assert.equal(snareAfter?.reviewable, false)
  assert.equal(snareAfter?.decision, 'unreviewed')
})

test('standalone review validates subjects and detects incomplete or changing context pages', async (t) => {
  const { db, catalog } = fixture(t)
  const root = path.resolve('House')
  const sample = importFolder(db, root, [makeDiscoveredAudioFile(root)])[0]
  const subject = { kind: 'sample' as const, id: sample.id }
  await assert.rejects(prepareStandaloneReview(catalog, []), {
    code: 'INVALID_INPUT',
  })
  await assert.rejects(prepareStandaloneReview(catalog, [subject, subject]), {
    code: 'INVALID_INPUT',
  })
  await assert.rejects(
    prepareStandaloneReview(catalog, [{ kind: 'sample', id: 'nope' }]),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(
    prepareStandaloneReview(
      catalog,
      Array.from({ length: 101 }, (_, index) => ({
        kind: 'sample' as const,
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    ),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(
    prepareStandaloneReview(catalog, [
      { kind: 'sample', id: '10000000-0000-4000-8000-000000000001' },
    ]),
    { code: 'STALE_REVIEW' },
  )
  const truncated: StandaloneReviewDatabase = {
    ...catalog,
    readStandaloneClassificationContext: async (input) => {
      const result = await catalog.readStandaloneClassificationContext(input)
      return { ...result, vocabulary: result.vocabulary.slice(1) }
    },
  }
  await assert.rejects(prepareStandaloneReview(truncated, [subject]), {
    code: 'PROTOCOL_ERROR',
  })
  let calls = 0
  const changing: StandaloneReviewDatabase = {
    ...catalog,
    readStandaloneClassificationContext: async (input) => {
      const result = await catalog.readStandaloneClassificationContext(input)
      calls++
      if (calls === 2 && result.targets[0]) {
        return {
          ...result,
          targets: [{ ...result.targets[0], currentType: 'loop' as const }],
        }
      }
      return result
    },
  }
  await assert.rejects(prepareStandaloneReview(changing, [subject]), {
    code: 'STALE_REVIEW',
  })
})
