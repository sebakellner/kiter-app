import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/main/db/runtime/connection.ts'
import {
  readLocalProfile,
  setPreviewVolume,
  updateLocalProfile,
} from '../src/main/db/operations/profile/operations.ts'
import * as classification from '../src/main/db/operations/classification/operations.ts'
import { imageAssets, userProfiles } from '../src/main/db/schema/index.ts'
import { isDbRequest, isDbReply } from '../src/main/db/protocol/messages.ts'
import { requireProfileUpdate } from '../src/shared/domain/profile.ts'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

test('profile updates normalize names and require an explicit valid Author link or null', () => {
  assert.deepEqual(
    requireProfileUpdate({ name: ' E\u0301va ', authorId: null }),
    {
      name: 'Éva',
      authorId: null,
    },
  )
  assert.equal(
    requireProfileUpdate({ name: '😀'.repeat(120), authorId: null }).name,
    '😀'.repeat(120),
  )
  for (const input of [
    null,
    {},
    { name: 'Eva' },
    { name: 'Eva', authorId: 'invalid' },
    ...[
      '',
      '  ',
      '\nEva',
      'Eva\t',
      'a\u0000b',
      'a\u0085b',
      'a\u2028b',
      'a\u2029b',
      '😀'.repeat(121),
      7,
    ].map((name) => ({ name, authorId: null })),
  ]) {
    assert.throws(() => requireProfileUpdate(input), { code: 'INVALID_INPUT' })
    assert.equal(
      isDbRequest({ requestId: 1, action: 'update-profile', input }),
      false,
    )
  }
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'update-profile',
      input: { name: ' Eva ', authorId: randomUUID() },
    }),
    true,
  )
  const profile = {
    id: randomUUID(),
    name: 'Éva',
    authorId: null,
    avatarAssetId: null,
  }
  assert.equal(
    isDbReply({ requestId: 1, action: 'update-profile', result: profile }),
    true,
  )
  for (const changes of [
    { name: ' Eva ' },
    { name: 'E\u0301va' },
    { name: 'a'.repeat(121) },
    { authorId: undefined },
    { avatarAssetId: 'invalid' },
  ]) {
    assert.equal(
      isDbReply({
        requestId: 1,
        action: 'update-profile',
        result: { ...profile, ...changes },
      }),
      false,
    )
  }
})

test('profile editing preserves identity, avatar and Preferences without renaming or crediting Authors', (t) => {
  const connection = openDatabase(':memory:', migrationsFolder)
  t.after(connection.close)
  const { db } = connection
  const initial = readLocalProfile(db)
  const author = classification.createAuthor(db, { name: 'Artistic name' })
  const other = classification.createAuthor(db, { name: 'Another artist' })
  const avatarAssetId = randomUUID()
  db.insert(imageAssets)
    .values({
      id: avatarAssetId,
      storageKey: `${avatarAssetId}.png`,
      mimeType: 'image/png',
      byteSize: 100,
      width: 10,
      height: 10,
      state: 'ready',
    })
    .run()
  db.update(userProfiles)
    .set({ avatarAssetId })
    .where(eq(userProfiles.id, initial.profile.id))
    .run()
  setPreviewVolume(db, 0)
  const updated = updateLocalProfile(db, {
    name: ' E\u0301va ',
    authorId: author.id,
  })
  assert.deepEqual(updated, {
    ...initial.profile,
    name: 'Éva',
    authorId: author.id,
    avatarAssetId,
  })
  assert.deepEqual(classification.getAuthor(db, author.id), author)
  assert.deepEqual(
    classification.listAuthorUses(db, { id: author.id, kind: 'sample' }).items,
    [],
  )
  assert.deepEqual(
    classification.listAuthorUses(db, { id: author.id, kind: 'pack' }).items,
    [],
  )
  assert.equal(readLocalProfile(db).preferences.previewVolume, 0)
  assert.equal(
    updateLocalProfile(db, { name: 'Éva', authorId: other.id }).authorId,
    other.id,
  )
  assert.equal(
    updateLocalProfile(db, { name: 'Éva', authorId: null }).authorId,
    null,
  )
  assert.deepEqual(classification.getAuthor(db, other.id), other)
  assert.equal(db.select().from(imageAssets).get()!.state, 'ready')
})

test('failed profile edits preserve prior state and changed profile links invalidate Author removal reviews', (t) => {
  const connection = openDatabase(':memory:', migrationsFolder)
  t.after(connection.close)
  const { db, native } = connection
  const author = classification.createAuthor(db, { name: 'Artist' })
  const review = classification.reviewAuthorRemoval(db, author.id)
  updateLocalProfile(db, { name: 'Producer', authorId: author.id })
  const previous = readLocalProfile(db)
  assert.throws(
    () =>
      classification.removeAuthor(db, { id: author.id, token: review.token }),
    { code: 'STALE_REVIEW' },
  )
  assert.throws(
    () => updateLocalProfile(db, { name: 'Changed', authorId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  assert.deepEqual(readLocalProfile(db), previous)
  assert.throws(
    () => updateLocalProfile(db, { name: '\nInvalid', authorId: null }),
    { code: 'INVALID_INPUT' },
  )
  assert.deepEqual(readLocalProfile(db), previous)
  native.exec(`CREATE TRIGGER reject_profile_edit BEFORE UPDATE ON user_profiles
    BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`)
  assert.throws(() =>
    updateLocalProfile(db, { name: 'Changed', authorId: null }),
  )
  assert.deepEqual(readLocalProfile(db), previous)
  native.exec('DROP TRIGGER reject_profile_edit')
  const fresh = classification.reviewAuthorRemoval(db, author.id)
  classification.removeAuthor(db, { id: author.id, token: fresh.token })
  assert.deepEqual(readLocalProfile(db), {
    ...previous,
    profile: { ...previous.profile, authorId: null },
  })
})
