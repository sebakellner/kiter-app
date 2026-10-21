import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createTemporaryDirectory } from '../../../../tests/support/filesystem/temporary-directory.ts'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { deferred } from '../../../../tests/support/fixtures/deferred.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { readImportCatalog } from '../../db/operations/sources/import-snapshot.ts'
import { readImportClassificationContext } from '../../db/operations/classification/import-context.ts'
import { readImportPackOrganizationCatalog } from '../../db/operations/classification/pack-organization.ts'
import {
  createAuthor,
  createInstrument,
  renameAuthor,
  renameInstrument,
  removeAuthor,
  reviewAuthorRemoval,
} from '../../db/operations/classification/operations.ts'
import {
  createGenre,
  renameGenre,
} from '../../db/operations/classification/genres.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import {
  getPackSourceRoot,
  reviewPackImport,
  importPack,
} from '../../db/operations/packs/operations.ts'
import { ImportPreparationService } from './preparation.ts'
import type { ImportPreparation, PreparationRequest } from './types.ts'
import type { PackOrganizationReference } from './pack-organization.ts'

function request(preparation: ImportPreparation): PreparationRequest {
  return { preparationId: preparation.id, revision: preparation.revision }
}
function reference(
  value: PackOrganizationReference,
): PackOrganizationReference {
  return {
    preparationId: value.preparationId,
    revision: value.revision,
    rootId: value.rootId,
    organizationToken: value.organizationToken,
  }
}
async function fixture(
  t: TestContext,
  names = ['Producer A - House'],
): Promise<{
  db: ReturnType<typeof createMemoryDatabase>['db']
  native: ReturnType<typeof createMemoryDatabase>['native']
  service: ImportPreparationService
  preparation: ImportPreparation
  roots: string[]
  spool: string
  catalog: {
    readImportCatalog: (
      input: Parameters<typeof readImportCatalog>[1],
    ) => Promise<ReturnType<typeof readImportCatalog>>
    readImportClassificationContext: (
      input: Parameters<typeof readImportClassificationContext>[1],
    ) => Promise<ReturnType<typeof readImportClassificationContext>>
    readImportPackOrganizationCatalog: (
      input: Parameters<typeof readImportPackOrganizationCatalog>[1],
    ) => Promise<ReturnType<typeof readImportPackOrganizationCatalog>>
  }
}> {
  const { db, native } = createMemoryDatabase(t)
  const temporary = await createTemporaryDirectory(t, 'pack-organization')
  const roots = names.map((name) => path.join(temporary.path, name))
  for (const root of roots) {
    await mkdir(root)
    await writeFile(path.join(root, 'neutral.wav'), 'original audio')
  }
  const spool = path.join(temporary.path, 'spool')
  await mkdir(spool)
  const catalog = {
    readImportCatalog: async (input: Parameters<typeof readImportCatalog>[1]) =>
      readImportCatalog(db, input),
    readImportClassificationContext: async (
      input: Parameters<typeof readImportClassificationContext>[1],
    ) => readImportClassificationContext(db, input),
    readImportPackOrganizationCatalog: async (
      input: Parameters<typeof readImportPackOrganizationCatalog>[1],
    ) => readImportPackOrganizationCatalog(db, input),
  }
  const service = new ImportPreparationService(catalog, spool)
  temporary.beforeRemove(() => service.close())
  const prepared = await service.prepare(roots)
  const preparation = await service.setMode({
    ...request(prepared),
    mode: 'pack',
  })
  return { db, native, service, preparation, roots, spool, catalog }
}

test('manual new-Pack assignments and Author creation stay in draft, bind version-3 seals and discard without writes', async (t) => {
  const { db, native, service, roots, spool, preparation } = await fixture(t)
  const instrument = createInstrument(db, { name: 'Piano' })
  const genre = createGenre(db, { name: 'Custom Style' })
  const before = native.serialize()
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  assert.deepEqual(prepared.draft.authors, [])
  const hints = service.listPackOrganizationOptions({
    ...reference(prepared),
    kind: 'suggested-author',
  })
  assert.equal(hints.items[0].kind, 'create')
  const staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [instrument.id],
    genreIds: [genre.id],
    authors: [
      {
        kind: 'new',
        name: ' Producer A ',
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  })
  const draft = staged.packOrganizations?.[prepared.rootId]
  assert.ok(draft)
  assert.equal(draft.instruments[0].id, instrument.id)
  assert.equal(draft.genres[0].id, genre.id)
  assert.equal(draft.authors[0].name, 'Producer A')
  assert.equal(draft.authors[0].kind, 'new')
  const seal = await service.review(request(staged))
  assert.equal(seal.contractVersion, 3)
  assert.match(
    seal.contractVersion === 3 ? seal.organizationDigest : '',
    /^[a-f0-9]{64}$/u,
  )
  assert.deepEqual(native.serialize(), before)
  assert.equal(
    await readFile(path.join(roots[0], 'neutral.wav'), 'utf8'),
    'original audio',
  )
  await service.discard(staged.id, staged.revision)
  assert.deepEqual(await readdir(spool), [])
})

test('manual Genres become separately accepted Sample suggestions, never Instrument or Author inheritance', async (t) => {
  const { db, service, preparation } = await fixture(t)
  const instrument = createInstrument(db, { name: 'Piano' })
  const genre = createGenre(db, { name: 'Custom Style' })
  const author = createAuthor(db, { name: 'Producer A' })
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [instrument.id],
    genreIds: [genre.id],
    authors: [{ kind: 'existing', id: author.id }],
  })
  const classification = await service.prepareClassifications(request(staged))
  const page = await service.listClassifications({
    preparationId: classification.preparationId,
    revision: classification.revision,
    classificationToken: classification.classificationToken,
    limit: 100,
  })
  const sampleGenre = page.items.find(
    (row) =>
      row.subject.kind === 'sample' && row.target.key === `genre:${genre.id}`,
  )
  assert.ok(sampleGenre)
  assert.equal(sampleGenre.decision, 'unreviewed')
  assert.equal(sampleGenre.dependencies.length, 1)
  assert.deepEqual(
    sampleGenre.evidence.map((evidence) => evidence.kind),
    ['pack-genre'],
  )
  assert.ok(
    !page.items.some(
      (row) =>
        row.subject.kind === 'sample' && row.target.key === 'instrument:piano',
    ),
  )
  const seal = await service.review({
    preparationId: staged.id,
    revision: classification.revision,
  })
  assert.equal(seal.contractVersion, 3)
})

test('manual assignments supersede matching suggestions without forging path evidence', async (t) => {
  const { db, service, preparation } = await fixture(t, ['Piano House'])
  const instrument = createInstrument(db, { name: 'Piano' })
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [instrument.id],
    genreIds: [],
    authors: [],
  })
  const classification = await service.prepareClassifications(request(staged))
  const input = {
    preparationId: staged.id,
    revision: classification.revision,
    classificationToken: classification.classificationToken,
  }
  const row = (await service.listClassifications(input)).items.find(
    (row) =>
      row.subject.kind === 'pack' && row.target.key === 'instrument:piano',
  )
  assert.ok(row)
  assert.equal(row.draftAssigned, true)
  assert.equal(row.assigned, false)
  assert.equal(row.reviewable, false)
  await assert.rejects(
    service.stageClassifications({
      ...input,
      choices: [{ proposalKey: row.proposalKey, decision: 'reject' }],
    }),
    { code: 'INVALID_INPUT' },
  )
})

test('Authors with equal names remain distinct and creating another requires exact homonym acknowledgment', async (t) => {
  const { db, native, service, preparation } = await fixture(t)
  const one = createAuthor(db, { name: 'Producer A' })
  const two = createAuthor(db, { name: 'producer a' })
  const before = native.serialize()
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const hints = service.listPackOrganizationOptions({
    ...reference(prepared),
    kind: 'suggested-author',
  })
  assert.equal(hints.total, 2)
  assert.ok(hints.items.every((hint) => hint.kind === 'existing'))
  const input = {
    ...reference(prepared),
    instrumentIds: [],
    genreIds: [],
    authors: [
      {
        kind: 'new' as const,
        name: 'Producer A',
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  }
  await assert.rejects(service.setPackOrganization(input), {
    code: 'INVALID_INPUT',
  })
  assert.deepEqual(service.get(preparation.id), preparation)
  const staged = await service.setPackOrganization({
    ...input,
    authors: [{ ...input.authors[0], acknowledgedAuthorIds: [one.id, two.id] }],
  })
  const draft = staged.packOrganizations?.[prepared.rootId]
  assert.ok(draft?.authors[0].kind === 'new')
  assert.equal(draft.authors[0].acknowledgedAuthors.length, 2)
  assert.deepEqual(native.serialize(), before)
})

test('new Author draft identities can be explicitly reused across Packs but not forged or silently renamed', async (t) => {
  const { service, preparation } = await fixture(t, [
    'Producer A - House',
    'Producer A - Techno',
  ])
  const first = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  let staged = await service.setPackOrganization({
    ...reference(first),
    instrumentIds: [],
    genreIds: [],
    authors: [
      {
        kind: 'new',
        name: 'Producer A',
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  })
  const draft = staged.packOrganizations?.[first.rootId].authors[0]
  assert.ok(draft?.kind === 'new')
  const second = await service.preparePackOrganization({
    ...request(staged),
    rootId: preparation.roots[1].id,
  })
  const input = {
    ...reference(second),
    instrumentIds: [],
    genreIds: [],
    authors: [
      {
        kind: 'new' as const,
        draftId: draft.draftId,
        name: draft.name,
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  }
  await assert.rejects(
    service.setPackOrganization({
      ...input,
      authors: [
        {
          ...input.authors[0],
          draftId: '10000000-0000-4000-8000-000000000001',
        },
      ],
    }),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(
    service.setPackOrganization({
      ...input,
      authors: [{ ...input.authors[0], name: 'Different Author' }],
    }),
    { code: 'INVALID_INPUT' },
  )
  staged = await service.setPackOrganization(input)
  assert.deepEqual(
    staged.packOrganizations?.[first.rootId].authors[0],
    staged.packOrganizations?.[second.rootId].authors[0],
  )
  const seal = await service.review(request(staged))
  assert.equal(seal.contractVersion, 3)
})

test('renames require fresh manual review while retaining the intended draft', async (t) => {
  for (const kind of ['author', 'instrument', 'genre'] as const) {
    const { db, service, preparation } = await fixture(t, [`${kind} Pack`])
    const author = createAuthor(db, { name: 'Producer A' })
    const instrument = createInstrument(db, { name: 'Piano' })
    const genre = createGenre(db, { name: 'Custom Style' })
    const prepared = await service.preparePackOrganization({
      ...request(preparation),
      rootId: preparation.roots[0].id,
    })
    const selection = {
      instrumentIds: [instrument.id],
      genreIds: [genre.id],
      authors: [{ kind: 'existing' as const, id: author.id }],
    }
    let staged = await service.setPackOrganization({
      ...reference(prepared),
      ...selection,
    })
    const seal = await service.review(request(staged))
    if (kind === 'author') {
      renameAuthor(db, { id: author.id, name: 'Producer B' })
    } else if (kind === 'instrument') {
      renameInstrument(db, { id: instrument.id, name: 'Grand Piano' })
    } else {
      renameGenre(db, { id: genre.id, name: 'New Style' })
    }
    await assert.rejects(service.review(request(staged)), {
      code: 'STALE_REVIEW',
    })
    staged = service.get(staged.id)
    assert.equal(staged.packOrganizations?.[prepared.rootId].needsReview, true)
    assert.equal(
      staged.packOrganizations?.[prepared.rootId].authors[0].name,
      'Producer A',
    )
    await assert.rejects(
      service.listReview({ ...request(staged), reviewToken: seal.reviewToken }),
      { code: 'STALE_REVIEW' },
    )
    const refreshed = await service.preparePackOrganization({
      ...request(staged),
      rootId: prepared.rootId,
    })
    staged = await service.setPackOrganization({
      ...reference(refreshed),
      ...selection,
    })
    assert.equal((await service.review(request(staged))).contractVersion, 3)
  }
})

test('pending Author homonyms require acknowledgment independently of request order', async (t) => {
  const { service, preparation } = await fixture(t)
  const first = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const staged = await service.setPackOrganization({
    ...reference(first),
    instrumentIds: [],
    genreIds: [],
    authors: [
      {
        kind: 'new',
        name: 'Producer A',
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  })
  const author = staged.packOrganizations?.[first.rootId].authors[0]
  assert.ok(author?.kind === 'new')
  const second = await service.preparePackOrganization({
    ...request(staged),
    rootId: first.rootId,
  })
  const newChoice = {
    kind: 'new' as const,
    name: 'Producer A',
    acknowledgedAuthorIds: [],
    acknowledgedDraftIds: [],
  }
  const retained = { ...newChoice, draftId: author.draftId }
  const input = {
    ...reference(second),
    instrumentIds: [],
    genreIds: [],
    authors: [newChoice, retained],
  }
  await assert.rejects(service.setPackOrganization(input), {
    code: 'INVALID_INPUT',
  })
  assert.deepEqual(service.get(staged.id), staged)
  const result = await service.setPackOrganization({
    ...input,
    authors: [
      { ...newChoice, acknowledgedDraftIds: [author.draftId] },
      retained,
    ],
  })
  const choices = result.packOrganizations?.[first.rootId].authors ?? []
  assert.equal(choices.length, 2)
  assert.ok(choices.every((choice) => choice.kind === 'new'))
  assert.equal((await service.review(request(result))).contractVersion, 3)
})

test('deleted Authors remain visible in the stale draft until explicitly removed', async (t) => {
  const { db, service, preparation } = await fixture(t)
  const author = createAuthor(db, { name: 'Producer A' })
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  let staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [],
    genreIds: [],
    authors: [{ kind: 'existing', id: author.id }],
  })
  removeAuthor(db, {
    id: author.id,
    token: reviewAuthorRemoval(db, author.id).token,
  })
  await assert.rejects(service.review(request(staged)), {
    code: 'STALE_REVIEW',
  })
  staged = service.get(staged.id)
  assert.equal(
    staged.packOrganizations?.[prepared.rootId].authors[0].name,
    author.name,
  )
  const current = await service.preparePackOrganization({
    ...request(staged),
    rootId: prepared.rootId,
  })
  assert.ok(
    !service
      .listPackOrganizationOptions({ ...reference(current), kind: 'author' })
      .items.some((item) => 'id' in item && item.id === author.id),
  )
  staged = await service.clearPackOrganization({
    ...request(staged),
    rootId: prepared.rootId,
  })
  assert.equal((await service.review(request(staged))).contractVersion, 1)
})

test('option pages are bounded, detached and invalidated by draft edits while unrelated catalog changes preserve reviewed selections', async (t) => {
  const { db, service, preparation } = await fixture(t)
  const artist = createAuthor(db, { name: 'Producer A' })
  for (let index = 0; index < 105; index++) {
    createAuthor(db, { name: `Artist ${index}` })
  }
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const page = service.listPackOrganizationOptions({
    ...reference(prepared),
    kind: 'author',
  })
  assert.equal(page.items.length, 50)
  assert.equal(page.total, 106)
  assert.equal(page.nextOffset, 50)
  const chosen = page.items[0]
  assert.ok('name' in chosen)
  chosen.name = 'forged'
  assert.ok(
    !service
      .listPackOrganizationOptions({ ...reference(prepared), kind: 'author' })
      .items.some((item) => 'name' in item && item.name === 'forged'),
  )
  assert.throws(
    () =>
      service.listPackOrganizationOptions({
        ...reference(prepared),
        kind: 'author',
        limit: 101,
      }),
    { code: 'INVALID_INPUT' },
  )
  const staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [],
    genreIds: [],
    authors: [{ kind: 'existing', id: artist.id }],
  })
  assert.throws(
    () =>
      service.listPackOrganizationOptions({
        ...reference(prepared),
        kind: 'author',
      }),
    { code: 'STALE_REVIEW' },
  )
  createAuthor(db, { name: 'Unrelated Artist' })
  assert.equal((await service.review(request(staged))).contractVersion, 3)
})

test('rescan retains organization drafts and removing a root removes only its credit references', async (t) => {
  const { db, service, preparation } = await fixture(t, [
    'Producer A - House',
    'Other - Techno',
  ])
  const artist = createAuthor(db, { name: 'Producer A' })
  const first = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  let staged = await service.setPackOrganization({
    ...reference(first),
    instrumentIds: [],
    genreIds: [],
    authors: [{ kind: 'existing', id: artist.id }],
  })
  const retained = structuredClone(staged.packOrganizations)
  staged = await service.rescanRoot({
    ...request(staged),
    rootId: first.rootId,
  })
  assert.deepEqual(staged.packOrganizations, retained)
  staged = await service.setSubtreeSelection({
    ...request(staged),
    rootId: first.rootId,
    relativePath: '',
    selected: true,
  })
  assert.equal((await service.review(request(staged))).contractVersion, 3)
  staged = await service.removeRoot({
    ...request(staged),
    rootId: first.rootId,
  })
  assert.deepEqual(staged.packOrganizations, {})
  assert.equal((await service.review(request(staged))).contractVersion, 1)
})

test('a newly matching catalog Author invalidates a creation draft rather than silently reusing or duplicating', async (t) => {
  const { db, service, preparation } = await fixture(t)
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const staged = await service.setPackOrganization({
    ...reference(prepared),
    instrumentIds: [],
    genreIds: [],
    authors: [
      {
        kind: 'new',
        name: 'Producer A',
        acknowledgedAuthorIds: [],
        acknowledgedDraftIds: [],
      },
    ],
  })
  createAuthor(db, { name: 'Producer A' })
  await assert.rejects(service.review(request(staged)), {
    code: 'STALE_REVIEW',
  })
  assert.equal(
    service.get(staged.id).packOrganizations?.[prepared.rootId].authors[0].kind,
    'new',
  )
})

test('stale catalog references, duplicate selections and foreign fields leave all prior drafts unchanged', async (t) => {
  const { db, service, preparation } = await fixture(t)
  const author = createAuthor(db, { name: 'Producer A' })
  const prepared = await service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  const input = {
    ...reference(prepared),
    instrumentIds: [],
    genreIds: [],
    authors: [{ kind: 'existing' as const, id: author.id }],
  }
  await assert.rejects(
    service.setPackOrganization({
      ...input,
      authors: [...input.authors, ...input.authors],
    }),
    { code: 'INVALID_INPUT' },
  )
  const forged = { ...input, cover: 'unsupported' }
  await assert.rejects(service.setPackOrganization(forged), {
    code: 'INVALID_INPUT',
  })
  renameAuthor(db, { id: author.id, name: 'Producer B' })
  await assert.rejects(service.setPackOrganization(input), {
    code: 'STALE_REVIEW',
  })
  assert.deepEqual(service.get(preparation.id), preparation)
})

test('existing Packs and standalone mode cannot receive manual organization through import', async (t) => {
  const { db, service, preparation, roots } = await fixture(t)
  let changed = await service.setMode({
    ...request(preparation),
    mode: 'standalone',
  })
  await assert.rejects(
    service.preparePackOrganization({
      ...request(changed),
      rootId: changed.roots[0].id,
    }),
    { code: 'INVALID_INPUT' },
  )
  await service.discard(changed.id, changed.revision)
  importFolder(db, roots[0], [makeDiscoveredAudioFile(roots[0], 'neutral.wav')])
  const source = getPackSourceRoot(db, roots[0])
  importPack(db, {
    sourceRootId: source.id,
    name: 'Existing',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  changed = await service.prepare(roots)
  changed = await service.setMode({ ...request(changed), mode: 'pack' })
  await assert.rejects(
    service.preparePackOrganization({
      ...request(changed),
      rootId: changed.roots[0].id,
    }),
    { code: 'INVALID_INPUT' },
  )
})

test('organization preparation drains on discard without publishing a catalog or stale draft', async (t) => {
  const { service, catalog, preparation, spool } = await fixture(t)
  const entered = deferred<void>()
  const release = deferred<void>()
  const read = catalog.readImportPackOrganizationCatalog
  catalog.readImportPackOrganizationCatalog = async (input) => {
    entered.resolve(undefined)
    await release.promise
    return read(input)
  }
  const preparing = service.preparePackOrganization({
    ...request(preparation),
    rootId: preparation.roots[0].id,
  })
  await entered.promise
  const discarding = service.discard(preparation.id, preparation.revision)
  release.resolve(undefined)
  await assert.rejects(preparing, { code: 'NOT_FOUND' })
  await discarding
  assert.deepEqual(await readdir(spool), [])
})
