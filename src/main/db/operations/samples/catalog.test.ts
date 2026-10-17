import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { setFavorite } from './favorites.ts'
import { updateSample } from './operations.ts'
import { listCatalogSamples, getCatalogSample } from './catalog.ts'

test('catalog pages include all roots once, honor presentation names and filter Favorites', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('catalog-fixture')
  const nested = path.join(root, 'nested')
  const files = ['zebra.wav', 'alpha.wav', 'nested/kick.wav'].map((name) =>
    makeDiscoveredAudioFile(root, name),
  )
  const imported = importFolder(db, root, files)
  importFolder(db, nested, [files[2]])
  const kick = imported.find((item) => item.path === files[2].path)!
  setFavorite(db, kick.id, true)
  updateSample(db, { id: kick.id, displayName: 'A custom name' })
  const first = listCatalogSamples(db, { limit: 2 })
  assert.equal(first.total, 3)
  assert.deepEqual(
    first.items.map((item) => item.name),
    ['A custom name', 'alpha.wav'],
  )
  assert.equal(
    listCatalogSamples(db, { limit: 2, offset: 2 }).items[0].name,
    'zebra.wav',
  )
  assert.deepEqual(
    listCatalogSamples(db, { favoritesOnly: true }).items.map(
      (item) => item.id,
    ),
    [kick.id],
  )
  assert.equal(getCatalogSample(db, kick.id).path, files[2].path)
  assert.throws(() => listCatalogSamples(db, { limit: 101 }))
})
