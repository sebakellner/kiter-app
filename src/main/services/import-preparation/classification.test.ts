import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import path from 'node:path'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createTemporaryDirectory } from '../../../../tests/support/filesystem/temporary-directory.ts'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { deferred } from '../../../../tests/support/fixtures/deferred.ts'
import { readImportCatalog } from '../../db/operations/sources/import-snapshot.ts'
import { readImportClassificationContext } from '../../db/operations/classification/import-context.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import { setFavorite } from '../../db/operations/samples/favorites.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
  setSampleOrigin,
} from '../../db/operations/packs/operations.ts'
import {
  setGenreAssignment,
  createGenre,
} from '../../db/operations/classification/genres.ts'
import { writeRecognitionAlias } from '../../db/operations/classification/vocabulary.ts'
import {
  saveSampleType,
  readSampleType,
} from '../../db/operations/classification/sample-type.ts'
import { ImportPreparationService } from './preparation.ts'
import type { ImportPreparation, PreparationRequest } from './types.ts'
import type { ImportClassificationSummary } from './classification-spool.ts'
import { ClassificationSpool } from './classification-spool.ts'
import { PreparationLimitError } from './spool.ts'

function request(
  preparation: ImportPreparation | ImportClassificationSummary,
): PreparationRequest {
  return {
    preparationId:
      'preparationId' in preparation
        ? preparation.preparationId
        : preparation.id,
    revision: preparation.revision,
  }
}
function reference(
  summary: ImportClassificationSummary,
): PreparationRequest & { classificationToken: string } {
  return {
    ...request(summary),
    classificationToken: summary.classificationToken,
  }
}
async function fixture(t: TestContext): Promise<{
  db: ReturnType<typeof createMemoryDatabase>['db']
  native: ReturnType<typeof createMemoryDatabase>['native']
  temporary: Awaited<ReturnType<typeof createTemporaryDirectory>>
  catalog: {
    readImportCatalog: (
      input: Parameters<typeof readImportCatalog>[1],
    ) => Promise<ReturnType<typeof readImportCatalog>>
    readImportClassificationContext: (
      input: Parameters<typeof readImportClassificationContext>[1],
    ) => Promise<ReturnType<typeof readImportClassificationContext>>
  }
  service: ImportPreparationService
  root: string
  spool: string
}> {
  const { db, native } = createMemoryDatabase(t)
  const temporary = await createTemporaryDirectory(t, 'import-classification')
  const root = path.join(temporary.path, 'House')
  const spool = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(spool)
  const catalog = {
    readImportCatalog: async (input: Parameters<typeof readImportCatalog>[1]) =>
      readImportCatalog(db, input),
    readImportClassificationContext: async (
      input: Parameters<typeof readImportClassificationContext>[1],
    ) => readImportClassificationContext(db, input),
  }
  const service = new ImportPreparationService(catalog, spool)
  temporary.beforeRemove(() => service.close())
  return { db, native, temporary, catalog, service, root, spool }
}
async function audio(root: string, relative: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await writeFile(path.join(root, relative), `original ${relative}`)
}
async function proposals(
  service: ImportPreparationService,
  summary: ImportClassificationSummary,
): Promise<
  Awaited<ReturnType<ImportPreparationService['listClassifications']>>['items']
> {
  const items: Awaited<
    ReturnType<ImportPreparationService['listClassifications']>
  >['items'] = []
  for (let offset = 0; ;) {
    const page = await service.listClassifications({
      ...reference(summary),
      offset,
      limit: 100,
    })
    items.push(...page.items)
    if (page.nextOffset === null) {
      return items
    }
    offset = page.nextOffset
  }
}

test('import classification covers more than 100 targets and Accept all includes unloaded pages without catalog/audio writes', async (t) => {
  const { service, native, root, spool } = await fixture(t)
  for (let index = 0; index < 107; index++) {
    await audio(root, `Loops/kick_${index}.wav`)
  }
  const before = native.serialize()
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.targets, 107)
  assert.equal(summary.proposals, 321)
  assert.equal(summary.requiredCreations, 1)
  const first = await service.listClassifications({
    ...reference(summary),
    limit: 1,
  })
  assert.equal(first.total, 321)
  assert.equal(first.items.length, 1)
  const old = reference(summary)
  summary = await service.acceptAllClassifications(old)
  assert.equal(summary.accepted, 321)
  await assert.rejects(service.listClassifications(old), {
    code: 'STALE_REVIEW',
  })
  const decisions = await service.listClassifications({
    ...reference(summary),
    kind: 'decisions',
    offset: 300,
  })
  assert.equal(decisions.items.length, 21)
  assert.equal(decisions.total, 321)
  assert.ok(decisions.items.every((row) => row.decision === 'accept'))
  const seal = await service.review(request(summary))
  assert.equal(seal.contractVersion, 2)
  assert.match(seal.classificationDigest ?? '', /^[a-f0-9]{64}$/u)
  assert.deepEqual(native.serialize(), before)
  assert.equal(
    await readFile(path.join(root, 'Loops/kick_0.wav'), 'utf8'),
    'original Loops/kick_0.wav',
  )
  await service.discard(summary.preparationId, summary.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('overlapping roots deduplicate physical evidence and destination choice does not remove eligible clues', async (t) => {
  const { service, root, native } = await fixture(t)
  await audio(root, 'Techno/kick.wav')
  await audio(root, 'Techno/snare.wav')
  await audio(root, 'neutral.wav')
  let preparation = await service.prepare([root, path.join(root, 'Techno')])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  const page = await service.listCandidates(request(preparation))
  const kick = page.items.find(
    (candidate) =>
      candidate.file.path === path.join(root, 'Techno', 'kick.wav'),
  )
  const snare = page.items.find(
    (candidate) =>
      candidate.file.path === path.join(root, 'Techno', 'snare.wav'),
  )
  const parent = preparation.roots.find((item) => item.location === root)
  const nested = preparation.roots.find(
    (item) => item.location === path.join(root, 'Techno'),
  )
  assert.ok(kick && snare && parent && nested)
  preparation = await service.setDestinations({
    ...request(preparation),
    choices: [
      {
        candidateId: kick.id,
        destinationRootId: parent.id,
      },
      { candidateId: snare.id, destinationRootId: nested.id },
    ],
  })
  const before = native.serialize()
  let summary = await service.prepareClassifications(request(preparation))
  const rows = (await proposals(service, summary)).filter(
    (row) =>
      row.subject.kind === 'sample' && row.subject.identity.id === kick.id,
  )
  assert.deepEqual(rows.map((row) => row.target.key).sort(), [
    'genre:house',
    'genre:techno',
    'instrument:kick',
  ])
  const techno = rows.find((row) => row.target.key === 'genre:techno')
  assert.equal(techno?.evidence.length, 1)
  preparation = await service.setDestinations({
    ...request(summary),
    choices: [{ candidateId: kick.id, destinationRootId: nested.id }],
  })
  summary = await service.prepareClassifications(request(preparation))
  const redirected = (await proposals(service, summary)).filter(
    (row) =>
      row.subject.kind === 'sample' && row.subject.identity.id === kick.id,
  )
  assert.deepEqual(
    redirected.map((row) => [row.target.key, row.evidence]),
    rows.map((row) => [row.target.key, row.evidence]),
  )
  assert.deepEqual(native.serialize(), before)
})

test('accepted Pack Genres create dependent Sample suggestions that require fresh review', async (t) => {
  const { service, root, native } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  let summary = await service.prepareClassifications(request(preparation))
  const before = native.serialize()
  const packGenre = (await proposals(service, summary)).find(
    (row) => row.subject.kind === 'pack' && row.target.dimension === 'genre',
  )
  assert.ok(packGenre)
  summary = await service.stageClassifications({
    ...reference(summary),
    choices: [{ proposalKey: packGenre.proposalKey, decision: 'accept' }],
  })
  const sampleGenre = (await proposals(service, summary)).find(
    (row) => row.subject.kind === 'sample' && row.target.dimension === 'genre',
  )
  assert.ok(sampleGenre)
  assert.equal(sampleGenre.decision, 'unreviewed')
  assert.equal(sampleGenre.dependencies.length, 1)
  assert.ok(
    sampleGenre.evidence.some((evidence) => evidence.kind === 'pack-genre'),
  )
  summary = await service.stageClassifications({
    ...reference(summary),
    choices: [{ proposalKey: sampleGenre.proposalKey, decision: 'accept' }],
  })
  assert.equal(summary.accepted, 2)
  summary = await service.stageClassifications({
    ...reference(summary),
    choices: [{ proposalKey: packGenre.proposalKey, decision: 'reject' }],
  })
  const refreshed = (await proposals(service, summary)).find(
    (row) => row.subject.kind === 'sample' && row.target.dimension === 'genre',
  )
  assert.equal(refreshed?.decision, 'unreviewed')
  assert.equal(refreshed?.dependencies.length, 0)
  assert.equal(summary.invalidated, 1)
  assert.deepEqual(native.serialize(), before)
})

test('selection edits invalidate only affected drafts and reject old classification and import seals', async (t) => {
  const { service, root } = await fixture(t)
  await audio(root, 'kick.wav')
  await audio(root, 'snare.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  summary = await service.acceptAllClassifications(reference(summary))
  const seal = await service.review(request(summary))
  const candidate = (await service.listCandidates(request(summary))).items[0]
  preparation = await service.setSelection({
    ...request(summary),
    choices: [{ candidateId: candidate.id, selected: false }],
  })
  await assert.rejects(
    service.listClassifications({
      ...request(preparation),
      classificationToken: summary.classificationToken,
    }),
    { code: 'STALE_REVIEW' },
  )
  await assert.rejects(
    service.listReview({
      ...request(preparation),
      reviewToken: seal.reviewToken,
    }),
    { code: 'STALE_REVIEW' },
  )
  summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.targets, 1)
  assert.equal(summary.accepted, 2)
  assert.equal(summary.invalidated, 2)
  preparation = await service.setSelection({
    ...request(summary),
    choices: [{ candidateId: candidate.id, selected: true }],
  })
  summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.accepted, 2)
  assert.equal(summary.proposals, 4)
})

test('strict stale and invalid group choices are atomic, with detached pages and staged rejection evidence', async (t) => {
  const { service, root, native } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  const row = (await proposals(service, summary))[0]
  const before = native.serialize()
  const choice = { proposalKey: row.proposalKey, decision: 'reject' as const }
  for (const choices of [
    [choice, choice],
    [choice, { ...choice, proposalKey: 'f'.repeat(64) }],
  ]) {
    await assert.rejects(
      service.stageClassifications({ ...reference(summary), choices }),
      { code: 'INVALID_INPUT' },
    )
    assert.deepEqual(service.getClassificationSummary(request(summary)), {
      ...summary,
      invalidated: 0,
    })
  }
  const old = reference(summary)
  summary = await service.stageClassifications({ ...old, choices: [choice] })
  assert.equal(summary.rejected, 1)
  await assert.rejects(service.acceptAllClassifications(old), {
    code: 'STALE_REVIEW',
  })
  row.target.key = 'forged'
  row.evidence.length = 0
  const page = await service.listClassifications({
    ...reference(summary),
    kind: 'decisions',
  })
  assert.equal(page.items[0].decision, 'reject')
  assert.ok(page.items[0].evidenceKeys.length > 0)
  assert.ok(page.items[0].target.key !== 'forged')
  assert.deepEqual(native.serialize(), before)
})

test('classification catalog failures preserve the previous generation and discard drains active work', async (t) => {
  const { service, root, catalog, spool } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const read = catalog.readImportClassificationContext
  catalog.readImportClassificationContext = async () => {
    throw new Error('private source path')
  }
  const originalLog = console.error
  console.error = () => undefined
  try {
    await assert.rejects(service.prepareClassifications(request(summary)), {
      code: 'STORAGE_FAILED',
    })
  } finally {
    console.error = originalLog
  }
  assert.equal(
    service.getClassificationSummary(request(summary)).classificationToken,
    summary.classificationToken,
  )
  const entered = deferred()
  const release = deferred()
  catalog.readImportClassificationContext = async (input) => {
    entered.resolve(undefined)
    await release.promise
    return read(input)
  }
  const preparing = service.prepareClassifications(request(summary))
  await entered.promise
  const discarding = service.discard(summary.preparationId, summary.revision)
  release.resolve(undefined)
  await assert.rejects(preparing, { code: 'NOT_FOUND' })
  await discarding
  assert.deepEqual(await readdir(spool), [])
})

test('retained origins supply their own Genres and explicit reassignment refreshes only the affected Sample', async (t) => {
  const { service, db, native, root, temporary } = await fixture(t)
  await audio(root, 'neutral.wav')
  await audio(root, 'kick.wav')
  const imported = importFolder(db, temporary.path, [
    makeDiscoveredAudioFile(temporary.path, path.join('House', 'neutral.wav')),
  ])
  const source = getPackSourceRoot(db, temporary.path)
  const oldPack = importPack(db, {
    sourceRootId: source.id,
    name: 'Old Pack',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  const genre = createGenre(db, { name: 'Tribal' })
  setGenreAssignment(db, {
    id: genre.id,
    target: { kind: 'pack', id: oldPack.id },
    assigned: true,
  })
  let preparation = await service.prepare([root])
  preparation = await service.setMode({ ...request(preparation), mode: 'pack' })
  const candidate = (
    await service.listCandidates(request(preparation))
  ).items.find((candidate) => candidate.catalog.sample?.id === imported[0].id)
  assert.ok(candidate)
  assert.equal(candidate.originConflict, true)
  preparation = await service.setOriginDecisions({
    ...request(preparation),
    choices: [
      {
        candidateId: candidate.id,
        destinationRootId: preparation.roots[0].id,
        resolution: 'keep',
      },
    ],
  })
  let summary = await service.prepareClassifications(request(preparation))
  let rows = await proposals(service, summary)
  const tribal = rows.find(
    (row) =>
      row.subject.identity.id === imported[0].id &&
      row.target.dimension === 'genre' &&
      row.target.name === 'Tribal',
  )
  assert.ok(tribal)
  assert.deepEqual(
    tribal.evidence.map((evidence) => evidence.kind),
    ['pack-genre'],
  )
  summary = await service.acceptAllClassifications(reference(summary))
  const kick = (await proposals(service, summary)).find(
    (row) => row.target.key === 'instrument:kick',
  )
  assert.ok(kick)
  assert.equal(kick.decision, 'accept')
  const before = native.serialize()
  preparation = await service.setOriginDecisions({
    ...request(summary),
    choices: [
      {
        candidateId: candidate.id,
        destinationRootId: preparation.roots[0].id,
        resolution: 'assign',
      },
    ],
  })
  summary = await service.prepareClassifications(request(preparation))
  rows = await proposals(service, summary)
  assert.ok(
    !rows.some(
      (row) => row.target.dimension === 'genre' && row.target.name === 'Tribal',
    ),
  )
  assert.equal(
    rows.find((row) => row.proposalKey === kick.proposalKey)?.decision,
    'accept',
  )
  assert.deepEqual(native.serialize(), before)
})

test('saved Sample types are explicit replacements, manual standalone stays protected and Favorite edits do not invalidate choices', async (t) => {
  const { service, db, root } = await fixture(t)
  await audio(root, 'kick_one_shot.wav')
  const imported = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick_one_shot.wav'),
  ])
  setSampleOrigin(db, { sampleId: imported[0].id, packId: null })
  saveSampleType(db, {
    ...readSampleType(db, { sampleId: imported[0].id }),
    sampleType: 'loop',
  })
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.typeReplacements, 1)
  const type = (await proposals(service, summary)).find(
    (row) => row.target.dimension === 'sample-type',
  )
  assert.equal(type?.currentType, 'loop')
  assert.equal(type?.target.key, 'one-shot')
  assert.ok(
    !(await proposals(service, summary)).some((row) =>
      row.evidence.some((item) => item.kind === 'pack-genre'),
    ),
  )
  summary = await service.acceptAllClassifications(reference(summary))
  setFavorite(db, imported[0].id, true)
  const seal = await service.review(request(summary))
  assert.equal(seal.contractVersion, 2)
  assert.equal(service.getClassificationSummary(request(summary)).accepted, 3)
  assert.equal(
    readSampleType(db, { sampleId: imported[0].id }).sampleType,
    'loop',
  )
})

test('reopening review detects relevant alias changes, preserves unrelated choices and requires a fresh seal', async (t) => {
  const { service, db, root } = await fixture(t)
  await audio(root, 'thud.wav')
  await audio(root, 'snare.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  summary = await service.acceptAllClassifications(reference(summary))
  await service.review(request(summary))
  writeRecognitionAlias(db, { targetKey: 'instrument:kick', term: 'Thud' })
  await assert.rejects(service.review(request(summary)), {
    code: 'STALE_REVIEW',
  })
  preparation = service.get(summary.preparationId)
  summary = service.getClassificationSummary(request(preparation))
  assert.equal(summary.proposals, 4)
  const rows = await proposals(service, summary)
  assert.equal(
    rows.find((row) => row.target.key === 'instrument:kick')?.decision,
    'unreviewed',
  )
  assert.equal(
    rows.find((row) => row.target.key === 'instrument:snare')?.decision,
    'accept',
  )
  assert.equal(summary.accepted, 3)
  const seal = await service.review(request(summary))
  assert.equal(seal.contractVersion, 2)
})

test('vocabulary edits mid-generation reject stale input instead of publishing mixed observations', async (t) => {
  const { service, db, catalog, root } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const read = catalog.readImportClassificationContext
  let changed = false
  catalog.readImportClassificationContext = async (input) => {
    const result = await read(input)
    if (!changed) {
      changed = true
      writeRecognitionAlias(db, { targetKey: 'instrument:kick', term: 'Thud' })
    }
    return result
  }
  await assert.rejects(service.prepareClassifications(request(summary)), {
    code: 'STALE_REVIEW',
  })
  assert.equal(
    service.getClassificationSummary(request(summary)).classificationToken,
    summary.classificationToken,
  )
})

test('post-publication cleanup failures leave the new revision inspectable and block further edits until discard', async (t) => {
  const { service, root, spool } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const original = ClassificationSpool.prototype.dispose
  const originalLog = console.error
  ClassificationSpool.prototype.dispose = async () => {
    throw new Error('private cleanup path')
  }
  console.error = () => undefined
  try {
    await assert.rejects(service.acceptAllClassifications(reference(summary)), {
      code: 'STORAGE_FAILED',
    })
    const current = service.get(summary.preparationId)
    assert.equal(current.revision, summary.revision + 1)
    assert.equal(service.getClassificationSummary(request(current)).accepted, 2)
    await assert.rejects(service.prepareClassifications(request(current)), {
      code: 'INVALID_INPUT',
    })
  } finally {
    ClassificationSpool.prototype.dispose = original
    console.error = originalLog
  }
  const current = service.get(summary.preparationId)
  await service.discard(current.id, current.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('root rescans and removal retain unaffected decisions but never replay affected selections', async (t) => {
  const { service, root, temporary } = await fixture(t)
  const other = path.join(temporary.path, 'Techno')
  await audio(root, 'kick.wav')
  await audio(other, 'snare.wav')
  let preparation = await service.prepare([root, other])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  let summary = await service.prepareClassifications(request(preparation))
  summary = await service.acceptAllClassifications(reference(summary))
  const firstRoot = service
    .get(summary.preparationId)
    .roots.find((item) => item.location === root)
  assert.ok(firstRoot)
  preparation = await service.rescanRoot({
    ...request(summary),
    rootId: firstRoot.id,
  })
  await assert.rejects(service.prepareClassifications(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  preparation = await service.setSubtreeSelection({
    ...request(preparation),
    rootId: firstRoot.id,
    relativePath: '',
    selected: true,
  })
  summary = await service.prepareClassifications(request(preparation))
  let rows = await proposals(service, summary)
  assert.equal(
    rows.find((row) => row.target.key === 'instrument:kick')?.decision,
    'unreviewed',
  )
  assert.equal(
    rows.find((row) => row.target.key === 'instrument:snare')?.decision,
    'accept',
  )
  preparation = await service.removeRoot({
    ...request(summary),
    rootId: firstRoot.id,
  })
  summary = await service.prepareClassifications(request(preparation))
  rows = await proposals(service, summary)
  assert.equal(summary.targets, 1)
  assert.equal(
    rows.find((row) => row.target.key === 'instrument:snare')?.decision,
    'accept',
  )
})

test('incomplete discovery and unresolved origins cannot produce a partial classification scope', async (t) => {
  const { service, root } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root, path.join(root, 'missing')])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  await assert.rejects(service.prepareClassifications(request(preparation)), {
    code: 'INVALID_INPUT',
  })
  const missing = preparation.roots.find((root) => root.state === 'blocked')
  assert.ok(missing)
  preparation = await service.removeRoot({
    ...request(preparation),
    rootId: missing.id,
  })
  const summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.targets, 1)
})

test('tampered classification storage fails explicitly without returning forged or empty proposals', async (t) => {
  const { service, root, spool } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const parent = path.join(spool, (await readdir(spool))[0])
  const directory = path.join(
    parent,
    (await readdir(parent)).find((name) =>
      name.startsWith('classification-'),
    ) ?? 'missing',
  )
  const record = path.join(directory, (await readdir(directory))[0])
  await writeFile(record, '{}')
  const logs: unknown[][] = []
  const originalLog = console.error
  console.error = (...args: unknown[]) => {
    logs.push(args)
  }
  try {
    await assert.rejects(service.listClassifications(reference(summary)), {
      code: 'STORAGE_FAILED',
    })
  } finally {
    console.error = originalLog
  }
  assert.deepEqual(logs, [
    ['Import preparation failed:', 'read-page', 'UNEXPECTED_ERROR'],
  ])
})

test('failed build and cleanup keep both causes, block new work and remain covered by parent discard', async (t) => {
  const { service, root, catalog, spool } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const read = catalog.readImportClassificationContext
  const originalDispose = ClassificationSpool.prototype.dispose
  const buildCause = new Error('private build path')
  const cleanupCause = new Error('private cleanup path')
  catalog.readImportClassificationContext = async () => {
    throw buildCause
  }
  ClassificationSpool.prototype.dispose = async () => {
    throw cleanupCause
  }
  const logs: unknown[][] = []
  const originalLog = console.error
  console.error = (...args: unknown[]) => {
    logs.push(args)
  }
  try {
    await assert.rejects(
      service.prepareClassifications(request(summary)),
      (error: unknown) => {
        assert.ok(error instanceof Error && 'cause' in error)
        assert.ok(error.cause instanceof AggregateError)
        assert.deepEqual(error.cause.errors, [buildCause, cleanupCause])
        return true
      },
    )
    await assert.rejects(service.prepareClassifications(request(summary)), {
      code: 'INVALID_INPUT',
    })
  } finally {
    console.error = originalLog
    ClassificationSpool.prototype.dispose = originalDispose
    catalog.readImportClassificationContext = read
  }
  assert.deepEqual(logs, [
    [
      'Import preparation failed:',
      'prepare-classifications',
      'UNEXPECTED_ERROR',
    ],
  ])
  assert.equal(
    service.getClassificationSummary(request(summary)).classificationToken,
    summary.classificationToken,
  )
  await service.discard(summary.preparationId, summary.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('classification ambiguity pages stay inspectable and unreviewed suggestions do not block import review', async (t) => {
  const { service, root } = await fixture(t)
  await audio(root, 'kick_loop_one_shot.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  assert.equal(summary.ambiguities, 1)
  const page = await service.listClassifications({
    ...reference(summary),
    kind: 'ambiguities',
    limit: 1,
  })
  assert.equal(page.ambiguities[0].reason, 'contradictory-type')
  assert.equal(page.items.length, 0)
  const rows = await proposals(service, summary)
  assert.ok(!rows.some((row) => row.target.dimension === 'sample-type'))
  assert.equal((await service.review(request(summary))).contractVersion, 2)
})

test('oversized classification records reject before writing a truncated generation', async (t) => {
  const { service, root, spool, temporary } = await fixture(t)
  await audio(root, 'kick.wav')
  let preparation = await service.prepare([root])
  preparation = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  const summary = await service.prepareClassifications(request(preparation))
  const row = (await proposals(service, summary))[0]
  const generation = await ClassificationSpool.create(spool)
  temporary.beforeRemove(() => generation.dispose())
  const evidence = row.evidence.find((evidence) => evidence.kind === 'path')
  assert.ok(evidence?.kind === 'path')
  await assert.rejects(
    generation.append({
      id: 'a'.repeat(64),
      stateToken: row.stateToken,
      subject: row.subject,
      ambiguities: [],
      rows: [
        {
          ...row,
          fingerprint: 'b'.repeat(64),
          evidence: Array.from({ length: 1000 }, () => ({
            ...evidence,
            text: 'x'.repeat(4096),
            term: 'x'.repeat(4096),
            clue: 'x'.repeat(4096),
          })),
        },
      ],
    }),
    PreparationLimitError,
  )
  assert.equal(generation.counts.targets, 0)
  assert.equal(generation.counts.proposals, 0)
  await generation.append({
    id: 'c'.repeat(64),
    stateToken: row.stateToken,
    subject: row.subject,
    ambiguities: [],
    rows: [{ ...row, fingerprint: 'd'.repeat(64) }],
  })
  generation.finish()
  const sealed = generation.summary(summary.preparationId, summary.revision)
  const page = await generation.page(0, 50, 'proposals')
  await assert.rejects(
    generation.append({
      id: 'e'.repeat(64),
      stateToken: row.stateToken,
      subject: row.subject,
      ambiguities: [],
      rows: [],
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(!(error instanceof PreparationLimitError))
      assert.equal(
        error.message,
        'Cannot append to a finished import classification generation.',
      )
      return true
    },
  )
  assert.deepEqual(
    generation.summary(summary.preparationId, summary.revision),
    sealed,
  )
  assert.deepEqual(await generation.page(0, 50, 'proposals'), page)
  assert.equal(
    service.getClassificationSummary(request(summary)).classificationToken,
    summary.classificationToken,
  )
})
