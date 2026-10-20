import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { readImportCatalog } from './import-snapshot.ts'
import { importFolder } from './import.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
  setSampleOrigin,
} from '../packs/operations.ts'
import { excludedSources, sourceRoots } from '../../schema/sources.ts'
import { isDbRequest, isDbReply } from '../../protocol/messages.ts'
import { dispatchRequest } from '../../worker/dispatch.ts'

test('import snapshot reads new, existing, excluded and inactive roots without changing catalog data', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('snapshot-root')
  const files = ['kick.wav', 'snare.wav'].map((name) =>
    makeDiscoveredAudioFile(root, name),
  )
  const imported = importFolder(db, root, files)
  const { id } = getPackSourceRoot(db, root)
  const review = reviewPackImport(db, id)
  const pack = importPack(db, {
    sourceRootId: id,
    name: 'My Pack',
    decisions: [],
    token: review.token,
  })
  setSampleOrigin(db, { sampleId: imported[1].id, packId: null })
  db.update(sourceRoots)
    .set({ registered: false })
    .where(eq(sourceRoots.id, id))
    .run()
  const excluded = path.join(root, 'excluded.wav')
  const fresh = path.join(root, 'new.wav')
  db.insert(excludedSources).values({ canonicalPath: excluded }).run()
  const before = native.serialize()
  const input = {
    roots: [root, path.resolve('new-root')],
    paths: [files[0].path, files[1].path, excluded, fresh],
  }
  const result = readImportCatalog(db, input)
  assert.deepEqual(result.roots, [
    {
      canonicalPath: root,
      registration: { id, registered: false },
      pack: { id: pack.id, name: 'My Pack' },
    },
    { canonicalPath: input.roots[1], registration: null, pack: null },
  ])
  assert.equal(result.candidates[0].sample?.id, imported[0].id)
  assert.equal(result.candidates[0].sample?.packId, pack.id)
  assert.equal(result.candidates[0].sample?.sourceRevision, 1)
  assert.equal(result.candidates[1].sample?.originAssignment, 'manual')
  assert.equal(result.candidates[1].sample?.packId, null)
  assert.deepEqual(result.candidates[2], {
    canonicalPath: excluded,
    excluded: true,
    sample: null,
  })
  assert.deepEqual(result.candidates[3], {
    canonicalPath: fresh,
    excluded: false,
    sample: null,
  })
  const reply = dispatchRequest(db, {
    action: 'read-import-catalog',
    input,
    requestId: 1,
  })
  assert.ok(isDbReply(reply))
  assert.deepEqual(reply, {
    action: 'read-import-catalog',
    requestId: 1,
    result,
  })
  assert.deepEqual(native.serialize(), before)
})

test('import snapshot validates bounded distinct requests and worker responses', (t) => {
  const { db } = createMemoryDatabase(t)
  const location = path.resolve('source.wav')
  for (const input of [
    { roots: [], paths: ['relative.wav'] },
    { roots: [], paths: [location, location] },
    {
      roots: [],
      paths: Array.from({ length: 101 }, (_, i) => path.resolve(`${i}.wav`)),
    },
    {
      roots: Array.from({ length: 33 }, (_, i) => path.resolve(`${i}`)),
      paths: [],
    },
  ]) {
    assert.throws(() => readImportCatalog(db, input), { code: 'INVALID_INPUT' })
  }
  assert.equal(
    isDbRequest({
      action: 'read-import-catalog',
      requestId: 1,
      input: { roots: [], paths: [location, location] },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      action: 'read-import-catalog',
      requestId: 1,
      result: {
        roots: [],
        candidates: [
          {
            canonicalPath: location,
            excluded: false,
            sample: { id: 'invalid' },
          },
        ],
      },
    }),
    false,
  )
  assert.deepEqual(readImportCatalog(db, { roots: [], paths: [] }), {
    roots: [],
    candidates: [],
  })
})
