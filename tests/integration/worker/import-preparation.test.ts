import assert from 'node:assert/strict'
import { once } from 'node:events'
import path from 'node:path'
import { test } from 'node:test'
import { createTemporaryDirectory } from '../../support/filesystem/temporary-directory.ts'
import { makeDiscoveredAudioFile } from '../../support/fixtures/source.ts'
import { startWorker, exchange } from '../../support/worker/worker.ts'

test('worker import snapshots reuse catalog identities and never catalog new candidates', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-worker')
  const worker = startWorker(path.join(temporary.path, 'catalog.sqlite'))
  temporary.beforeRemove(async () => {
    await worker.terminate()
  })
  assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
  const root = path.join(temporary.path, 'audio')
  const imported = await exchange(worker, {
    action: 'import',
    requestId: 1,
    root,
    files: [makeDiscoveredAudioFile(root)],
  })
  assert.equal(imported.action, 'import')
  if (imported.action !== 'import') {
    assert.fail('Expected imported Sample')
  }
  const newRoot = path.join(temporary.path, 'new-root')
  const newPath = path.join(newRoot, 'new.wav')
  const snapshot = await exchange(worker, {
    action: 'read-import-catalog',
    requestId: 2,
    input: {
      roots: [root, newRoot],
      paths: [imported.result[0].path, newPath],
    },
  })
  assert.equal(snapshot.action, 'read-import-catalog')
  if (snapshot.action !== 'read-import-catalog') {
    assert.fail('Expected import catalog snapshot')
  }
  assert.equal(snapshot.result.candidates[0].sample?.id, imported.result[0].id)
  assert.equal(snapshot.result.candidates[1].sample, null)
  assert.equal(snapshot.result.roots[1].registration, null)
  const unchanged = await exchange(worker, {
    action: 'read-import-catalog',
    requestId: 3,
    input: { roots: [newRoot], paths: [newPath] },
  })
  assert.deepEqual(unchanged, {
    action: 'read-import-catalog',
    requestId: 3,
    result: {
      roots: [{ canonicalPath: newRoot, registration: null, pack: null }],
      candidates: [{ canonicalPath: newPath, excluded: false, sample: null }],
    },
  })
  const vocabulary = await exchange(worker, {
    action: 'read-import-classification-context',
    requestId: 4,
    input: {},
  })
  assert.equal(vocabulary.action, 'read-import-classification-context')
  if (vocabulary.action !== 'read-import-classification-context') {
    assert.fail('Expected import classification vocabulary')
  }
  assert.ok(
    vocabulary.result.vocabulary.some(
      (entry) => entry.key === 'instrument:kick',
    ),
  )
  const context = await exchange(worker, {
    action: 'read-import-classification-context',
    requestId: 5,
    input: {
      token: vocabulary.result.token,
      targets: [{ kind: 'sample', id: imported.result[0].id }],
    },
  })
  assert.equal(context.action, 'read-import-classification-context')
  if (context.action !== 'read-import-classification-context') {
    assert.fail('Expected saved import classification context')
  }
  assert.deepEqual(context.result.targets, [
    {
      target: { kind: 'sample', id: imported.result[0].id },
      currentType: null,
      assignments: [],
    },
  ])
  const exit = once(worker, 'exit')
  await exchange(worker, { action: 'close', requestId: 6 })
  await exit
})
