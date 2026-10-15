import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { prepareLibraryPackImport } from '../src/main/services/library/library.ts'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/main/db/runtime/connection.ts'
import * as packOperations from '../src/main/db/operations/packs/operations.ts'
import * as removal from '../src/main/db/operations/packs/removal.ts'
import { importFolder } from '../src/main/db/operations/sources/import.ts'
import { setFavorite } from '../src/main/db/operations/samples/favorites.ts'
import * as classification from '../src/main/db/operations/classification/operations.ts'
import * as collection from '../src/main/db/operations/collections/operations.ts'
import {
  samples,
  sampleSources,
  sourceRoots,
  sourceRootSamples,
  excludedSources,
  packs,
  imageAssets,
  userProfiles,
  collections,
} from '../src/main/db/schema/index.ts'
import { isDbRequest, isDbReply } from '../src/main/db/protocol/messages.ts'

const operations = { ...packOperations, ...removal }

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
const open = (): ReturnType<typeof openDatabase> =>
  openDatabase(':memory:', migrationsFolder)

function fixture(
  db: ReturnType<typeof open>['db'],
  root = path.resolve('packs-fixture'),
  size = 3,
): {
  root: string
  files: import('../src/shared/domain/source.ts').DiscoveredAudioFile[]
  imported: import('../src/shared/ipc/library.ts').LibrarySample[]
  sourceRootId: string
} {
  const files = Array.from({ length: size }, (_, i) => ({
    name: `${i}.wav`,
    path: path.join(root, `${i}.wav`),
    relativePath: `${i}.wav`,
    observedSizeBytes: 100,
    observedMtimeMs: 1000,
  }))
  const imported = importFolder(db, root, files)
  return {
    root,
    files,
    imported,
    sourceRootId: operations.getPackSourceRoot(db, root).id,
  }
}

function register(
  db: ReturnType<typeof open>['db'],
  sourceRootId: string,
  name = 'Pack',
): import('../src/shared/domain/pack.ts').Pack {
  const review = operations.reviewPackImport(db, sourceRootId)
  return operations.importPack(db, {
    sourceRootId,
    token: review.token,
    name,
    decisions: [],
  })
}

test('Pack preparation discovers canonical sources without changing audio and registers only on confirmation', async (t) => {
  const { db, close } = open()
  t.after(close)
  const directory = await mkdtemp(path.join(tmpdir(), 'kiter-pack-import-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'source.wav')
  const audio = Buffer.from('source audio remains unchanged')
  await writeFile(file, audio)
  const review = await prepareLibraryPackImport(directory, {
    importFolder: async (root, files) => importFolder(db, root, files),
    getPackSourceRoot: async (root) => operations.getPackSourceRoot(db, root),
    reviewPackImport: async (id) => operations.reviewPackImport(db, id),
  })
  assert.equal(review.sampleCount, 1)
  assert.equal(operations.listPacks(db).total, 0)
  assert.equal(
    db.query.sourceRoots.findFirst().sync()!.canonicalPath,
    await realpath(directory),
  )
  const pack = operations.importPack(db, {
    sourceRootId: review.sourceRootId,
    token: review.token,
    name: 'Pack',
    decisions: [],
  })
  const removal = operations.reviewPackRemoval(db, pack.id)
  operations.removePack(db, { id: pack.id, token: removal.token })
  assert.deepEqual(await readFile(file), audio)
})

test('Pack registration reuses canonical roots and IDs, preserves edited metadata, and retains missing members', (t) => {
  const { db, close } = open()
  t.after(close)
  const f = fixture(db)
  const pack = register(db, f.sourceRootId, ' E\u0301lectro ')
  assert.equal(pack.name, 'Électro')
  assert.equal(operations.listPackSamples(db, pack.id).total, 3)
  const edited = operations.updatePack(db, {
    id: pack.id,
    name: 'Custom',
    description: ' Notes\n',
  })
  assert.throws(
    () =>
      operations.updatePack(db, {
        id: pack.id,
        name: 'Invalid',
        description: '\u0000',
      }),
    { code: 'INVALID_INPUT' },
  )
  const extra = {
    ...f.files[0],
    name: 'new.wav',
    path: path.join(f.root, 'new.wav'),
    relativePath: 'new.wav',
  }
  const imported = importFolder(db, f.root, [f.files[0], extra])
  assert.equal(imported[0].id, f.imported[0].id)
  assert.deepEqual(register(db, f.sourceRootId, 'Do not replace edits'), edited)
  assert.equal(operations.listPackSamples(db, pack.id).total, 4)
  assert.equal(db.select().from(packs).all().length, 1)
  importFolder(db, f.root, [])
  assert.deepEqual(register(db, f.sourceRootId), edited)
  assert.equal(operations.listPackSamples(db, pack.id).total, 4)
  for (const sample of [...f.imported, imported[1]]) {
    operations.setSampleOrigin(db, { sampleId: sample.id, packId: null })
  }
  assert.equal(operations.listPackSamples(db, pack.id).total, 0)
  assert.deepEqual(register(db, f.sourceRootId), edited)
})

test('Pack import requires exact explicit conflict decisions and preserves manual standalone corrections across rescans', (t) => {
  const { db, close } = open()
  t.after(close)
  const f = fixture(db)
  const original = register(db, f.sourceRootId)
  const nestedRoot = path.dirname(f.root)
  importFolder(db, nestedRoot, f.files)
  const targetRootId = operations.getPackSourceRoot(db, nestedRoot).id
  const review = operations.reviewPackImport(db, targetRootId)
  assert.equal(review.conflictCount, 3)
  const request = {
    sourceRootId: targetRootId,
    token: review.token,
    name: 'Other',
    decisions: [],
  }
  assert.throws(() => operations.importPack(db, request), {
    code: 'INVALID_INPUT',
  })
  assert.equal(operations.listPacks(db).total, 1)
  const candidates = operations.listPackImportCandidates(db, targetRootId).items
  assert.ok(
    candidates.every((row) => row.conflict && row.packId === original.id),
  )
  const decisions = candidates.map((row) => ({
    sampleId: row.sampleId,
    resolution: 'keep' as const,
  }))
  assert.throws(() => operations.importPack(db, { ...request, decisions }), {
    code: 'INVALID_INPUT',
  })
  const chosen = candidates[0].sampleId
  const target = operations.importPack(db, {
    ...request,
    decisions: decisions.map((row) => ({
      ...row,
      resolution: row.sampleId === chosen ? 'assign' : 'keep',
    })),
  })
  assert.deepEqual(operations.getSampleOrigin(db, chosen), {
    sampleId: chosen,
    packId: target.id,
    originAssignment: 'manual',
  })
  operations.setSampleOrigin(db, { sampleId: chosen, packId: null })
  importFolder(db, nestedRoot, f.files)
  const fresh = operations.reviewPackImport(db, targetRootId)
  assert.equal(fresh.conflictCount, 3)
  operations.importPack(db, { ...request, token: fresh.token, decisions })
  assert.equal(operations.getSampleOrigin(db, chosen).packId, null)
  assert.throws(
    () =>
      operations.importPack(db, {
        ...request,
        token: fresh.token,
        decisions: [...decisions, decisions[0]],
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.throws(
    () =>
      operations.setSampleOrigin(db, {
        sampleId: chosen,
        packId: randomUUID(),
      }),
    { code: 'NOT_FOUND' },
  )
  assert.equal(operations.getSampleOrigin(db, chosen).packId, null)
})

test('Pack import rejects stale origins, scans and presentation, and rolls back late failures', (t) => {
  const { db, native, close } = open()
  t.after(close)
  const f = fixture(db)
  const review = operations.reviewPackImport(db, f.sourceRootId)
  const request = {
    sourceRootId: f.sourceRootId,
    token: review.token,
    name: 'Pack',
    decisions: [],
  }
  operations.setSampleOrigin(db, { sampleId: f.imported[0].id, packId: null })
  assert.throws(() => operations.importPack(db, request), {
    code: 'STALE_REVIEW',
  })
  assert.equal(operations.listPacks(db).total, 0)
  const fresh = operations.reviewPackImport(db, f.sourceRootId)
  const confirmed = {
    ...request,
    token: fresh.token,
    decisions: [{ sampleId: f.imported[0].id, resolution: 'assign' as const }],
  }
  const before = db.select().from(samples).all()
  native.exec(
    `CREATE TEMP TRIGGER fail_origin BEFORE UPDATE ON samples WHEN NEW.pack_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
  )
  assert.throws(() => operations.importPack(db, confirmed))
  assert.equal(operations.listPacks(db).total, 0)
  assert.deepEqual(db.select().from(samples).all(), before)
  native.exec('DROP TRIGGER fail_origin')
  importFolder(db, f.root, f.files.slice(1))
  assert.throws(() => operations.importPack(db, confirmed), {
    code: 'STALE_REVIEW',
  })
  const pack = register(db, f.sourceRootId)
  const reimport = operations.reviewPackImport(db, f.sourceRootId)
  operations.updatePack(db, { id: pack.id, name: 'Changed' })
  assert.throws(
    () => operations.importPack(db, { ...request, token: reimport.token }),
    { code: 'STALE_REVIEW' },
  )
})

test('Pack registration rejects empty or excluded-only discoveries and rejects extraneous decisions', (t) => {
  const { db, close } = open()
  t.after(close)
  const empty = fixture(db, path.resolve('empty-pack'), 0)
  assert.throws(() => register(db, empty.sourceRootId), {
    code: 'INVALID_INPUT',
  })
  const root = path.resolve('excluded-pack')
  db.insert(excludedSources)
    .values({ canonicalPath: path.join(root, '0.wav') })
    .run()
  const excluded = fixture(db, root, 1)
  assert.equal(excluded.imported.length, 0)
  assert.throws(() => register(db, excluded.sourceRootId), {
    code: 'INVALID_INPUT',
  })
  const f = fixture(db)
  const review = operations.reviewPackImport(db, f.sourceRootId)
  assert.throws(
    () =>
      operations.importPack(db, {
        sourceRootId: f.sourceRootId,
        name: 'Pack',
        token: review.token,
        decisions: [{ sampleId: randomUUID(), resolution: 'assign' }],
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.equal(operations.listPacks(db).total, 0)
})

test('Pack removal reviews exact uses and preserves Samples, organization, roots and source records', (t) => {
  const { db, native, close } = open()
  t.after(close)
  const f = fixture(db)
  const pack = register(db, f.sourceRootId)
  const id = f.imported[0].id
  setFavorite(db, id, true)
  db.update(samples)
    .set({ displayName: 'Kick', notes: 'Keep' })
    .where(eq(samples.id, id))
    .run()
  const category = classification.createCategory(db, { name: 'Drums' })
  const author = classification.createAuthor(db, { name: 'Artist' })
  for (const target of [
    { kind: 'sample' as const, id },
    { kind: 'pack' as const, id: pack.id },
  ]) {
    classification.setCategoryAssignment(db, {
      id: category.id,
      target,
      assigned: true,
    })
    classification.setAuthorAssignment(db, {
      id: author.id,
      target,
      assigned: true,
    })
  }
  const selection = collection.createCollection(db, { name: 'Selection' })
  collection.setCollectionMembership(db, {
    collectionId: selection.id,
    sampleId: id,
    assigned: true,
  })
  const before = db.select().from(samples).all()
  const sources = db.select().from(sampleSources).all()
  const roots = db.select().from(sourceRoots).all()
  const associations = db.select().from(sourceRootSamples).all()
  let review = operations.reviewPackRemoval(db, pack.id)
  assert.equal(review.sampleCount, 3)
  assert.equal(review.categoryCount, 1)
  assert.equal(review.authorCount, 1)
  operations.setSampleOrigin(db, { sampleId: id, packId: null })
  const outsider = fixture(db, path.resolve('outsider'), 1).imported[0].id
  operations.setSampleOrigin(db, { sampleId: outsider, packId: pack.id })
  assert.throws(
    () => operations.removePack(db, { id: pack.id, token: review.token }),
    { code: 'STALE_REVIEW' },
  )
  operations.setSampleOrigin(db, { sampleId: outsider, packId: null })
  operations.setSampleOrigin(db, { sampleId: id, packId: pack.id })
  review = operations.reviewPackRemoval(db, pack.id)
  const other = classification.createAuthor(db, { name: 'Artist' })
  classification.setAuthorAssignment(db, {
    id: author.id,
    target: { kind: 'pack', id: pack.id },
    assigned: false,
  })
  classification.setAuthorAssignment(db, {
    id: other.id,
    target: { kind: 'pack', id: pack.id },
    assigned: true,
  })
  assert.throws(
    () => operations.removePack(db, { id: pack.id, token: review.token }),
    { code: 'STALE_REVIEW' },
  )
  review = operations.reviewPackRemoval(db, pack.id)
  native.exec(
    `CREATE TEMP TRIGGER fail_remove BEFORE DELETE ON packs BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
  )
  assert.throws(() =>
    operations.removePack(db, { id: pack.id, token: review.token }),
  )
  assert.equal(operations.listPackSamples(db, pack.id).total, 3)
  native.exec('DROP TRIGGER fail_remove')
  operations.removePack(db, { id: pack.id, token: review.token })
  assert.throws(() => operations.getPack(db, pack.id), { code: 'NOT_FOUND' })
  assert.deepEqual(
    db
      .select()
      .from(samples)
      .all()
      .filter((row) => row.id !== outsider),
    before.map((row) => ({ ...row, packId: null, originAssignment: 'manual' })),
  )
  assert.deepEqual(
    db
      .select()
      .from(sampleSources)
      .all()
      .filter((row) => row.sampleId !== outsider),
    sources,
  )
  assert.deepEqual(
    db
      .select()
      .from(sourceRoots)
      .all()
      .filter((row) => row.id === f.sourceRootId),
    roots,
  )
  assert.deepEqual(
    db
      .select()
      .from(sourceRootSamples)
      .all()
      .filter((row) => row.sourceRootId === f.sourceRootId),
    associations,
  )
  assert.equal(collection.listCollectionSamples(db, selection.id).total, 1)
  assert.equal(
    classification.listTargetAuthors(db, { kind: 'sample', id }).total,
    1,
  )
  assert.equal(
    classification.listTargetCategories(db, { kind: 'sample', id }).total,
    1,
  )
  assert.equal(db.query.packAuthors.findMany().sync().length, 0)
  assert.equal(db.query.packCategories.findMany().sync().length, 0)
  importFolder(db, f.root, f.files)
  assert.equal(operations.reviewPackImport(db, f.sourceRootId).conflictCount, 3)
})

test('Pack removal checks all cover owners and rolls back cleanup failures', (t) => {
  const { db, native, close } = open()
  t.after(close)
  for (const owner of ['none', 'pack', 'collection', 'profile']) {
    const f = fixture(db, path.resolve(`cover-${owner}`), 1)
    const pack = register(db, f.sourceRootId)
    const assetId = randomUUID()
    db.insert(imageAssets)
      .values({
        id: assetId,
        storageKey: `${assetId}.png`,
        mimeType: 'image/png',
        byteSize: 1,
        width: 1,
        height: 1,
      })
      .run()
    db.update(packs)
      .set({ coverAssetId: assetId })
      .where(eq(packs.id, pack.id))
      .run()
    if (owner === 'pack') {
      const other = register(
        db,
        fixture(db, path.resolve('shared-cover'), 1).sourceRootId,
      )
      db.update(packs)
        .set({ coverAssetId: assetId })
        .where(eq(packs.id, other.id))
        .run()
    } else if (owner === 'collection') {
      db.insert(collections)
        .values({ id: randomUUID(), name: 'Shared', coverAssetId: assetId })
        .run()
    } else if (owner === 'profile') {
      db.update(userProfiles).set({ avatarAssetId: assetId }).run()
    }
    const review = operations.reviewPackRemoval(db, pack.id)
    if (owner === 'none') {
      native.exec(
        `CREATE TEMP TRIGGER fail_cleanup BEFORE UPDATE ON image_assets BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
      )
      assert.throws(() =>
        operations.removePack(db, { id: pack.id, token: review.token }),
      )
      assert.equal(operations.listPackSamples(db, pack.id).total, 1)
      native.exec('DROP TRIGGER fail_cleanup')
    }
    operations.removePack(db, { id: pack.id, token: review.token })
    assert.equal(
      db.select().from(imageAssets).where(eq(imageAssets.id, assetId)).get()!
        .state,
      owner === 'none' ? 'cleanup_pending' : 'ready',
    )
  }
})

test('Pack queries paginate deterministically and reviews cover multiple batches', (t) => {
  const { db, close } = open()
  t.after(close)
  const f = fixture(db, path.resolve('large-pack'), 505)
  const review = operations.reviewPackImport(db, f.sourceRootId)
  assert.equal(review.sampleCount, 505)
  assert.equal(
    operations.listPackImportCandidates(db, f.sourceRootId, { offset: 500 })
      .items.length,
    5,
  )
  const pack = register(db, f.sourceRootId)
  assert.equal(
    operations.listPackSamples(db, pack.id, { offset: 500 }).items.length,
    5,
  )
  const removal = operations.reviewPackRemoval(db, pack.id)
  assert.equal(removal.sampleCount, 505)
  operations.setSampleOrigin(db, { sampleId: f.imported[504].id, packId: null })
  assert.throws(
    () => operations.removePack(db, { id: pack.id, token: removal.token }),
    { code: 'STALE_REVIEW' },
  )
  const same = register(
    db,
    fixture(db, path.resolve('homonym'), 1).sourceRootId,
  )
  assert.equal(same.name, pack.name)
  assert.notEqual(same.id, pack.id)
  const all = operations.listPacks(db).items.map((row) => row.id)
  assert.deepEqual(all, all.toSorted())
  assert.deepEqual(
    operations
      .listPacks(db, { limit: 1, offset: 1 })
      .items.map((row) => row.id),
    all.slice(1),
  )
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 0.5 },
  ]) {
    assert.throws(() => operations.listPacks(db, input), {
      code: 'INVALID_INPUT',
    })
    assert.throws(() => operations.listPackSamples(db, pack.id, input), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Pack protocol rejects malformed requests and results', () => {
  const id = randomUUID()
  const pack = {
    id,
    sourceRootId: id,
    name: 'Pack',
    description: null,
    coverAssetId: null,
  }
  assert.ok(isDbReply({ requestId: 1, action: 'get-pack', result: pack }))
  assert.ok(
    isDbRequest({
      requestId: 1,
      action: 'set-sample-origin',
      input: { sampleId: id, packId: null },
    }),
  )
  for (const input of [
    null,
    {},
    { id, name: '\nName' },
    { id, name: 'Name', description: 1 },
  ]) {
    assert.equal(
      isDbRequest({ requestId: 1, action: 'update-pack', input }),
      false,
    )
  }
  for (const result of [
    { ...pack, name: ' Name ' },
    { ...pack, sourceRootId: 'bad' },
    { ...pack, description: undefined },
  ]) {
    assert.equal(isDbReply({ requestId: 1, action: 'get-pack', result }), false)
  }
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'set-sample-origin',
      input: { sampleId: id },
    }),
    false,
  )
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'import-pack',
      input: {
        sourceRootId: id,
        name: 'Pack',
        token: 'a'.repeat(64),
        decisions: [{ sampleId: id, resolution: 'replace' }],
      },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-packs',
      result: { items: [pack], total: 0, limit: 50, offset: 0 },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'review-pack-import',
      result: {
        sourceRootId: id,
        pack,
        sampleCount: 0,
        conflictCount: 1,
        token: 'a'.repeat(64),
      },
    }),
    false,
  )
})
