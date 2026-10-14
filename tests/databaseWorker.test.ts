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
  migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
): Worker {
  return new Worker(new URL('../src/main/db/worker.ts', import.meta.url), {
    workerData: {
      filename,
      migrationsFolder
    }
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
  'worker confirms readiness, serializes writes, drains on close and restores Preferences',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-'))
    const filename = path.join(dir, 'library', 'library.sqlite')
    let worker = startWorker(filename)
    try {
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const initial = await exchange(worker, { requestId: 1, action: 'profile' })
      assert.equal(initial.action, 'profile')
      if (initial.action !== 'profile') assert.fail('Expected a profile')
      const profileId = initial.result.profile.id
      const responses: DbReply[] = []
      worker.on('message', (value: unknown) => {
        assert.ok(isDbReply(value))
        responses.push(value)
      })
      const exit = once(worker, 'exit')
      worker.postMessage({ requestId: 2, action: 'volume', volume: 0.5 } satisfies DbRequest)
      worker.postMessage({ requestId: 3, action: 'volume', volume: 0 } satisfies DbRequest)
      worker.postMessage({ requestId: 4, action: 'close' } satisfies DbRequest)
      assert.equal((await exit)[0], 0)
      assert.deepEqual(responses, [
        { requestId: 2, action: 'volume', result: { profileId, previewVolume: 0.5 } },
        { requestId: 3, action: 'volume', result: { profileId, previewVolume: 0 } },
        { requestId: 4, action: 'close' }
      ])
      worker = startWorker(filename)
      assert.deepEqual((await once(worker, 'message'))[0], { action: 'ready' })
      const reopened = await exchange(worker, { requestId: 1, action: 'profile' })
      assert.equal(reopened.action, 'profile')
      if (reopened.action !== 'profile') assert.fail('Expected a profile')
      assert.equal(reopened.result.profile.id, profileId)
      assert.equal(reopened.result.preferences.previewVolume, 0)
      const closed = once(worker, 'exit')
      assert.deepEqual(await exchange(worker, { requestId: 2, action: 'close' }), {
        requestId: 2,
        action: 'close'
      })
      await closed
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  }
)

test(
  'missing migration assets block worker readiness instead of creating a fallback database',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiter-worker-assets-'))
    const worker = startWorker(path.join(dir, 'kiter.sqlite'), path.join(dir, 'missing-assets'))
    try {
      const exit = once(worker, 'exit')
      const [reply] = await once(worker, 'message')
      assert.ok(isDbReply(reply))
      assert.equal(reply.action, 'fatal')
      if (reply.action !== 'fatal') assert.fail('Expected a startup failure')
      assert.equal(reply.failure.code, 'STORAGE_FAILED')
      assert.ok(!reply.failure.message.includes(dir))
      await exit
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  }
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
      if (reply.action !== 'fatal') assert.fail('Expected a startup failure')
      assert.equal(reply.failure.code, 'STORAGE_FAILED')
      assert.ok(!reply.failure.message.includes(dir))
      await exit
      assert.deepEqual(await readFile(filename), contents)
    } finally {
      await worker.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  }
)
