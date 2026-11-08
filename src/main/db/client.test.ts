import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { DbClient } from './client.ts'
import { WorkerTransport } from './client/worker-transport.ts'
import { DbError } from './errors.ts'

const location = {
  workerPath: new URL('./worker/entry.ts', import.meta.url),
  migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
}

// The client narrows each reply to the action it sent without a per-method
// runtime check, so this pins that every command really returns its own result.
test(
  'client returns the result its own command asked for',
  { timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'kiter-client-'))
    const client = DbClient.fromTransport(
      await WorkerTransport.open(
        path.join(directory, 'catalog.sqlite'),
        location,
      ),
    )
    t.after(async () => {
      await client.close()
      await rm(directory, { recursive: true, force: true })
    })

    const created = await client.createCollection({ name: 'Drums' })
    assert.equal(created.name, 'Drums')
    assert.deepEqual(await client.getCollection(created.id), created)
    // A method wired to a shape-compatible action is caught only here: the
    // summary extends the Collection every other method returns.
    assert.deepEqual(await client.getCollectionSummary(created.id), {
      ...created,
      sampleCount: 0,
    })

    // LocalProfile and UserPreferences both carry `preferences`, so the key set
    // is what separates them if a method ever points at the wrong action.
    const preferences = await client.setPreviewVolume(0.25)
    assert.deepEqual(Object.keys(preferences).sort(), [
      'previewVolume',
      'profileId',
    ])
    assert.equal(preferences.previewVolume, 0.25)

    const profile = await client.getLocalProfile()
    assert.equal(profile.preferences.previewVolume, 0.25)
    assert.equal(typeof profile.profile.name, 'string')

    await assert.rejects(client.getCollection(randomUUID()), (error) => {
      return error instanceof DbError && error.code === 'NOT_FOUND'
    })

    // Shutdown state outranks argument validation.
    await client.close()
    await assert.rejects(client.setPreviewVolume(1.5), (error) => {
      return error instanceof DbError && error.code === 'CLOSING'
    })
  },
)
