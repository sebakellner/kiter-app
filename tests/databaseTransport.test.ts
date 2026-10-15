import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { WorkerTransport } from '../src/main/db/client/worker-transport.ts'

const location = {
  workerPath: new URL('../src/main/db/worker/entry.ts', import.meta.url),
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
}

test(
  'transport correlates concurrent replies, drains writes, rejects work during close and preserves data on reopen',
  { timeout: 15000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'kiter-transport-'))
    const filename = path.join(directory, 'catalog.sqlite')
    let transport = await WorkerTransport.open(filename, location)
    try {
      const commands = [
        transport.request({
          action: 'create-author',
          input: { name: 'Artist' },
        }),
        transport.request({
          action: 'create-collection',
          input: { name: 'Selection' },
        }),
        transport.request({ action: 'volume', volume: 0 }),
      ]
      const closing = transport.close()
      const closingAgain = transport.close()
      assert.throws(() => transport.request({ action: 'profile' }), {
        code: 'CLOSING',
      })
      const replies = await Promise.all(commands)
      assert.deepEqual(
        replies.map((reply) => reply.action),
        ['create-author', 'create-collection', 'volume'],
      )
      await Promise.all([closing, closingAgain])
      transport = await WorkerTransport.open(filename, location)
      const profile = await transport.request({ action: 'profile' })
      assert.equal(profile.action, 'profile')
      if (profile.action !== 'profile') {
        assert.fail('Expected profile reply')
      }
      assert.equal(profile.result.preferences.previewVolume, 0)
      const authors = await transport.request({
        action: 'list-authors',
        input: {},
      })
      assert.equal(authors.action, 'list-authors')
      if (authors.action !== 'list-authors') {
        assert.fail('Expected Authors reply')
      }
      assert.equal(authors.result.items[0].name, 'Artist')
    } finally {
      await transport.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test(
  'transport propagates startup and protocol failures without leaving pending requests',
  { timeout: 15000 },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'kiter-transport-failure-'),
    )
    try {
      await assert.rejects(
        WorkerTransport.open(path.join(directory, 'missing.sqlite'), {
          ...location,
          migrationsFolder: path.join(directory, 'missing-migrations'),
        }),
        { code: 'STORAGE_FAILED' },
      )
      const transport = await WorkerTransport.open(
        path.join(directory, 'catalog.sqlite'),
        location,
      )
      const invalid = transport.request({ action: 'volume', volume: NaN })
      const pending = transport.request({ action: 'profile' })
      await Promise.all([
        assert.rejects(invalid, { code: 'PROTOCOL_ERROR' }),
        assert.rejects(pending, { code: 'PROTOCOL_ERROR' }),
      ])
      await assert.rejects(transport.request({ action: 'profile' }), {
        code: 'PROTOCOL_ERROR',
      })
      await assert.rejects(transport.close(), { code: 'PROTOCOL_ERROR' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
