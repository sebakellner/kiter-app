import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { test } from 'node:test'
import { isDbReply } from '../src/main/db/protocol.ts'
import type { DbReply, DbRequest } from '../src/main/db/protocol.ts'

function startWorker(
  filename: string,
  migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url)),
): Worker {
  return new Worker(new URL('../src/main/db/worker.ts', import.meta.url), {
    workerData: {
      filename,
      migrationsFolder,
    },
  })
}

async function exchange(worker: Worker, request: DbRequest): Promise<DbReply> {
  const response = once(worker, 'message')
  worker.postMessage(request)
  const [reply] = await response
  assert.ok(isDbReply(reply))
  return reply
}

test(
  'Sample worker commands persist edits, exclusions and new reinclusion identity across restart',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-samples-'))
    const filename = path.join(dir, 'kiter.sqlite')
    let worker = startWorker(filename)
    let requestId = 0
    const send = (
      request: import('../src/main/db/sampleProtocol.ts').SampleRequest,
    ): Promise<DbReply> =>
      exchange(worker, { ...request, requestId: ++requestId })
    const restart = async (): Promise<void> => {
      const exited = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await exited
      worker = startWorker(filename)
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
    }
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const file = {
        name: 'sample.wav',
        path: path.join(dir, 'sample.wav'),
        relativePath: 'sample.wav',
        observedSizeBytes: 100,
        observedMtimeMs: 1000,
      }
      const imported = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: [file],
      })
      if (imported.action !== 'import') {
        assert.fail('Expected imported Samples')
      }
      const id = imported.result[0].id
      const updated = await send({
        action: 'update-sample',
        input: { id, displayName: ' Kick ', notes: 'My notes' },
      })
      if (updated.action !== 'update-sample') {
        assert.fail('Expected edited Sample')
      }
      const review = await send({ action: 'review-sample-removal', id })
      if (review.action !== 'review-sample-removal') {
        assert.fail('Expected removal review')
      }
      const references = await send({
        action: 'list-sample-references',
        input: { id, kind: 'root' },
      })
      if (references.action !== 'list-sample-references') {
        assert.fail('Expected root references')
      }
      const sourceRootId = references.result.items[0].id
      await restart()
      assert.deepEqual(await send({ action: 'get-sample', id }), {
        requestId,
        action: 'get-sample',
        result: updated.result,
      })
      await exchange(worker, {
        requestId: ++requestId,
        action: 'favorite',
        id,
        favorite: true,
      })
      const stale = await send({
        action: 'remove-sample',
        input: { id, token: review.result.token },
      })
      if (stale.action !== 'error') {
        assert.fail('Expected stale review')
      }
      assert.equal(stale.failure.code, 'STALE_REVIEW')
      const fresh = await send({ action: 'review-sample-removal', id })
      if (fresh.action !== 'review-sample-removal') {
        assert.fail('Expected fresh removal review')
      }
      assert.deepEqual(
        await send({
          action: 'remove-sample',
          input: { id, token: fresh.result.token },
        }),
        { requestId, action: 'remove-sample', result: { id } },
      )
      await restart()
      const exclusions = await send({
        action: 'list-excluded-sources',
        input: {},
      })
      if (exclusions.action !== 'list-excluded-sources') {
        assert.fail('Expected exclusions')
      }
      assert.deepEqual(exclusions.result.items, [{ canonicalPath: file.path }])
      const rescanned = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: [file],
      })
      assert.deepEqual(rescanned, { requestId, action: 'import', result: [] })
      const input = { canonicalPath: file.path, sourceRootId }
      const root = await send({ action: 'get-reinclusion-root', input })
      assert.equal(root.action, 'get-reinclusion-root')
      const reincluded = await send({ action: 'reinclude-source', input, file })
      if (reincluded.action !== 'reinclude-source') {
        assert.fail('Expected reincluded Sample')
      }
      assert.notEqual(reincluded.result.id, id)
      assert.deepEqual(reincluded.result, {
        id: reincluded.result.id,
        displayName: null,
        notes: null,
        favorite: false,
        packId: null,
        originAssignment: 'manual',
      })
      await restart()
      assert.deepEqual(
        await send({ action: 'get-sample', id: reincluded.result.id }),
        { requestId, action: 'get-sample', result: reincluded.result },
      )
      const empty = await send({ action: 'list-excluded-sources', input: {} })
      if (empty.action !== 'list-excluded-sources') {
        assert.fail('Expected empty exclusions')
      }
      assert.equal(empty.result.total, 0)
      const exited = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await exited
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'Pack worker commands persist origins and reject stale confirmation across restart',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-packs-'))
    const filename = path.join(dir, 'kiter.sqlite')
    let worker = startWorker(filename)
    let requestId = 0
    const send = (
      request: import('../src/main/db/packProtocol.ts').PackRequest,
    ): Promise<DbReply> =>
      exchange(worker, { ...request, requestId: ++requestId })
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const imported = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: [
          {
            name: 'sample.wav',
            path: path.join(dir, 'sample.wav'),
            relativePath: 'sample.wav',
            observedSizeBytes: 100,
            observedMtimeMs: 1000,
          },
        ],
      })
      if (imported.action !== 'import') {
        assert.fail('Expected imported Samples')
      }
      const sampleId = imported.result[0].id
      const root = await send({ action: 'get-pack-source-root', root: dir })
      if (root.action !== 'get-pack-source-root') {
        assert.fail('Expected a source root')
      }
      const review = await send({
        action: 'review-pack-import',
        id: root.result.id,
      })
      if (review.action !== 'review-pack-import') {
        assert.fail('Expected an import review')
      }
      const candidates = await send({
        action: 'list-pack-import-candidates',
        id: root.result.id,
        input: {},
      })
      if (candidates.action !== 'list-pack-import-candidates') {
        assert.fail('Expected import candidates')
      }
      assert.equal(candidates.result.items[0].conflict, false)
      const created = await send({
        action: 'import-pack',
        input: {
          sourceRootId: root.result.id,
          token: review.result.token,
          name: 'Pack',
          decisions: [],
        },
      })
      if (created.action !== 'import-pack') {
        assert.fail('Expected a Pack')
      }
      const id = created.result.id
      const updated = await send({
        action: 'update-pack',
        input: { id, name: 'Edited', description: 'Notes' },
      })
      if (updated.action !== 'update-pack') {
        assert.fail('Expected an edited Pack')
      }
      const reviewed = await send({ action: 'review-pack-removal', id })
      if (reviewed.action !== 'review-pack-removal') {
        assert.fail('Expected a removal review')
      }
      await send({
        action: 'set-sample-origin',
        input: { sampleId, packId: null },
      })
      const exit = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await exit
      worker = startWorker(filename)
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      assert.deepEqual(await send({ action: 'get-pack', id }), {
        requestId,
        action: 'get-pack',
        result: updated.result,
      })
      const origin = await send({ action: 'get-sample-origin', id: sampleId })
      if (origin.action !== 'get-sample-origin') {
        assert.fail('Expected a Sample origin')
      }
      assert.deepEqual(origin.result, {
        sampleId,
        packId: null,
        originAssignment: 'manual',
      })
      const listed = await send({ action: 'list-packs', input: {} })
      if (listed.action !== 'list-packs') {
        assert.fail('Expected Packs')
      }
      assert.deepEqual(listed.result.items, [updated.result])
      const members = await send({ action: 'list-pack-samples', id, input: {} })
      if (members.action !== 'list-pack-samples') {
        assert.fail('Expected Pack Samples')
      }
      assert.equal(members.result.total, 0)
      const stale = await send({
        action: 'remove-pack',
        input: { id, token: reviewed.result.token },
      })
      if (stale.action !== 'error') {
        assert.fail('Expected stale review rejection')
      }
      assert.equal(stale.failure.code, 'STALE_REVIEW')
      const fresh = await send({ action: 'review-pack-removal', id })
      if (fresh.action !== 'review-pack-removal') {
        assert.fail('Expected a fresh review')
      }
      assert.deepEqual(
        await send({
          action: 'remove-pack',
          input: { id, token: fresh.result.token },
        }),
        { requestId, action: 'remove-pack', result: { id } },
      )
      const closed = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await closed
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'worker confirms readiness, serializes writes, drains on close and restores Preferences',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-'))
    const filename = path.join(dir, 'library', 'library.sqlite')
    let worker = startWorker(filename)
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const initial = await exchange(worker, {
        requestId: 1,
        action: 'profile',
      })
      assert.equal(initial.action, 'profile')
      if (initial.action !== 'profile') {
        assert.fail('Expected a profile')
      }
      const profileId = initial.result.profile.id
      const responses: DbReply[] = []
      worker.on('message', (value: unknown) => {
        assert.ok(isDbReply(value))
        responses.push(value)
      })
      const exit = once(worker, 'exit')
      worker.postMessage({
        requestId: 2,
        action: 'volume',
        volume: 0.5,
      } satisfies DbRequest)
      worker.postMessage({
        requestId: 3,
        action: 'volume',
        volume: 0,
      } satisfies DbRequest)
      worker.postMessage({ requestId: 4, action: 'close' } satisfies DbRequest)
      assert.equal((await exit)[0], 0)
      assert.deepEqual(responses, [
        {
          requestId: 2,
          action: 'volume',
          result: { profileId, previewVolume: 0.5 },
        },
        {
          requestId: 3,
          action: 'volume',
          result: { profileId, previewVolume: 0 },
        },
        { requestId: 4, action: 'close' },
      ])
      worker = startWorker(filename)
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const reopened = await exchange(worker, {
        requestId: 1,
        action: 'profile',
      })
      assert.equal(reopened.action, 'profile')
      if (reopened.action !== 'profile') {
        assert.fail('Expected a profile')
      }
      assert.equal(reopened.result.profile.id, profileId)
      assert.equal(reopened.result.preferences.previewVolume, 0)
      const closed = once(worker, 'exit')
      assert.deepEqual(
        await exchange(worker, { requestId: 2, action: 'close' }),
        {
          requestId: 2,
          action: 'close',
        },
      )
      await closed
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'Collection worker commands preserve ordered memberships and reviews across restart',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-collections-'))
    const filename = path.join(dir, 'kiter.sqlite')
    let worker = startWorker(filename)
    let requestId = 0
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const created = await exchange(worker, {
        requestId: ++requestId,
        action: 'create-collection',
        input: { name: ' Selection ' },
      })
      if (created.action !== 'create-collection') {
        assert.fail('Expected a Collection')
      }
      const id = created.result.id
      const updated = await exchange(worker, {
        requestId: ++requestId,
        action: 'update-collection',
        input: { id, name: 'Edited', description: 'Notes\nSecond line' },
      })
      if (updated.action !== 'update-collection') {
        assert.fail('Expected an updated Collection')
      }
      const imported = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: ['kick.wav', 'snare.wav'].map((name) => ({
          name,
          path: path.join(dir, name),
          relativePath: name,
          observedSizeBytes: 100,
          observedMtimeMs: 1000,
        })),
      })
      if (imported.action !== 'import') {
        assert.fail('Expected imported Samples')
      }
      const sampleIds = imported.result.map((sample) => sample.id)
      for (const sampleId of sampleIds) {
        assert.deepEqual(
          await exchange(worker, {
            requestId: ++requestId,
            action: 'set-collection-membership',
            input: { collectionId: id, sampleId, assigned: true },
          }),
          {
            requestId,
            action: 'set-collection-membership',
            result: { assigned: true },
          },
        )
      }
      const reviewed = await exchange(worker, {
        requestId: ++requestId,
        action: 'review-collection-removal',
        id,
      })
      if (reviewed.action !== 'review-collection-removal') {
        assert.fail('Expected a Collection review')
      }
      const invalid = await exchange(worker, {
        requestId: ++requestId,
        action: 'reorder-collection',
        input: { collectionId: id, sampleIds: sampleIds.slice(1) },
      })
      if (invalid.action !== 'error') {
        assert.fail('Expected an invalid sequence failure')
      }
      assert.equal(invalid.failure.code, 'INVALID_INPUT')
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'reorder-collection',
          input: { collectionId: id, sampleIds: sampleIds.toReversed() },
        }),
        { requestId, action: 'reorder-collection', result: { id } },
      )
      const stale = await exchange(worker, {
        requestId: ++requestId,
        action: 'remove-collection',
        input: { id, token: reviewed.result.token },
      })
      if (stale.action !== 'error') {
        assert.fail('Expected a stale review failure')
      }
      assert.equal(stale.failure.code, 'STALE_REVIEW')
      const fresh = await exchange(worker, {
        requestId: ++requestId,
        action: 'review-collection-removal',
        id,
      })
      if (fresh.action !== 'review-collection-removal') {
        assert.fail('Expected a fresh Collection review')
      }
      const exited = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await exited
      worker = startWorker(filename)
      const ready = await new Promise<unknown>((resolve, reject) => {
        worker.once('error', reject)
        worker.once('message', (message: unknown) => {
          worker.off('error', reject)
          resolve(message)
        })
      })
      assert.deepEqual(ready, { action: 'ready' })
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'get-collection',
          id,
        }),
        { requestId, action: 'get-collection', result: updated.result },
      )
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'list-collections',
          input: {},
        }),
        {
          requestId,
          action: 'list-collections',
          result: { items: [updated.result], total: 1, limit: 50, offset: 0 },
        },
      )
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'list-collection-samples',
          id,
          input: { limit: 1, offset: 1 },
        }),
        {
          requestId,
          action: 'list-collection-samples',
          result: {
            items: [{ collectionId: id, sampleId: sampleIds[0], position: 1 }],
            total: 2,
            limit: 1,
            offset: 1,
          },
        },
      )
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'review-collection-removal',
          id,
        }),
        {
          requestId,
          action: 'review-collection-removal',
          result: fresh.result,
        },
      )
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'remove-collection',
          input: { id, token: fresh.result.token },
        }),
        { requestId, action: 'remove-collection', result: { id } },
      )
      const reimported = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: imported.result.map((sample) => ({
          name: sample.name,
          path: sample.path,
          relativePath: sample.relativePath,
          observedSizeBytes: 100,
          observedMtimeMs: 1000,
        })),
      })
      if (reimported.action !== 'import') {
        assert.fail('Expected retained Samples')
      }
      assert.deepEqual(reimported.result, imported.result)
      const closed = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await closed
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'classification worker dispatch preserves identities, controlled conflicts and removal reviews across restart',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(
      path.join(tmpdir(), 'kiter-worker-classification-'),
    )
    const filename = path.join(dir, 'kiter.sqlite')
    let worker = startWorker(filename)
    let requestId = 0
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const author = await exchange(worker, {
        requestId: ++requestId,
        action: 'create-author',
        input: { name: ' Producer ' },
      })
      if (author.action !== 'create-author') {
        assert.fail('Expected an Author')
      }
      const category = await exchange(worker, {
        requestId: ++requestId,
        action: 'create-category',
        input: { name: 'Drums' },
      })
      if (category.action !== 'create-category') {
        assert.fail('Expected a Category')
      }
      const conflict = await exchange(worker, {
        requestId: ++requestId,
        action: 'create-category',
        input: { name: 'DRUMS' },
      })
      if (conflict.action !== 'error') {
        assert.fail('Expected a name conflict')
      }
      assert.equal(conflict.failure.code, 'NAME_CONFLICT')
      assert.ok(!conflict.failure.message.includes(dir))
      for (const [action, id, name] of [
        ['rename-author', author.result.id, 'Artist'],
        ['rename-category', category.result.id, 'Percussion'],
      ] as const) {
        const renamed = await exchange(worker, {
          requestId: ++requestId,
          action,
          input: { id, name },
        })
        assert.deepEqual(renamed, { requestId, action, result: { id, name } })
      }
      for (const [action, id, name] of [
        ['get-author', author.result.id, 'Artist'],
        ['get-category', category.result.id, 'Percussion'],
      ] as const) {
        assert.deepEqual(
          await exchange(worker, { requestId: ++requestId, action, id }),
          {
            requestId,
            action,
            result: { id, name },
          },
        )
      }
      const imported = await exchange(worker, {
        requestId: ++requestId,
        action: 'import',
        root: dir,
        files: [
          {
            name: 'kick.wav',
            path: path.join(dir, 'kick.wav'),
            relativePath: 'kick.wav',
            observedSizeBytes: 100,
            observedMtimeMs: 1000,
          },
        ],
      })
      if (imported.action !== 'import') {
        assert.fail('Expected imported Samples')
      }
      const target = { kind: 'sample' as const, id: imported.result[0].id }
      for (const [action, id] of [
        ['set-author-assignment', author.result.id],
        ['set-category-assignment', category.result.id],
      ] as const) {
        assert.deepEqual(
          await exchange(worker, {
            requestId: ++requestId,
            action,
            input: { id, target, assigned: true },
          }),
          { requestId, action, result: { assigned: true } },
        )
      }
      for (const [action, id] of [
        ['list-author-uses', author.result.id],
        ['list-category-uses', category.result.id],
      ] as const) {
        assert.deepEqual(
          await exchange(worker, {
            requestId: ++requestId,
            action,
            input: { id, kind: 'sample' },
          }),
          {
            requestId,
            action,
            result: {
              items: [{ id: target.id, name: 'kick.wav' }],
              total: 1,
              limit: 50,
              offset: 0,
            },
          },
        )
      }
      for (const [action, id, name] of [
        ['list-target-authors', author.result.id, 'Artist'],
        ['list-target-categories', category.result.id, 'Percussion'],
      ] as const) {
        assert.deepEqual(
          await exchange(worker, {
            requestId: ++requestId,
            action,
            target,
            input: {},
          }),
          {
            requestId,
            action,
            result: { items: [{ id, name }], total: 1, limit: 50, offset: 0 },
          },
        )
      }
      const authorReview = await exchange(worker, {
        requestId: ++requestId,
        action: 'review-author-removal',
        id: author.result.id,
      })
      if (authorReview.action !== 'review-author-removal') {
        assert.fail('Expected an Author removal review')
      }
      assert.equal(authorReview.result.sampleCount, 1)
      const categoryReview = await exchange(worker, {
        requestId: ++requestId,
        action: 'review-category-removal',
        id: category.result.id,
      })
      if (categoryReview.action !== 'review-category-removal') {
        assert.fail('Expected a Category removal review')
      }
      await exchange(worker, {
        requestId: ++requestId,
        action: 'set-category-assignment',
        input: { id: category.result.id, target, assigned: false },
      })
      const stale = await exchange(worker, {
        requestId: ++requestId,
        action: 'remove-category',
        input: { id: category.result.id, token: categoryReview.result.token },
      })
      if (stale.action !== 'error') {
        assert.fail('Expected stale removal review')
      }
      assert.equal(stale.failure.code, 'STALE_REVIEW')
      const exit = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      await exit
      worker = startWorker(filename)
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      for (const [action, entity] of [
        ['list-authors', { id: author.result.id, name: 'Artist' }],
        ['list-categories', { id: category.result.id, name: 'Percussion' }],
      ] as const) {
        assert.deepEqual(
          await exchange(worker, {
            requestId: ++requestId,
            action,
            input: { search: entity.name.toUpperCase() },
          }),
          {
            requestId,
            action,
            result: { items: [entity], total: 1, limit: 50, offset: 0 },
          },
        )
      }
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'remove-author',
          input: { id: author.result.id, token: authorReview.result.token },
        }),
        {
          requestId,
          action: 'remove-author',
          result: { id: author.result.id },
        },
      )
      const current = await exchange(worker, {
        requestId: ++requestId,
        action: 'review-category-removal',
        id: category.result.id,
      })
      if (current.action !== 'review-category-removal') {
        assert.fail('Expected an updated removal review')
      }
      assert.deepEqual(
        await exchange(worker, {
          requestId: ++requestId,
          action: 'remove-category',
          input: { id: category.result.id, token: current.result.token },
        }),
        {
          requestId,
          action: 'remove-category',
          result: { id: category.result.id },
        },
      )
      const closed = once(worker, 'exit')
      await exchange(worker, { requestId: ++requestId, action: 'close' })
      assert.equal((await closed)[0], 0)
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'missing migration assets block worker readiness instead of creating a fallback database',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-assets-'))
    const worker = startWorker(
      path.join(dir, 'kiter.sqlite'),
      path.join(dir, 'missing-assets'),
    )
    try {
      const exit = once(worker, 'exit')
      const [reply] = await once(worker, 'message')
      assert.ok(isDbReply(reply))
      assert.equal(reply.action, 'fatal')
      if (reply.action !== 'fatal') {
        assert.fail('Expected a startup failure')
      }
      assert.equal(reply.failure.code, 'STORAGE_FAILED')
      assert.ok(!reply.failure.message.includes(dir))
      await exit
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)

test(
  'worker startup failures are explicit and preserve the invalid file',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-failure-'))
    const filename = path.join(dir, 'library.sqlite')
    const contents = Buffer.from('invalid database')
    await writeFile(filename, contents)
    const worker = startWorker(filename)
    try {
      const exit = once(worker, 'exit')
      const [reply] = await once(worker, 'message')
      assert.ok(isDbReply(reply))
      assert.equal(reply.action, 'fatal')
      if (reply.action !== 'fatal') {
        assert.fail('Expected a startup failure')
      }
      assert.equal(reply.failure.code, 'STORAGE_FAILED')
      assert.ok(!reply.failure.message.includes(dir))
      await exit
      assert.deepEqual(await readFile(filename), contents)
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  },
)
