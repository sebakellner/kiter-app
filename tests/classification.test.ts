import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/main/db/connection.ts'
import * as classification from '../src/main/db/operations/classification.ts'
import { importFolder } from '../src/main/db/operations/sources.ts'
import {
  readLocalProfile,
  setPreviewVolume,
} from '../src/main/db/operations/profile.ts'
import { setFavorite } from '../src/main/db/operations/samples.ts'
import {
  collections,
  collectionSamples,
  packs,
  samples,
  userProfiles,
  sampleCategories,
} from '../src/main/db/schema/index.ts'
import { requireClassificationName } from '../src/shared/domain/classification.ts'
import { isDbReply, isDbRequest } from '../src/main/db/protocol.ts'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
const open = (filename = ':memory:'): ReturnType<typeof openDatabase> =>
  openDatabase(filename, migrationsFolder)

function fixture(db: ReturnType<typeof open>['db']): {
  sampleId: string
  otherSampleId: string
  packId: string
  collectionId: string
} {
  const root = path.resolve('classification-fixture')
  const files = ['kick.wav', 'snare.wav'].map((name) => ({
    name,
    path: path.join(root, name),
    relativePath: name,
    observedSizeBytes: 100,
    observedMtimeMs: 1000,
  }))
  const imported = importFolder(db, root, files)
  const packId = randomUUID(),
    collectionId = randomUUID()
  const rootId = db.query.sourceRoots.findFirst().sync()!.id
  db.insert(packs)
    .values({ id: packId, sourceRootId: rootId, name: 'Origin' })
    .run()
  db.update(samples)
    .set({ packId, displayName: 'My Kick', notes: 'Keep me' })
    .where(eq(samples.id, imported[0].id))
    .run()
  db.insert(collections).values({ id: collectionId, name: 'Selection' }).run()
  db.insert(collectionSamples)
    .values({ collectionId, sampleId: imported[0].id, position: 0 })
    .run()
  setFavorite(db, imported[0].id, true)
  return {
    sampleId: imported[0].id,
    otherSampleId: imported[1].id,
    packId,
    collectionId,
  }
}

test('classification names use NFC, Unicode code points and reject controls before trimming', () => {
  assert.equal(requireClassificationName('  E\u0301lectro  '), 'Électro')
  assert.equal(requireClassificationName('😀'.repeat(120)), '😀'.repeat(120))
  assert.equal(requireClassificationName('Hi  Hat'), 'Hi  Hat')
  for (const name of [
    '',
    '   ',
    null,
    123,
    '\nDrums',
    'Drums\t',
    'a\u0000b',
    'a\u0085b',
    'a\u2028b',
    'a\u2029b',
    '😀'.repeat(121),
  ]) {
    assert.throws(() => requireClassificationName(name), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Category uniqueness and rename rollback coexist with independent homonymous Authors', (t) => {
  const { db, close } = open()
  t.after(close)
  const category = classification.createCategory(db, {
    name: ' E\u0301LECTRO ',
  })
  assert.equal(category.name, 'ÉLECTRO')
  assert.throws(() => classification.createCategory(db, { name: 'électro' }), {
    code: 'NAME_CONFLICT',
  })
  const drums = classification.createCategory(db, { name: 'Drums' })
  assert.throws(
    () => classification.renameCategory(db, { id: drums.id, name: 'Électro' }),
    {
      code: 'NAME_CONFLICT',
    },
  )
  assert.deepEqual(classification.getCategory(db, drums.id), drums)
  assert.deepEqual(
    classification.renameCategory(db, { id: category.id, name: 'Électro' }),
    {
      ...category,
      name: 'Électro',
    },
  )
  classification.renameCategory(db, { id: category.id, name: 'Textures' })
  assert.equal(
    classification.createCategory(db, { name: 'Électro' }).name,
    'Électro',
  )
  const first = classification.createAuthor(db, { name: 'Producer' })
  const second = classification.createAuthor(db, { name: ' Producer ' })
  assert.notEqual(first.id, second.id)
  assert.deepEqual(
    classification.renameAuthor(db, { id: first.id, name: 'PRODUCER' }),
    {
      ...first,
      name: 'PRODUCER',
    },
  )
  assert.deepEqual(classification.getAuthor(db, second.id), second)
  assert.equal(classification.listAuthors(db, { search: 'producer' }).total, 2)
  for (const get of [classification.getAuthor, classification.getCategory]) {
    assert.throws(() => get(db, randomUUID()), { code: 'NOT_FOUND' })
    assert.throws(() => get(db, 'invalid'), { code: 'INVALID_INPUT' })
  }
})

test('classification searches are Unicode-aware, literal, accent-sensitive and bounded with stable homonym ordering', (t) => {
  const { db, close } = open()
  t.after(close)
  for (const name of [
    'Électro',
    'Electronique',
    'Hi  Hat',
    '100%_Loop',
    ...Array.from({ length: 53 }, () => 'Same'),
  ]) {
    classification.createAuthor(db, { name })
  }
  const first = classification.listAuthors(db)
  assert.equal(first.limit, 50)
  assert.equal(first.offset, 0)
  assert.equal(first.total, 57)
  assert.equal(first.items.length, 50)
  const second = classification.listAuthors(db, { offset: 50 })
  assert.equal(second.items.length, 7)
  assert.equal(
    new Set([...first.items, ...second.items].map((row) => row.id)).size,
    57,
  )
  const homonyms = classification.listAuthors(db, {
    search: 'same',
    limit: 100,
  })
  assert.deepEqual(
    homonyms.items.map((row) => row.id),
    homonyms.items.map((row) => row.id).sort(),
  )
  assert.equal(
    classification.listAuthors(db, { search: ' E\u0301L ' }).items[0].name,
    'Électro',
  )
  assert.equal(classification.listAuthors(db, { search: 'el' }).total, 1)
  assert.equal(classification.listAuthors(db, { search: '%_' }).total, 1)
  assert.equal(classification.listAuthors(db, { search: 'Hi Hat' }).total, 0)
  assert.deepEqual(classification.listAuthors(db, { offset: 100 }).items, [])
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: NaN },
    { search: '\n' },
    { search: 'a'.repeat(121) },
  ]) {
    assert.throws(() => classification.listAuthors(db, input), {
      code: 'INVALID_INPUT',
    })
    assert.throws(() => classification.listCategories(db, input), {
      code: 'INVALID_INPUT',
    })
  }
  classification.createCategory(db, { name: 'Électro' })
  classification.createCategory(db, { name: 'Bass' })
  assert.equal(
    classification.listCategories(db, { search: 'éL' }).items[0].name,
    'Électro',
  )
  assert.equal(
    classification.listCategories(db, { limit: 1 }).items[0].name,
    'Bass',
  )
})

test('assignments are idempotent, direct and independent of origin, profile, Favorites and Collections', (t) => {
  const { db, close } = open()
  t.after(close)
  const { sampleId, otherSampleId, packId } = fixture(db)
  const author = classification.createAuthor(db, { name: 'Producer' })
  const category = classification.createCategory(db, { name: 'Drums' })
  db.update(userProfiles).set({ authorId: author.id }).run()
  const sample = { kind: 'sample' as const, id: sampleId }
  const pack = { kind: 'pack' as const, id: packId }
  const before = db.select().from(samples).all()
  assert.equal(classification.listTargetAuthors(db, sample).total, 0)
  for (const [entity, assign, list, uses] of [
    [
      author,
      classification.setAuthorAssignment,
      classification.listTargetAuthors,
      classification.listAuthorUses,
    ],
    [
      category,
      classification.setCategoryAssignment,
      classification.listTargetCategories,
      classification.listCategoryUses,
    ],
  ] as const) {
    assign(db, { id: entity.id, target: pack, assigned: true })
    assign(db, { id: entity.id, target: pack, assigned: true })
    assert.equal(list(db, sample).total, 0)
    assert.deepEqual(list(db, pack).items, [entity])
    assign(db, { id: entity.id, target: sample, assigned: true })
    assert.deepEqual(
      list(db, sample, { search: entity.name.toUpperCase() }).items,
      [entity],
    )
    assert.deepEqual(uses(db, { id: entity.id, kind: 'sample' }).items, [
      { id: sampleId, name: 'My Kick' },
    ])
    assert.deepEqual(uses(db, { id: entity.id, kind: 'pack' }).items, [
      { id: packId, name: 'Origin' },
    ])
    assign(db, {
      id: entity.id,
      target: { kind: 'sample', id: otherSampleId },
      assigned: true,
    })
    assert.equal(uses(db, { id: entity.id, kind: 'sample', limit: 1 }).total, 2)
    assert.equal(
      uses(db, { id: entity.id, kind: 'sample', limit: 1, offset: 1 }).items
        .length,
      1,
    )
    assert.ok(
      uses(db, { id: entity.id, kind: 'sample' }).items.some(
        (row) => row.name === 'snare.wav',
      ),
    )
    assign(db, { id: entity.id, target: sample, assigned: false })
    assign(db, { id: entity.id, target: sample, assigned: false })
    assert.equal(list(db, pack).total, 1)
    assert.equal(list(db, sample).total, 0)
    assert.throws(
      () =>
        assign(db, {
          id: entity.id,
          target: { kind: 'sample', id: randomUUID() },
          assigned: true,
        }),
      { code: 'NOT_FOUND' },
    )
    assert.throws(
      () => assign(db, { id: randomUUID(), target: sample, assigned: true }),
      {
        code: 'NOT_FOUND',
      },
    )
  }
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.equal(db.select().from(collectionSamples).all().length, 1)
})

test('removal revalidates exact impact, including equal-count substitutions, rename and profile links', (t) => {
  const { db, close } = open()
  t.after(close)
  const { sampleId, otherSampleId, packId } = fixture(db)
  const category = classification.createCategory(db, { name: 'Drums' })
  const author = classification.createAuthor(db, { name: 'Producer' })
  for (const [entity, assign, review, remove, get] of [
    [
      author,
      classification.setAuthorAssignment,
      classification.reviewAuthorRemoval,
      classification.removeAuthor,
      classification.getAuthor,
    ],
    [
      category,
      classification.setCategoryAssignment,
      classification.reviewCategoryRemoval,
      classification.removeCategory,
      classification.getCategory,
    ],
  ] as const) {
    assign(db, {
      id: entity.id,
      target: { kind: 'sample', id: sampleId },
      assigned: true,
    })
    const initial = review(db, entity.id)
    assert.equal(initial.sampleCount, 1)
    assign(db, {
      id: entity.id,
      target: { kind: 'sample', id: sampleId },
      assigned: false,
    })
    assign(db, {
      id: entity.id,
      target: { kind: 'sample', id: otherSampleId },
      assigned: true,
    })
    assert.throws(() => remove(db, { id: entity.id, token: initial.token }), {
      code: 'STALE_REVIEW',
    })
    assert.deepEqual(get(db, entity.id), entity)
    const next = review(db, entity.id)
    assign(db, {
      id: entity.id,
      target: { kind: 'pack', id: packId },
      assigned: true,
    })
    assert.throws(() => remove(db, { id: entity.id, token: next.token }), {
      code: 'STALE_REVIEW',
    })
    assert.throws(() => remove(db, { id: entity.id, token: '' }), {
      code: 'INVALID_INPUT',
    })
  }
  const preLink = classification.reviewAuthorRemoval(db, author.id)
  db.update(userProfiles).set({ authorId: author.id }).run()
  assert.throws(
    () =>
      classification.removeAuthor(db, { id: author.id, token: preLink.token }),
    {
      code: 'STALE_REVIEW',
    },
  )
  const preRename = classification.reviewCategoryRemoval(db, category.id)
  classification.renameCategory(db, { id: category.id, name: 'Percussion' })
  assert.throws(
    () =>
      classification.removeCategory(db, {
        id: category.id,
        token: preRename.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  setPreviewVolume(db, 0)
  const local = readLocalProfile(db)
  const beforeSamples = db.select().from(samples).all()
  const review = classification.reviewAuthorRemoval(db, author.id)
  assert.deepEqual(review.linkedProfile, {
    id: local.profile.id,
    name: local.profile.name,
  })
  assert.equal(review.packCount, 1)
  assert.deepEqual(
    classification.removeAuthor(db, { id: author.id, token: review.token }),
    {
      id: author.id,
    },
  )
  assert.deepEqual(readLocalProfile(db), {
    ...local,
    profile: { ...local.profile, authorId: null },
  })
  classification.removeCategory(db, {
    id: category.id,
    token: classification.reviewCategoryRemoval(db, category.id).token,
  })
  assert.deepEqual(db.select().from(samples).all(), beforeSamples)
  assert.equal(db.select().from(packs).all().length, 1)
  assert.equal(db.select().from(collectionSamples).all().length, 1)
  assert.equal(
    classification.listTargetAuthors(db, { kind: 'pack', id: packId }).total,
    0,
  )
  assert.equal(
    classification.listTargetCategories(db, {
      kind: 'sample',
      id: otherSampleId,
    }).total,
    0,
  )
  assert.throws(() => classification.getAuthor(db, author.id), {
    code: 'NOT_FOUND',
  })
  assert.throws(() => classification.getCategory(db, category.id), {
    code: 'NOT_FOUND',
  })
})

test('failed deletion rolls back cascades and profile unlinking', (t) => {
  const { db, native, close } = open()
  t.after(close)
  const { sampleId } = fixture(db)
  const author = classification.createAuthor(db, { name: 'Producer' })
  db.update(userProfiles).set({ authorId: author.id }).run()
  classification.setAuthorAssignment(db, {
    id: author.id,
    target: { kind: 'sample', id: sampleId },
    assigned: true,
  })
  const review = classification.reviewAuthorRemoval(db, author.id)
  native.exec(
    "CREATE TRIGGER reject_author_delete AFTER DELETE ON authors BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
  )
  assert.throws(() =>
    classification.removeAuthor(db, { id: author.id, token: review.token }),
  )
  assert.deepEqual(classification.reviewAuthorRemoval(db, author.id), review)
  assert.equal(readLocalProfile(db).profile.authorId, author.id)
})

test('removal reviews cover all associations beyond a single internal batch', (t) => {
  const { db, close } = open()
  t.after(close)
  const root = path.resolve('classification-large-fixture')
  const imported = importFolder(
    db,
    root,
    Array.from({ length: 501 }, (_, i) => ({
      name: `sample${i}.wav`,
      path: path.join(root, `sample${i}.wav`),
      relativePath: `sample${i}.wav`,
      observedSizeBytes: 100,
      observedMtimeMs: 1000,
    })),
  )
  const category = classification.createCategory(db, { name: 'Large group' })
  db.transaction(() => {
    for (const sample of imported) {
      db.insert(sampleCategories)
        .values({ sampleId: sample.id, categoryId: category.id })
        .run()
    }
  })
  const review = classification.reviewCategoryRemoval(db, category.id)
  assert.equal(review.sampleCount, 501)
  const last = imported
    .map((sample) => sample.id)
    .sort()
    .at(-1)!
  classification.setCategoryAssignment(db, {
    id: category.id,
    target: { kind: 'sample', id: last },
    assigned: false,
  })
  assert.throws(
    () =>
      classification.removeCategory(db, {
        id: category.id,
        token: review.token,
      }),
    {
      code: 'STALE_REVIEW',
    },
  )
})

test('classification identities, assignments and review tokens survive database reopen', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-classification-'))
  const filename = path.join(dir, 'test.sqlite')
  let connection = open(filename)
  try {
    const { sampleId } = fixture(connection.db)
    const category = classification.createCategory(connection.db, {
      name: 'Drums',
    })
    classification.setCategoryAssignment(connection.db, {
      id: category.id,
      target: { kind: 'sample', id: sampleId },
      assigned: true,
    })
    const review = classification.reviewCategoryRemoval(
      connection.db,
      category.id,
    )
    connection.close()
    connection = open(filename)
    assert.deepEqual(
      classification.reviewCategoryRemoval(connection.db, category.id),
      review,
    )
    assert.deepEqual(
      classification.listTargetCategories(connection.db, {
        kind: 'sample',
        id: sampleId,
      }).items,
      [category],
    )
    classification.removeCategory(connection.db, {
      id: category.id,
      token: review.token,
    })
  } finally {
    connection.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('worker classification contracts reject invalid names, pagination, associations and malformed replies', () => {
  const id = randomUUID()
  for (const request of [
    { action: 'create-author', input: { name: 'Producer' } },
    {
      action: 'set-category-assignment',
      input: { id, target: { kind: 'pack', id }, assigned: true },
    },
    { action: 'list-authors', input: { search: 'É', limit: 100 } },
    { action: 'remove-category', input: { id, token: 'a'.repeat(64) } },
  ]) {
    assert.equal(isDbRequest({ requestId: 1, ...request }), true)
  }
  for (const request of [
    { action: 'create-author', input: { name: 'a\n' } },
    { action: 'rename-category', input: { id: 'bad', name: 'Valid' } },
    { action: 'list-authors', input: { limit: 101 } },
    { action: 'list-author-uses', input: { id, kind: 'collection' } },
    {
      action: 'set-author-assignment',
      input: { id, target: { kind: 'sample', id }, assigned: 'true' },
    },
    { action: 'remove-author', input: { id } },
  ]) {
    assert.equal(isDbRequest({ requestId: 1, ...request }), false)
  }
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'create-author',
      result: { id, name: 'Producer' },
    }),
    true,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'create-author',
      result: { id, name: ' Producer ' },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-authors',
      result: {
        items: [{ id, name: 'Producer' }],
        total: 0,
        limit: 50,
        offset: 0,
      },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'review-author-removal',
      result: {
        entity: { id, name: 'Producer' },
        sampleCount: -1,
        packCount: 0,
        linkedProfile: null,
        token: 'a'.repeat(64),
      },
    }),
    false,
  )
})
