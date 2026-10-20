import assert from 'node:assert/strict'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises'
import { deferred } from '../../../../tests/support/fixtures/deferred.ts'
import { createTemporaryDirectory } from '../../../../tests/support/filesystem/temporary-directory.ts'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { readImportCatalog } from '../../db/operations/sources/import-snapshot.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import { setFavorite } from '../../db/operations/samples/favorites.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
  setSampleOrigin,
} from '../../db/operations/packs/operations.ts'
import { excludedSources } from '../../db/schema/sources.ts'
import { ImportPreparationService } from './preparation.ts'
import { PreparationSpool } from './spool.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import type { DbClient } from '../../db'
import type { ImportPreparation, PreparationRequest } from './types.ts'

function request(preparation: ImportPreparation): PreparationRequest {
  return { preparationId: preparation.id, revision: preparation.revision }
}

async function fixture(
  t: TestContext,
  names: string[],
): Promise<{
  db: ReturnType<typeof createMemoryDatabase>['db']
  native: ReturnType<typeof createMemoryDatabase>['native']
  root: string
  spool: string
  service: ImportPreparationService
  temporary: Awaited<ReturnType<typeof createTemporaryDirectory>>
  catalog: Pick<DbClient, 'readImportCatalog'>
}> {
  const temporary = await createTemporaryDirectory(t, 'import-review')
  const { db, native } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const spool = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(spool)
  for (const name of names) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), `original ${name}`)
  }
  const catalog = {
    readImportCatalog: async (input: Parameters<typeof readImportCatalog>[1]) =>
      readImportCatalog(db, input),
  }
  const service = new ImportPreparationService(catalog, spool)
  temporary.beforeRemove(() => service.close())
  return { db, native, root, spool, service, temporary, catalog }
}

test('file and unloaded subtree selection are versioned, atomic and catalog-read-only', async (t) => {
  const names = Array.from({ length: 107 }, (_, i) => `sub/${i}.wav`)
  const { service, native, root, spool } = await fixture(t, [
    ...names,
    'outside.wav',
  ])
  const before = native.serialize()
  let preparation = await service.prepare([root])
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  const first = await service.listCandidates({
    ...request(preparation),
    limit: 1,
  })
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  assert.equal(preparation.revision, 2)
  await assert.rejects(
    service.setMode({
      preparationId: preparation.id,
      revision: 1,
      mode: 'pack',
    }),
    { code: 'STALE_REVIEW' },
  )
  await assert.rejects(
    service.listCandidates({
      ...request(preparation),
      cursor: first.nextCursor ?? undefined,
    }),
    { code: 'STALE_REVIEW' },
  )
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId: preparation.roots[0].id,
    relativePath: 'sub',
    selected: false,
  })
  const page = await service.listCandidates({
    ...request(preparation),
    limit: 100,
  })
  assert.ok(
    page.items
      .filter((item) =>
        item.occurrences[0].relativePath.startsWith(`sub${path.sep}`),
      )
      .every((item) => !item.selected),
  )
  const seal = await service.review(request(preparation))
  assert.equal(seal.selectedCount, 1)
  const reviewed = await service.listReview({
    ...request(preparation),
    reviewToken: seal.reviewToken,
  })
  assert.deepEqual(
    reviewed.items.map((item) => item.file.name),
    ['outside.wav'],
  )
  assert.equal(service.get(preparation.id).state, 'reviewed')
  assert.equal(
    (await service.review(request(preparation))).reviewToken,
    seal.reviewToken,
  )
  await assert.rejects(
    service.listCandidates({
      ...request(preparation),
      cursor:
        reviewed.nextCursor ??
        Buffer.from(
          JSON.stringify({
            ...request(preparation),
            kind: 'review',
            reviewToken: seal.reviewToken,
            offset: 0,
          }),
        ).toString('base64url'),
    }),
    { code: 'STALE_REVIEW' },
  )
  assert.deepEqual(native.serialize(), before)
  for (const name of names) {
    assert.equal(
      await readFile(path.join(root, name), 'utf8'),
      `original ${name}`,
    )
  }
  await service.discard(preparation.id, preparation.revision)
  assert.deepEqual(await readdir(spool), [])
  assert.deepEqual(native.serialize(), before)
})

test('invalid, duplicate, foreign and oversized choices preserve the complete prior draft', async (t) => {
  const { service, db, root } = await fixture(t, ['one.wav', 'excluded.wav'])
  db.insert(excludedSources)
    .values({ canonicalPath: path.join(root, 'excluded.wav') })
    .run()
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const page = await service.listCandidates(request(preparation))
  const one = page.items.find((item) => item.file.name === 'one.wav')!
  const excluded = page.items.find((item) => item.catalog.excluded)!
  assert.equal(one.selected, true)
  assert.equal(excluded.selected, false)
  const invalidChoices = [
    [
      { candidateId: one.id, selected: false },
      { candidateId: excluded.id, selected: true },
    ],
    [
      { candidateId: one.id, selected: false },
      { candidateId: one.id, selected: true },
    ],
    [{ candidateId: 'f'.repeat(64), selected: false }],
    Array.from({ length: 101 }, () => ({
      candidateId: one.id,
      selected: false,
    })),
  ]
  for (const choices of invalidChoices) {
    await assert.rejects(
      async () => service.setSelection({ ...request(preparation), choices }),
      { code: 'INVALID_INPUT' },
    )
    assert.deepEqual(service.get(preparation.id), preparation)
    assert.deepEqual(await service.listCandidates(request(preparation)), page)
  }
  for (const relativePath of [
    '../escape',
    '/absolute',
    `sub${path.sep}..${path.sep}escape`,
    'nonexistent',
  ]) {
    await assert.rejects(
      async () =>
        service.setSubtreeSelection({
          ...request(preparation),
          rootId: preparation.roots[0].id,
          relativePath,
          selected: false,
        }),
      { code: 'INVALID_INPUT' },
    )
    assert.equal(service.get(preparation.id).revision, preparation.revision)
  }
})

test('sealed review pages include all selected files once and reject altered tokens and stale revisions', async (t) => {
  const { service, root } = await fixture(
    t,
    Array.from({ length: 108 }, (_, i) => `${i}.wav`),
  )
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const seal = await service.review(request(preparation))
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await service.listReview({
      ...request(preparation),
      reviewToken: seal.reviewToken,
      cursor,
    })
    assert.ok(page.items.length <= 50)
    assert.equal(page.total, 108)
    ids.push(...page.items.map((item) => item.id))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  assert.equal(new Set(ids).size, 108)
  await assert.rejects(
    service.listReview({ ...request(preparation), reviewToken: 'forged' }),
    { code: 'STALE_REVIEW' },
  )
  const previous = request(preparation)
  preparation = await service.setSelection({
    ...previous,
    choices: [{ candidateId: ids[0], selected: false }],
  })
  await assert.rejects(
    service.listReview({ ...previous, reviewToken: seal.reviewToken }),
    { code: 'STALE_REVIEW' },
  )
  await assert.rejects(
    service.listReview({
      ...request(preparation),
      reviewToken: seal.reviewToken,
    }),
    { code: 'STALE_REVIEW' },
  )
  const refreshed = await service.review(request(preparation))
  assert.equal(refreshed.selectedCount, 107)
  assert.notEqual(refreshed.reviewToken, seal.reviewToken)
})

test('overlap destinations are explicit and changing them invalidates individual origin decisions', async (t) => {
  const { service, db, native, root } = await fixture(t, [
    'outer.wav',
    'sub/one.wav',
    'sub/two.wav',
  ])
  const nested = path.join(root, 'sub')
  const imported = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'sub/one.wav'),
  ])
  setSampleOrigin(db, { sampleId: imported[0].id, packId: null })
  const before = native.serialize()
  let preparation = await service.prepare([root, nested])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  const [outerRoot, nestedRoot] = preparation.roots
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  const page = await service.listCandidates(request(preparation))
  const one = page.items.find((item) => item.file.name === 'one.wav')!
  const two = page.items.find((item) => item.file.name === 'two.wav')!
  assert.equal(one.destinationRootId, null)
  preparation = await service.setDestinations({
    ...request(preparation),
    choices: [
      { candidateId: one.id, destinationRootId: nestedRoot.id },
      { candidateId: two.id, destinationRootId: nestedRoot.id },
    ],
  })
  await assert.rejects(
    service.setOriginDecisions({
      ...request(preparation),
      choices: [
        {
          candidateId: two.id,
          destinationRootId: nestedRoot.id,
          resolution: 'keep',
        },
      ],
    }),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [
      {
        candidateId: one.id,
        destinationRootId: nestedRoot.id,
        resolution: 'keep',
      },
    ],
  })
  const seal = await service.review(request(preparation))
  assert.equal(seal.selectedCount, 3)
  assert.equal(seal.conflictCount, 1)
  preparation = await service.setDestinations({
    ...request(preparation),
    choices: [{ candidateId: one.id, destinationRootId: outerRoot.id }],
  })
  const changed = (
    await service.listCandidates(request(preparation))
  ).items.find((item) => item.id === one.id)!
  assert.equal(changed.originResolution, null)
  await assert.rejects(
    service.setOriginDecisions({
      ...request(preparation),
      choices: [
        {
          candidateId: one.id,
          destinationRootId: nestedRoot.id,
          resolution: 'assign',
        },
      ],
    }),
    { code: 'INVALID_INPUT' },
  )
  assert.deepEqual(native.serialize(), before)
})

test('new Packs require prospective members and validated presentation; standalone preserves manual origins', async (t) => {
  const { service, db, root, native } = await fixture(t, ['manual.wav'])
  const imported = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'manual.wav'),
  ])
  setSampleOrigin(db, { sampleId: imported[0].id, packId: null })
  const before = native.serialize()
  let preparation = await service.prepare([root])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  const rootId = preparation.roots[0].id
  const candidate = (await service.listCandidates(request(preparation)))
    .items[0]
  assert.equal(candidate.originConflict, true)
  await assert.rejects(
    async () =>
      service.setPackDetails({ ...request(preparation), rootId, name: '   ' }),
    { code: 'INVALID_INPUT' },
  )
  preparation = await service.setPackDetails({
    ...request(preparation),
    rootId,
    name: '  Reviewed Pack  ',
    description: 'Description',
  })
  assert.deepEqual(preparation.packDetails[rootId], {
    name: 'Reviewed Pack',
    description: 'Description',
  })
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [
      {
        candidateId: candidate.id,
        destinationRootId: rootId,
        resolution: 'keep',
      },
    ],
  })
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [
      {
        candidateId: candidate.id,
        destinationRootId: rootId,
        resolution: 'assign',
      },
    ],
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  assert.equal((await service.review(request(preparation))).conflictCount, 0)
  const standalone = (await service.listCandidates(request(preparation)))
    .items[0]
  assert.equal(standalone.catalog.sample?.packId, null)
  assert.equal(standalone.catalog.sample?.originAssignment, 'manual')
  assert.equal(standalone.originResolution, null)
  assert.deepEqual(native.serialize(), before)
})

test('existing Pack presentation and already matching manual origins remain untouched', async (t) => {
  const { service, db, native, root } = await fixture(t, ['one.wav'])
  const imported = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'one.wav'),
  ])
  const sourceRoot = getPackSourceRoot(db, root)
  const review = reviewPackImport(db, sourceRoot.id)
  const pack = importPack(db, {
    sourceRootId: sourceRoot.id,
    name: 'Edited Pack',
    description: 'Stored description',
    token: review.token,
    decisions: [],
  })
  setSampleOrigin(db, { sampleId: imported[0].id, packId: pack.id })
  const before = native.serialize()
  let preparation = await service.prepare([root])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  assert.equal(preparation.roots[0].catalog?.pack?.name, 'Edited Pack')
  await assert.rejects(
    service.setPackDetails({
      ...request(preparation),
      rootId: preparation.roots[0].id,
      name: 'Overwrite',
    }),
    { code: 'INVALID_INPUT' },
  )
  const seal = await service.review(request(preparation))
  assert.equal(seal.conflictCount, 0)
  const candidate = (
    await service.listReview({
      ...request(preparation),
      reviewToken: seal.reviewToken,
    })
  ).items[0]
  assert.equal(candidate.catalog.sample?.originAssignment, 'manual')
  assert.equal(candidate.originResolution, null)
  assert.deepEqual(native.serialize(), before)
})

test('another Pack origin requires exactly one individual keep or assign decision', async (t) => {
  const { service, db, native, root } = await fixture(t, [
    'sub/conflict.wav',
    'sub/matching.wav',
  ])
  const files = ['sub/conflict.wav', 'sub/matching.wav'].map((name) =>
    makeDiscoveredAudioFile(root, name),
  )
  const samples = importFolder(db, root, files)
  const outer = getPackSourceRoot(db, root)
  const original = importPack(db, {
    sourceRootId: outer.id,
    name: 'Original',
    token: reviewPackImport(db, outer.id).token,
    decisions: [],
  })
  const nested = path.join(root, 'sub')
  importFolder(
    db,
    nested,
    files.map((file) => ({ ...file, relativePath: file.name })),
  )
  const destination = getPackSourceRoot(db, nested)
  const pack = importPack(db, {
    sourceRootId: destination.id,
    name: 'Destination',
    token: reviewPackImport(db, destination.id).token,
    decisions: samples.map((sample) => ({
      sampleId: sample.id,
      resolution: 'assign',
    })),
  })
  setSampleOrigin(db, { sampleId: samples[0].id, packId: original.id })
  const before = native.serialize()
  let preparation = await service.prepare([nested])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  const page = await service.listCandidates(request(preparation))
  const conflict = page.items.find(
    (item) => item.catalog.sample?.id === samples[0].id,
  )!
  assert.equal(conflict.catalog.sample?.packId, original.id)
  assert.equal(conflict.originConflict, true)
  assert.equal(preparation.roots[0].catalog?.pack?.id, pack.id)
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  const decision = {
    candidateId: conflict.id,
    destinationRootId: preparation.roots[0].id,
    resolution: 'keep' as const,
  }
  await assert.rejects(
    service.setOriginDecisions({
      ...request(preparation),
      choices: [decision, decision],
    }),
    { code: 'INVALID_INPUT' },
  )
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [decision],
  })
  assert.equal((await service.review(request(preparation))).conflictCount, 1)
  assert.deepEqual(native.serialize(), before)
})

test('relevant catalog changes invalidate a seal; rescan retains presentation but requires fresh selection and origin review', async (t) => {
  const { service, db, root } = await fixture(t, ['one.wav'])
  const imported = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'one.wav'),
  ])
  let preparation = await service.prepare([root])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  preparation = await service.setPackDetails({
    ...request(preparation),
    rootId: preparation.roots[0].id,
    name: 'Keep draft',
  })
  const oldSeal = await service.review(request(preparation))
  setFavorite(db, imported[0].id, true)
  assert.equal(
    (await service.review(request(preparation))).reviewToken,
    oldSeal.reviewToken,
  )
  setSampleOrigin(db, { sampleId: imported[0].id, packId: null })
  await assert.rejects(service.review(request(preparation)), {
    code: 'STALE_REVIEW',
  })
  preparation = service.get(preparation.id)
  assert.equal(preparation.state, 'blocked')
  assert.equal(preparation.roots[0].issues[0].code, 'REVIEW_CHANGED')
  await assert.rejects(
    service.listReview({
      ...request(preparation),
      reviewToken: oldSeal.reviewToken,
    }),
    { code: 'STALE_REVIEW' },
  )
  preparation = await service.rescanRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  assert.equal(
    preparation.packDetails[preparation.roots[0].id].name,
    'Keep draft',
  )
  const candidate = (await service.listCandidates(request(preparation)))
    .items[0]
  assert.equal(candidate.selected, false)
  assert.equal(candidate.needsSelectionReview, true)
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.setSelection({
    ...request(preparation),
    choices: [{ candidateId: candidate.id, selected: true }],
  })
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [
      {
        candidateId: candidate.id,
        destinationRootId: preparation.roots[0].id,
        resolution: 'assign',
      },
    ],
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
})

test('added and changed files invalidate discovery, and rescanning preserves unrelated choices', async (t) => {
  const { service, root, temporary } = await fixture(t, ['one.wav'])
  const unrelated = path.join(temporary.path, 'other')
  await mkdir(unrelated)
  await writeFile(path.join(unrelated, 'other.wav'), 'other')
  let preparation = await service.prepare([root, unrelated])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const original = (await service.listCandidates(request(preparation))).items
  const other = original.find((item) => item.file.name === 'other.wav')!
  preparation = await service.setSelection({
    ...request(preparation),
    choices: [{ candidateId: other.id, selected: false }],
  })
  await service.review(request(preparation))
  await writeFile(path.join(root, 'added.wav'), 'added')
  await writeFile(path.join(root, 'one.wav'), 'changed audio observations')
  await assert.rejects(service.review(request(preparation)), {
    code: 'STALE_REVIEW',
  })
  preparation = service.get(preparation.id)
  preparation = await service.rescanRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const refreshed = (await service.listCandidates(request(preparation))).items
  assert.equal(refreshed.length, 3)
  assert.equal(refreshed.find((item) => item.id === other.id)?.selected, false)
  assert.equal(
    refreshed.find((item) => item.id === other.id)?.needsSelectionReview,
    false,
  )
  assert.ok(
    refreshed
      .filter((item) => item.id !== other.id)
      .every((item) => !item.selected && item.needsSelectionReview),
  )
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId: preparation.roots[0].id,
    relativePath: '',
    selected: true,
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 2)
})

test('rescan invalidates the entire changed peer-root selection even for a same-count replacement', async (t) => {
  const { service, root, temporary } = await fixture(t, ['one.wav'])
  const peer = path.join(temporary.path, 'peer')
  await mkdir(peer)
  await writeFile(path.join(peer, 'kept.wav'), 'kept')
  await writeFile(path.join(peer, 'removed.wav'), 'removed')
  let preparation = await service.prepare([root, peer])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const kept = (await service.listCandidates(request(preparation))).items.find(
    (item) => item.file.name === 'kept.wav',
  )!
  await unlink(path.join(peer, 'removed.wav'))
  await writeFile(path.join(peer, 'replacement.wav'), 'replacement')
  preparation = await service.rescanRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const refreshed = (await service.listCandidates(request(preparation))).items
  assert.equal(
    refreshed.find((item) => item.id === kept.id)?.needsSelectionReview,
    true,
  )
  assert.ok(refreshed.every((item) => !item.selected))
})

test('root removal preserves shared candidates once and invalidates their dependent choices without rediscovery', async (t) => {
  const { service, root, native, spool } = await fixture(t, [
    'outer.wav',
    'sub/shared.wav',
  ])
  const nested = path.join(root, 'sub')
  const before = native.serialize()
  let preparation = await service.prepare([root, nested])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const original = (
    await service.listCandidates(request(preparation))
  ).items.find((item) => item.file.name === 'shared.wav')!
  preparation = await service.removeRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  assert.equal(preparation.candidateCount, 1)
  assert.equal(preparation.roots.length, 1)
  const shared = (await service.listCandidates(request(preparation))).items[0]
  assert.equal(shared.id, original.id)
  assert.deepEqual(
    shared.occurrences.map((item) => item.rootId),
    [preparation.roots[0].id],
  )
  assert.equal(shared.selected, false)
  assert.equal(shared.needsSelectionReview, true)
  assert.equal((await readdir(spool)).length, 1)
  preparation = await service.setSelection({
    ...request(preparation),
    choices: [{ candidateId: shared.id, selected: true }],
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
  preparation = await service.removeRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  assert.equal(preparation.candidateCount, 0)
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  assert.deepEqual(native.serialize(), before)
})

test('removing an incomplete root unblocks the remaining standalone preparation', async (t) => {
  const { service, root, temporary } = await fixture(t, ['one.wav'])
  let preparation = await service.prepare([
    root,
    path.join(temporary.path, 'missing'),
  ])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.removeRoot({
    ...request(preparation),
    rootId: preparation.roots[1].id,
  })
  assert.equal(preparation.state, 'editing')
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
})

test('a missing source invalidates sealed review without adopting a shorter discovery', async (t) => {
  const { service, root } = await fixture(t, ['one.wav', 'removed.wav'])
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  await service.review(request(preparation))
  await unlink(path.join(root, 'removed.wav'))
  await assert.rejects(service.review(request(preparation)), {
    code: 'STALE_REVIEW',
  })
  preparation = service.get(preparation.id)
  assert.equal(preparation.candidateCount, 2)
  assert.equal(preparation.state, 'blocked')
})

test('discard drains an in-flight rescan, rejects concurrent mutation and prevents replacement publication', async (t) => {
  const { service, db, native, root, spool, catalog } = await fixture(t, [
    'one.wav',
  ])
  const before = native.serialize()
  const preparation = await service.prepare([root])
  const reached = deferred<void>()
  const resume = deferred<void>()
  t.mock.method(catalog, 'readImportCatalog', async (input) => {
    reached.resolve()
    await resume.promise
    return readImportCatalog(db, input)
  })
  const rescanning = service.rescanRoot({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  await reached.promise
  await assert.rejects(
    service.setMode({ ...request(preparation), mode: 'standalone' }),
    { code: 'INVALID_INPUT' },
  )
  const discarding = service.discard(preparation.id, preparation.revision)
  assert.throws(() => service.get(preparation.id), { code: 'NOT_FOUND' })
  const rejected = assert.rejects(rescanning, { code: 'NOT_FOUND' })
  resume.resolve()
  await rejected
  await discarding
  assert.deepEqual(await readdir(spool), [])
  assert.deepEqual(native.serialize(), before)
  const next = await service.prepare([root])
  assert.notEqual(next.id, preparation.id)
})

test('close drains review and releases resources while rejecting new preparation work', async (t) => {
  const { service, db, root, spool, catalog } = await fixture(t, ['one.wav'])
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const reached = deferred<void>()
  const resume = deferred<void>()
  t.mock.method(catalog, 'readImportCatalog', async (input) => {
    reached.resolve()
    await resume.promise
    return readImportCatalog(db, input)
  })
  const reviewing = service.review(request(preparation))
  await reached.promise
  const closing = service.close()
  await assert.rejects(
    service.setMode({ ...request(preparation), mode: 'pack' }),
    { code: 'CLOSING' },
  )
  resume.resolve()
  assert.equal((await reviewing).selectedCount, 1)
  await closing
  assert.deepEqual(await readdir(spool), [])
  assert.throws(() => service.get(preparation.id), { code: 'NOT_FOUND' })
})

test('failed rescan retains prior input and preserves both build and cleanup causes for retryable discard', async (t) => {
  const { service, root, spool, catalog } = await fixture(t, ['one.wav'])
  const preparation = await service.prepare([root])
  const original = new Error(`Private catalog error: ${root}`)
  const cleanupError = Object.assign(
    new Error(`Private cleanup error: ${spool}`),
    { code: 'EACCES' },
  )
  t.mock.method(catalog, 'readImportCatalog', async () => {
    throw original
  })
  const dispose = PreparationSpool.prototype.dispose
  let allowCleanup = false
  t.mock.method(
    PreparationSpool.prototype,
    'dispose',
    async function (this: PreparationSpool) {
      if (!allowCleanup) {
        throw cleanupError
      }
      await dispose.call(this)
    },
  )
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  try {
    await assert.rejects(
      service.rescanRoot({
        ...request(preparation),
        rootId: preparation.roots[0].id,
      }),
      (error: unknown) => {
        assert.ok(error instanceof IpcError)
        assert.equal(error.code, 'STORAGE_FAILED')
        assert.ok(error.cause instanceof AggregateError)
        assert.equal(error.cause.errors[0], original)
        const cleanup = error.cause.errors[1]
        assert.ok(cleanup instanceof IpcError)
        assert.equal(cleanup.cause, cleanupError)
        assert.ok(!JSON.stringify(error).includes(root))
        return true
      },
    )
    assert.deepEqual(service.get(preparation.id), preparation)
    assert.deepEqual(
      diagnostics.mock.calls.map((call) => call.arguments),
      [
        ['Import preparation failed:', 'cleanup', 'EACCES'],
        ['Import preparation failed:', 'build', 'UNEXPECTED_ERROR'],
      ],
    )
    assert.equal((await readdir(spool)).length, 2)
    await assert.rejects(
      service.setMode({ ...request(preparation), mode: 'standalone' }),
      { code: 'INVALID_INPUT' },
    )
  } finally {
    allowCleanup = true
  }
  await service.discard(preparation.id, preparation.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('failed old-generation cleanup keeps the published revision inspectable and discard retries all owned resources', async (t) => {
  const { service, root, spool } = await fixture(t, ['one.wav'])
  const preparation = await service.prepare([root])
  const dispose = PreparationSpool.prototype.dispose
  let allowCleanup = false
  t.mock.method(
    PreparationSpool.prototype,
    'dispose',
    async function (this: PreparationSpool) {
      if (!allowCleanup) {
        throw Object.assign(new Error('Private cleanup error'), {
          code: 'EACCES',
        })
      }
      await dispose.call(this)
    },
  )
  t.mock.method(console, 'error', () => undefined)
  try {
    await assert.rejects(
      service.rescanRoot({
        ...request(preparation),
        rootId: preparation.roots[0].id,
      }),
      { code: 'STORAGE_FAILED' },
    )
    const current = service.get(preparation.id)
    assert.equal(current.revision, preparation.revision + 1)
    assert.equal(
      (await service.listCandidates(request(current))).items[0]
        .needsSelectionReview,
      true,
    )
    assert.equal((await readdir(spool)).length, 2)
  } finally {
    allowCleanup = true
  }
  const current = service.get(preparation.id)
  await service.discard(current.id, current.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('failed review revalidation revokes an earlier seal instead of returning it as fresh', async (t) => {
  const { service, root, catalog } = await fixture(t, ['one.wav'])
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const seal = await service.review(request(preparation))
  const cause = new Error(`Private catalog error: ${root}`)
  t.mock.method(catalog, 'readImportCatalog', async () => {
    throw cause
  })
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  await assert.rejects(
    service.review(request(preparation)),
    (error: unknown) => {
      assert.ok(error instanceof IpcError)
      assert.equal(error.code, 'STORAGE_FAILED')
      assert.equal(error.cause, cause)
      assert.ok(!JSON.stringify(error).includes(root))
      return true
    },
  )
  await assert.rejects(
    service.listReview({
      ...request(preparation),
      reviewToken: seal.reviewToken,
    }),
    { code: 'STALE_REVIEW' },
  )
  assert.deepEqual(
    diagnostics.mock.calls.map((call) => call.arguments),
    [['Import preparation failed:', 'review', 'UNEXPECTED_ERROR']],
  )
})

test('unexpected edit and rescan failures log their actual operation without exposing private causes', async (t) => {
  const { service, root, catalog } = await fixture(t, ['one.wav'])
  const preparation = await service.prepare([root])
  const candidate = (await service.listCandidates(request(preparation)))
    .items[0]
  const cause = new Error(`Private preparation error: ${root}`)
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  const read = t.mock.method(PreparationSpool.prototype, 'read', async () => {
    throw cause
  })
  await assert.rejects(
    service.setSelection({
      ...request(preparation),
      choices: [{ candidateId: candidate.id, selected: false }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof IpcError)
      assert.equal(error.code, 'STORAGE_FAILED')
      assert.equal(error.cause, cause)
      assert.ok(!JSON.stringify(error).includes(root))
      return true
    },
  )
  read.mock.restore()
  t.mock.method(catalog, 'readImportCatalog', async () => {
    throw cause
  })
  await assert.rejects(
    service.rescanRoot({
      ...request(preparation),
      rootId: preparation.roots[0].id,
    }),
    { code: 'STORAGE_FAILED' },
  )
  assert.deepEqual(service.get(preparation.id), preparation)
  assert.deepEqual(
    diagnostics.mock.calls.map((call) => call.arguments),
    [
      ['Import preparation failed:', 'set-selection', 'UNEXPECTED_ERROR'],
      ['Import preparation failed:', 'rescan-root', 'UNEXPECTED_ERROR'],
    ],
  )
})

test('invalid suggested Pack names are identified by root before review and remain explicitly correctable', async (t) => {
  const folder = 'a'.repeat(121)
  const { service, root, native } = await fixture(t, [`${folder}/one.wav`])
  const before = native.serialize()
  let preparation = await service.prepare([path.join(root, folder)])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const rootId = preparation.roots[0].id
  assert.deepEqual(preparation.packDetails[rootId], {
    name: folder,
    description: null,
    nameIssue: 'INVALID_NAME',
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  await assert.rejects(service.review(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.rescanRoot({ ...request(preparation), rootId })
  assert.equal(preparation.packDetails[rootId].nameIssue, 'INVALID_NAME')
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId,
    relativePath: '',
    selected: true,
  })
  preparation = await service.setPackDetails({
    ...request(preparation),
    rootId,
    name: 'Reviewed name',
  })
  assert.deepEqual(preparation.packDetails[rootId], {
    name: 'Reviewed name',
    description: null,
  })
  assert.equal((await service.review(request(preparation))).selectedCount, 1)
  assert.deepEqual(native.serialize(), before)
})

test('subtree selection uses normalized native scopes and preserves component boundaries', async (t) => {
  const { service, root } = await fixture(t, [
    'Drums/Kicks/one.wav',
    'Drums/Kicks-extra/two.wav',
  ])
  let preparation = await service.prepare([root])
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId: preparation.roots[0].id,
    relativePath: 'Drums/Kicks/',
    selected: false,
  })
  const candidates = (await service.listCandidates(request(preparation))).items
  assert.equal(
    candidates.find((item) => item.file.name === 'one.wav')?.selected,
    false,
  )
  assert.equal(
    candidates.find((item) => item.file.name === 'two.wav')?.selected,
    true,
  )
})

test('POSIX folders containing a literal backslash select their own subtree, not slash-separated peers', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow literal backslashes in folder names.')
    return
  }
  const { service, root } = await fixture(t, [
    'Drums\\Kicks/one.wav',
    'Drums/Kicks/two.wav',
  ])
  let preparation = await service.prepare([root])
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId: preparation.roots[0].id,
    relativePath: 'Drums\\Kicks',
    selected: false,
  })
  const candidates = (await service.listCandidates(request(preparation))).items
  assert.equal(
    candidates.find((item) => item.file.name === 'one.wav')?.selected,
    false,
  )
  assert.equal(
    candidates.find((item) => item.file.name === 'two.wav')?.selected,
    true,
  )
})
