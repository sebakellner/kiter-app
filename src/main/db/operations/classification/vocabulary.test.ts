import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import {
  createDiskDatabase,
  createMemoryDatabase,
} from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { makePackInsert } from '../../../../../tests/support/database/factories/pack.ts'
import { randomUUID } from 'node:crypto'
import { importFolder } from '../sources/import.ts'
import { setFavorite } from '../samples/favorites.ts'
import { reviewSampleRemoval, removeSample } from '../samples/operations.ts'
import { reviewPackRemoval, removePack } from '../packs/removal.ts'
import * as categories from './operations.ts'
import * as genres from './genres.ts'
import * as vocabulary from './vocabulary.ts'
import { recognitionVocabulary, packs, samples } from '../../schema/index.ts'
import { loadCatalogRecognizer } from '../../../services/classification/catalog.ts'
import { isDbRequest, isDbReply } from '../../protocol/messages.ts'
import type { RecognitionInput } from '../../../services/classification/recognition.types.ts'

test('fresh vocabulary seeds Genres but no Categories, with stable mappings and no duplicate aliases', (t) => {
  const { db } = createMemoryDatabase(t)
  assert.equal(genres.listGenres(db).total, 26)
  assert.equal(categories.listCategories(db).total, 0)
  const entries = vocabulary.listRecognitionVocabulary(db, { limit: 100 })
  assert.equal(entries.total, 54)
  assert.equal(
    entries.items.filter((item) => item.dimension === 'genre' && item.entityId)
      .length,
    26,
  )
  const kick = categories.createCategory(db, { name: 'Kick' })
  assert.equal(
    vocabulary
      .listRecognitionVocabulary(db, { limit: 100 })
      .items.find((item) => item.key === 'category:kick')?.entityId,
    kick.id,
  )
  assert.throws(() => categories.createCategory(db, { name: 'BD' }), {
    code: 'NAME_CONFLICT',
  })
  categories.createCategory(db, { name: 'Lo-Fi' })
  assert.throws(() => categories.createCategory(db, { name: 'Lo Fi' }), {
    code: 'NAME_CONFLICT',
  })
})

test('aliases enforce dimension identity, explicit reassignment, rename conflicts and durable deletions', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const kick = categories.createCategory(db, { name: 'Kick' })
  const snare = categories.createCategory(db, { name: 'Snare' })
  const bd = vocabulary
    .listRecognitionAliases(db, { limit: 100 })
    .items.find((alias) => alias.term === 'BD')!
  assert.throws(
    () =>
      vocabulary.writeRecognitionAlias(db, {
        targetKey: 'category:snare',
        term: 'bd',
      }),
    { code: 'NAME_CONFLICT' },
  )
  vocabulary.writeRecognitionAlias(db, {
    id: bd.id,
    targetKey: 'category:snare',
    term: 'BD',
  })
  assert.throws(
    () => categories.renameCategory(db, { id: kick.id, name: 'BD' }),
    { code: 'NAME_CONFLICT' },
  )
  assert.deepEqual(categories.getCategory(db, kick.id), kick)
  const house = genres
    .listGenres(db, { search: 'house' })
    .items.find((item) => item.name === 'House')!
  vocabulary.writeRecognitionAlias(db, { targetKey: 'genre:house', term: 'BD' })
  genres.renameGenre(db, { id: house.id, name: 'My House' })
  const review = genres.reviewGenreRemoval(db, house.id)
  vocabulary.writeRecognitionAlias(db, {
    targetKey: 'genre:house',
    term: 'My Style',
  })
  assert.throws(
    () => genres.removeGenre(db, { id: house.id, token: review.token }),
    { code: 'STALE_REVIEW' },
  )
  const snareReview = categories.reviewCategoryRemoval(db, snare.id)
  vocabulary.removeRecognitionAlias(db, bd.id)
  assert.throws(
    () =>
      categories.removeCategory(db, { id: snare.id, token: snareReview.token }),
    { code: 'STALE_REVIEW' },
  )
  const aliasesBefore = vocabulary.listRecognitionAliases(db, { limit: 100 })
  db = disk.reopen().db
  assert.deepEqual(
    vocabulary.listRecognitionAliases(db, { limit: 100 }),
    aliasesBefore,
  )
  assert.equal(genres.getGenre(db, house.id).name, 'My House')
  genres.removeGenre(db, {
    id: house.id,
    token: genres.reviewGenreRemoval(db, house.id).token,
  })
  db = disk.reopen().db
  assert.equal(genres.listGenres(db).total, 25)
  assert.equal(
    vocabulary
      .listRecognitionVocabulary(db, { limit: 100 })
      .items.find((item) => item.key === 'genre:house')?.state,
    'deleted',
  )
  assert.ok(
    !vocabulary
      .listRecognitionAliases(db, { limit: 100 })
      .items.some((alias) => alias.targetKey === 'genre:house'),
  )
})

test('Genre assignments are independent, idempotent, persistent and removal preserves Samples and Favorites', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('genre-fixture')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  setFavorite(db, sample.id, true)
  const packId = randomUUID()
  db.insert(packs)
    .values(makePackInsert(packId, db.query.sourceRoots.findFirst().sync()!.id))
    .run()
  const genre = genres.createGenre(db, { name: 'Custom Genre' })
  const sampleReview = reviewSampleRemoval(db, sample.id)
  const packReview = reviewPackRemoval(db, packId)
  const sampleTarget = { kind: 'sample' as const, id: sample.id }
  const packTarget = { kind: 'pack' as const, id: packId }
  genres.setGenreAssignment(db, {
    id: genre.id,
    target: packTarget,
    assigned: true,
  })
  assert.equal(genres.listGenres(db, {}, sampleTarget).total, 0)
  genres.setGenreAssignment(db, {
    id: genre.id,
    target: sampleTarget,
    assigned: true,
  })
  assert.throws(
    () => removeSample(db, { id: sample.id, token: sampleReview.token }),
    { code: 'STALE_REVIEW' },
  )
  assert.throws(() => removePack(db, { id: packId, token: packReview.token }), {
    code: 'STALE_REVIEW',
  })
  genres.setGenreAssignment(db, {
    id: genre.id,
    target: sampleTarget,
    assigned: true,
  })
  assert.equal(genres.listGenres(db, {}, sampleTarget).total, 1)
  const review = genres.reviewGenreRemoval(db, genre.id)
  assert.equal(review.sampleCount, 1)
  assert.equal(review.packCount, 1)
  db = disk.reopen().db
  assert.deepEqual(genres.listGenres(db, {}, sampleTarget).items, [genre])
  genres.removeGenre(db, { id: genre.id, token: review.token })
  assert.equal(
    db.select().from(samples).where(eq(samples.id, sample.id)).get()?.favorite,
    true,
  )
  assert.equal(genres.listGenres(db, {}, packTarget).total, 0)
})

test('catalog recognizer uses edited names and aliases and reuses linked Category identities', async (t) => {
  const { db } = createMemoryDatabase(t)
  const kick = categories.createCategory(db, { name: 'Kick' })
  categories.renameCategory(db, { id: kick.id, name: 'Thump' })
  vocabulary.writeRecognitionAlias(db, {
    targetKey: 'category:kick',
    term: 'Boom',
  })
  const recognize = await loadCatalogRecognizer({
    listRecognitionVocabulary: async (input) =>
      vocabulary.listRecognitionVocabulary(db, input),
    listRecognitionAliases: async (input) =>
      vocabulary.listRecognitionAliases(db, input),
  })
  const input = (text: string): RecognitionInput => ({
    kind: 'sample' as const,
    components: [
      {
        kind: 'filename' as const,
        text,
        distance: 0,
        occurrence: 'file',
        availability: 'observed' as const,
      },
    ],
  })
  assert.deepEqual(recognize(input('kick.wav')).proposals, [])
  assert.deepEqual(
    recognize(input('boom.wav')).proposals.map(
      (proposal) => proposal.target.key,
    ),
    ['category:kick'],
  )
  assert.equal(
    db
      .select()
      .from(recognitionVocabulary)
      .where(eq(recognitionVocabulary.categoryId, kick.id))
      .get()?.key,
    'category:kick',
  )
})

test('worker recognition protocol rejects malformed values and validates bounded pages', () => {
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'create-genre',
      input: { name: 'Test' },
    }),
    true,
  )
  for (const request of [
    { action: 'write-recognition-alias', input: { targetKey: '', term: 'BD' } },
    {
      action: 'write-recognition-alias',
      input: { targetKey: 'category:kick', term: '\nBD' },
    },
    { action: 'list-recognition-vocabulary', input: { limit: 101 } },
    {
      action: 'set-genre-assignment',
      input: {
        id: randomUUID(),
        target: { kind: 'sample', id: randomUUID() },
        assigned: 'yes',
      },
    },
  ]) {
    assert.equal(isDbRequest({ requestId: 1, ...request }), false)
  }
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-recognition-aliases',
      result: { items: [], total: 0, limit: 100, offset: 0 },
    }),
    true,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-recognition-aliases',
      result: { items: [{ id: 'bad' }], total: 1, limit: 100, offset: 0 },
    }),
    false,
  )
})
