import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
  lstat,
  realpath,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import {
  openTestDatabase,
  createMemoryDatabase,
} from '../../support/database/connection.ts'
import { makeImageAsset } from '../../support/fixtures/image.ts'
import { createPng } from '../../support/fixtures/png.ts'
import * as assets from '../../../src/main/db/operations/assets/operations.ts'
import {
  readLocalProfile,
  updateLocalProfile,
  setPreviewVolume,
} from '../../../src/main/db/operations/profile/operations.ts'
import {
  createAuthor,
  reviewAuthorRemoval,
  removeAuthor,
} from '../../../src/main/db/operations/classification/operations.ts'
import {
  createCollection,
  getCollection,
} from '../../../src/main/db/operations/collections/operations.ts'
import {
  removeCollection,
  reviewCollectionRemoval,
} from '../../../src/main/db/operations/collections/removal.ts'
import {
  packs,
  collections,
  imageAssets,
  sourceRoots,
} from '../../../src/main/db/schema/index.ts'
import { ManagedImages } from '../../../src/main/services/images/index.ts'
import type { ImageAsset } from '../../../src/shared/domain/imageAsset.ts'

const metadata = (): ImageAsset => {
  return makeImageAsset({ id: randomUUID() })
}

test('Profile edits normalize the name, preserve identity/preferences/avatar and never rename or credit an Author', (t) => {
  const connection = createMemoryDatabase(t)
  const { db } = connection
  const before = readLocalProfile(db)
  const author = createAuthor(db, { name: 'Artist' })
  setPreviewVolume(db, 0)
  const asset = metadata()
  assets.publishImage(db, {
    target: { kind: 'profile' },
    expectedAssetId: null,
    asset,
  })
  const changed = updateLocalProfile(db, {
    name: ' E\u0301lise ',
    authorId: author.id,
  })
  assert.deepEqual(changed, {
    ...before.profile,
    name: 'Élise',
    authorId: author.id,
    avatarAssetId: asset.id,
  })
  assert.throws(
    () => updateLocalProfile(db, { name: 'Other', authorId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  assert.deepEqual(readLocalProfile(db).profile, changed)
  for (const name of ['', '\nName', 'A\u2028B', '😀'.repeat(121)]) {
    assert.throws(() => updateLocalProfile(db, { name, authorId: null }), {
      code: 'INVALID_INPUT',
    })
  }
  assert.equal(
    updateLocalProfile(db, { name: '😀'.repeat(120), authorId: null }).authorId,
    null,
  )
  updateLocalProfile(db, { name: 'Élise', authorId: author.id })
  const review = reviewAuthorRemoval(db, author.id)
  assert.equal(review.entity.name, 'Artist')
  removeAuthor(db, { id: author.id, token: review.token })
  assert.equal(readLocalProfile(db).profile.authorId, null)
  assert.equal(readLocalProfile(db).profile.avatarAssetId, asset.id)
})

test('Images share references across all owners, reject stale replacements and cannot reattach cleanup claims', (t) => {
  const { db } = createMemoryDatabase(t)
  const collection = createCollection(db, { name: 'Collection' })
  const packId = randomUUID()
  const rootId = randomUUID()
  db.insert(sourceRoots)
    .values({ id: rootId, canonicalPath: '/image-test-root' })
    .run()
  db.insert(packs)
    .values({ id: packId, name: 'Pack', sourceRootId: rootId })
    .run()
  const asset = metadata()
  assets.publishImage(db, {
    target: { kind: 'profile' },
    expectedAssetId: null,
    asset,
  })
  for (const target of [
    { kind: 'collection' as const, id: collection.id },
    { kind: 'pack' as const, id: packId },
  ]) {
    assets.setImageReference(db, {
      target,
      expectedAssetId: null,
      assetId: asset.id,
    })
  }
  assert.equal(assets.claimImageCleanup(db, asset.id), null)
  const replacement = metadata()
  assert.throws(
    () =>
      assets.publishImage(db, {
        target: { kind: 'profile' },
        expectedAssetId: null,
        asset: replacement,
      }),
    { code: 'STALE_REVIEW' },
  )
  assert.equal(assets.getImage(db, replacement.id), null)
  assets.setImageReference(db, {
    target: { kind: 'profile' },
    expectedAssetId: asset.id,
    assetId: null,
  })
  const review = reviewCollectionRemoval(db, collection.id)
  removeCollection(db, { id: collection.id, token: review.token })
  assert.equal(assets.getImage(db, asset.id)?.state, 'ready')
  assets.setImageReference(db, {
    target: { kind: 'pack', id: packId },
    expectedAssetId: asset.id,
    assetId: null,
  })
  assert.equal(assets.claimImageCleanup(db, asset.id)?.state, 'cleanup_pending')
  assert.throws(
    () =>
      assets.setImageReference(db, {
        target: { kind: 'profile' },
        expectedAssetId: null,
        assetId: asset.id,
      }),
    { code: 'NOT_FOUND' },
  )
  assets.finishImageCleanup(db, asset.id)
  assert.equal(assets.getImage(db, asset.id), null)
})

interface ImageFixture {
  dir: string
  db: ReturnType<typeof openTestDatabase>['db']
  database: Pick<
    import('../../../src/main/db/client.ts').DbClient,
    | 'publishImage'
    | 'setImageReference'
    | 'getImage'
    | 'listImages'
    | 'claimImageCleanup'
    | 'finishImageCleanup'
  >
  service: ManagedImages
  selected: string
  bytes: Buffer
  images: string
}

async function fixture(
  t: import('node:test').TestContext,
): Promise<ImageFixture> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'kiter-images-')))
  const resources: {
    connection?: ReturnType<typeof openTestDatabase>
    service?: ManagedImages
  } = {}
  t.after(async () => {
    await resources.service?.close()
    resources.connection?.close()
    await rm(dir, { recursive: true, force: true })
  })
  const connection = openTestDatabase(join(dir, 'catalog.sqlite'))
  resources.connection = connection
  const { db } = connection
  const database = {
    publishImage: async (input: Parameters<typeof assets.publishImage>[1]) =>
      assets.publishImage(db, input),
    setImageReference: async (
      input: Parameters<typeof assets.setImageReference>[1],
    ) => assets.setImageReference(db, input),
    getImage: async (id: string) => assets.getImage(db, id),
    listImages: async (after: string | null = null) =>
      assets.listImages(db, after),
    claimImageCleanup: async (id: string) => assets.claimImageCleanup(db, id),
    finishImageCleanup: async (id: string) => assets.finishImageCleanup(db, id),
  }
  const service = await ManagedImages.open(dir, database)
  resources.service = service
  const selected = join(dir, 'selected.with-wrong-extension')
  const bytes = await createPng()
  await writeFile(selected, bytes)
  return {
    dir,
    db,
    database,
    service,
    selected,
    bytes,
    images: join(dir, 'library', 'images'),
  }
}

test('Publication preserves originals, stale publication is recoverable, replacement cleans only unused managed copies', async (t) => {
  const f = await fixture(t)
  const collection = createCollection(f.db, { name: 'Test' })
  const target = { kind: 'collection' as const, id: collection.id }
  const first = await f.service.replace(target, null, f.selected)
  assert.deepEqual(await readFile(join(f.images, first.storageKey)), f.bytes)
  assert.deepEqual(await readFile(f.selected), f.bytes)
  assert.equal(getCollection(f.db, collection.id).coverAssetId, first.id)
  await assert.rejects(f.service.replace(target, null, f.selected), {
    code: 'STALE_REVIEW',
  })
  assert.deepEqual(await f.service.reconcile(), { removed: 1, failures: [] })
  const second = await f.service.replace(target, first.id, f.selected)
  assert.notEqual(first.id, second.id)
  assert.deepEqual(await f.service.reconcile(), { removed: 1, failures: [] })
  assert.equal(assets.getImage(f.db, first.id), null)
  assert.deepEqual(await readFile(f.selected), f.bytes)
  await f.service.setReference({
    target,
    expectedAssetId: second.id,
    assetId: null,
  })
  assert.deepEqual(await f.service.reconcile(), { removed: 1, failures: [] })
})

test('Recovery removes interrupted publication/temp files, retries cleanup, preserves referenced and unknown files', async (t) => {
  const f = await fixture(t)
  const asset = await f.service.replace({ kind: 'profile' }, null, f.selected)
  const orphan = `${randomUUID()}.png`
  const temporary = `${randomUUID()}.tmp`
  await writeFile(join(f.images, orphan), f.bytes)
  await writeFile(join(f.images, temporary), f.bytes)
  await writeFile(join(f.images, 'unknown.png'), f.bytes)
  await f.service.close()
  const restarted = await ManagedImages.open(f.dir, f.database)
  t.after(() => restarted.close())
  assert.deepEqual(await restarted.reconcile(), { removed: 2, failures: [] })
  assert.deepEqual(await readFile(join(f.images, asset.storageKey)), f.bytes)
  assert.deepEqual(await readFile(join(f.images, 'unknown.png')), f.bytes)
  await restarted.setReference({
    target: { kind: 'profile' },
    expectedAssetId: asset.id,
    assetId: null,
  })
  await rm(join(f.images, asset.storageKey))
  await mkdir(join(f.images, asset.storageKey))
  const failed = await restarted.reconcile()
  assert.equal(failed.failures.length, 1)
  assert.equal(assets.getImage(f.db, asset.id)?.state, 'cleanup_pending')
  await rm(join(f.images, asset.storageKey), { recursive: true })
  assert.deepEqual(await restarted.reconcile(), { removed: 1, failures: [] })
  assert.deepEqual(await readFile(f.selected), f.bytes)
})

test('Missing referenced images report failure and managed/source symlinks are never followed or deleted', async (t) => {
  const f = await fixture(t)
  const asset = await f.service.replace({ kind: 'profile' }, null, f.selected)
  await rm(join(f.images, asset.storageKey))
  assert.deepEqual((await f.service.reconcile()).failures, [
    { assetId: asset.id, code: 'IMAGE_UNAVAILABLE' },
  ])
  assert.equal(readLocalProfile(f.db).profile.avatarAssetId, asset.id)
  if (process.platform === 'win32') {
    t.diagnostic(
      'Symlink checks require Windows privileges; remaining assertions cover missing referenced images.',
    )
    return
  }
  const link = join(f.dir, 'selected-link.png')
  await symlink(f.selected, link)
  await assert.rejects(f.service.replace({ kind: 'profile' }, asset.id, link), {
    code: 'INVALID_INPUT',
  })
  const orphanLink = join(f.images, `${randomUUID()}.png`)
  await symlink(f.selected, orphanLink)
  assert.equal((await f.service.reconcile()).failures.length, 2)
  assert.ok((await lstat(orphanLink)).isSymbolicLink())
  assert.deepEqual(await readFile(f.selected), f.bytes)
})

test('Cleanup claims prevent racing attachments, paginated reconciliation handles more than one page', async (t) => {
  const f = await fixture(t)
  const asset = await f.service.replace({ kind: 'profile' }, null, f.selected)
  await f.service.setReference({
    target: { kind: 'profile' },
    expectedAssetId: asset.id,
    assetId: null,
  })
  const original = f.database.claimImageCleanup
  f.database.claimImageCleanup = async (id) => {
    const claim = await original(id)
    if (claim) {
      assert.throws(
        () =>
          assets.setImageReference(f.db, {
            target: { kind: 'profile' },
            expectedAssetId: null,
            assetId: id,
          }),
        { code: 'NOT_FOUND' },
      )
    }
    return claim
  }
  for (let index = 0; index < 105; index++) {
    f.db.insert(imageAssets).values(metadata()).run()
  }
  assert.deepEqual(await f.service.reconcile(), { removed: 106, failures: [] })
  assert.deepEqual(assets.listImages(f.db, null), [])
  assert.equal(
    f.db
      .select()
      .from(collections)
      .where(eq(collections.coverAssetId, asset.id))
      .all().length,
    0,
  )
})
