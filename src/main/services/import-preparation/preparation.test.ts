import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
  chmod,
  stat,
} from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { createTemporaryDirectory } from '../../../../tests/support/filesystem/temporary-directory.ts'
import { createMemoryDatabase } from '../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../tests/support/fixtures/source.ts'
import { readImportCatalog } from '../../db/operations/sources/import-snapshot.ts'
import { importFolder } from '../../db/operations/sources/import.ts'
import {
  setSampleOrigin,
  getPackSourceRoot,
  reviewPackImport,
  importPack,
} from '../../db/operations/packs/operations.ts'
import { setFavorite } from '../../db/operations/samples/favorites.ts'
import { sourceRoots, excludedSources } from '../../db/schema/sources.ts'
import { ImportPreparationService } from './preparation.ts'
import type { PreparationCandidate } from './types.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { PreparationSpool } from './spool.ts'

test('preparing and discarding observes catalog organization without writing catalog or audio', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-preparation')
  const { db, native } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const spool = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(spool)
  const names = ['pack.wav', 'manual.wav', 'excluded.wav', 'new.WAV']
  for (const name of names) {
    await writeFile(path.join(root, name), `unchanged ${name}`)
  }
  const imported = importFolder(
    db,
    root,
    names.slice(0, 2).map((name) => makeDiscoveredAudioFile(root, name)),
  )
  const { id } = getPackSourceRoot(db, root)
  const review = reviewPackImport(db, id)
  const pack = importPack(db, {
    sourceRootId: id,
    name: 'Custom Pack',
    decisions: [],
    token: review.token,
  })
  setSampleOrigin(db, { sampleId: imported[1].id, packId: null })
  setFavorite(db, imported[1].id, true)
  db.insert(excludedSources)
    .values({ canonicalPath: path.join(root, 'excluded.wav') })
    .run()
  const before = native.serialize()
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    spool,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root])
  assert.equal(preparation.state, 'ready')
  assert.equal(preparation.candidateCount, 4)
  assert.equal(preparation.roots[0].catalog?.pack?.id, pack.id)
  const page = await service.listCandidates({
    preparationId: preparation.id,
    revision: 1,
  })
  const byName = new Map(page.items.map((item) => [item.file.name, item]))
  assert.equal(byName.get('pack.wav')?.catalog.sample?.packId, pack.id)
  assert.equal(
    byName.get('manual.wav')?.catalog.sample?.originAssignment,
    'manual',
  )
  assert.equal(byName.get('manual.wav')?.catalog.sample?.packId, null)
  assert.equal(byName.get('excluded.wav')?.catalog.excluded, true)
  assert.equal(byName.get('new.WAV')?.catalog.sample, null)
  assert.deepEqual(native.serialize(), before)
  for (const name of names) {
    assert.equal(
      await readFile(path.join(root, name), 'utf8'),
      `unchanged ${name}`,
    )
  }
  assert.ok((await readdir(spool)).length > 0)
  await assert.rejects(service.discard(preparation.id, 2), {
    code: 'STALE_REVIEW',
  })
  await service.discard(preparation.id, 1)
  assert.deepEqual(await readdir(spool), [])
  assert.deepEqual(native.serialize(), before)
  assert.throws(() => service.get(preparation.id), { code: 'NOT_FOUND' })
})

test('overlapping roots deduplicate candidates and preserve all occurrences through pinned pages', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-pages')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const nested = path.join(root, 'nested')
  await mkdir(nested, { recursive: true })
  for (let i = 0; i < 103; i++) {
    await writeFile(path.join(nested, `${i}.wav`), '')
  }
  await writeFile(path.join(root, '0.wav'), 'separate source')
  await writeFile(path.join(root, 'notes.txt'), 'ignored')
  const sizes: number[] = []
  const service = new ImportPreparationService(
    {
      readImportCatalog: async (input) => {
        sizes.push(input.paths.length)
        return readImportCatalog(db, input)
      },
    },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root, nested, root])
  assert.equal(preparation.roots.length, 2)
  assert.equal(preparation.candidateCount, 104)
  assert.deepEqual(
    preparation.roots.map((root) => root.discoveredCount),
    [104, 103],
  )
  const items: PreparationCandidate[] = []
  let cursor: string | undefined
  do {
    const page = await service.listCandidates({
      preparationId: preparation.id,
      revision: 1,
      cursor,
    })
    assert.ok(page.items.length <= 50)
    items.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  assert.equal(new Set(items.map((item) => item.id)).size, 104)
  assert.equal(
    items.filter((item) => item.occurrences.length === 2).length,
    103,
  )
  assert.equal(items.filter((item) => item.file.name === '0.wav').length, 2)
  assert.ok(sizes.every((size) => size <= 100))
  const first = await service.listCandidates({
    preparationId: preparation.id,
    revision: 1,
  })
  first.items[0].file.name = 'renderer mutation'
  assert.notEqual(
    (
      await service.listCandidates({
        preparationId: preparation.id,
        revision: 1,
      })
    ).items[0].file.name,
    'renderer mutation',
  )
  preparation.roots.length = 0
  assert.equal(service.get(preparation.id).roots.length, 2)
  await assert.rejects(
    service.listCandidates({ preparationId: preparation.id, revision: 2 }),
    { code: 'STALE_REVIEW' },
  )
  await assert.rejects(
    service.listCandidates({
      preparationId: preparation.id,
      revision: 1,
      limit: 101,
    }),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(
    service.listCandidates({
      preparationId: preparation.id,
      revision: 1,
      cursor: '../invalid',
    }),
    { code: 'INVALID_INPUT' },
  )
  await assert.rejects(service.prepare([root]), { code: 'INVALID_INPUT' })
  await service.discard(preparation.id, 1)
  const next = await service.prepare([root])
  assert.notEqual(next.id, preparation.id)
  assert.ok(first.nextCursor)
  await assert.rejects(
    service.listCandidates({
      preparationId: next.id,
      revision: 1,
      cursor: first.nextCursor,
    }),
    { code: 'STALE_REVIEW' },
  )
  await service.close()
  await assert.rejects(service.prepare([root]), { code: 'CLOSING' })
})

test('missing and inactive roots are blocked without registration or reactivation', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-blocked')
  const { db, native } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  await mkdir(root)
  await writeFile(path.join(root, 'source.wav'), '')
  importFolder(db, root, [])
  const { id } = getPackSourceRoot(db, root)
  db.update(sourceRoots)
    .set({ registered: false })
    .where(eq(sourceRoots.id, id))
    .run()
  const before = native.serialize()
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([
    root,
    path.join(temporary.path, 'missing'),
  ])
  assert.equal(preparation.state, 'blocked')
  assert.equal(preparation.roots[0].issues[0].code, 'REGISTRATION_INACTIVE')
  assert.equal(preparation.roots[1].issues[0].code, 'UNSAFE_LOCATION')
  assert.equal(preparation.candidateCount, 1)
  assert.deepEqual(native.serialize(), before)
})

test('symlink files and cycles are skipped, while selected symlink roots are blocked', async (t) => {
  if (process.platform === 'win32') {
    t.skip(
      'Symlink creation requires Windows privileges; validate separately on Windows.',
    )
    return
  }
  const temporary = await createTemporaryDirectory(t, 'import-links')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  await mkdir(root)
  await writeFile(path.join(root, 'source.wav'), '')
  await symlink(root, path.join(root, 'cycle'))
  await symlink(path.join(root, 'source.wav'), path.join(root, 'linked.wav'))
  const linked = path.join(temporary.path, 'linked-root')
  await symlink(root, linked)
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root, linked])
  assert.equal(preparation.candidateCount, 1)
  assert.equal(preparation.roots[0].skippedSymlinks, 2)
  assert.equal(preparation.roots[0].state, 'completed')
  assert.equal(preparation.roots[1].state, 'blocked')
})

test('unreadable subfolders block incomplete discovery but preserve inspectable candidates', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires POSIX permissions and a non-root user.')
    return
  }
  const temporary = await createTemporaryDirectory(t, 'import-permissions')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const blocked = path.join(root, 'blocked')
  await mkdir(blocked, { recursive: true })
  await writeFile(path.join(root, 'readable.wav'), '')
  await chmod(blocked, 0)
  temporary.beforeRemove(() => chmod(blocked, 0o700))
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root])
  assert.equal(preparation.state, 'blocked')
  assert.equal(preparation.candidateCount, 1)
  assert.ok(
    preparation.roots[0].issues.some(
      (issue) =>
        issue.relativePath === 'blocked' && issue.code === 'SOURCE_UNREADABLE',
    ),
  )
})

test('catalog failures clean temporary resources and are not returned as successful empty preparations', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-failure')
  const root = path.join(temporary.path, 'audio')
  const spool = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(spool)
  const failure = Object.assign(new Error(`Catalog read failed: ${root}`), {
    code: `untrusted-code:${root}`,
  })
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  const service = new ImportPreparationService(
    {
      readImportCatalog: async () => {
        throw failure
      },
    },
    spool,
  )
  temporary.beforeRemove(() => service.close())
  await assert.rejects(service.prepare([root]), (error: unknown) => {
    assert.ok(error instanceof IpcError)
    assert.equal(error.code, 'STORAGE_FAILED')
    assert.equal(error.cause, failure)
    assert.ok(!JSON.stringify(error).includes(root))
    return true
  })
  assert.deepEqual(
    diagnostics.mock.calls.map((call) => call.arguments),
    [['Import preparation failed:', 'prepare', 'UNEXPECTED_ERROR']],
  )
  assert.deepEqual(await readdir(spool), [])
  await assert.rejects(service.prepare([]), { code: 'INVALID_INPUT' })
})

test('combined preparation and cleanup failure preserves both causes and permits cleanup retry', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-combined-failure')
  const root = path.join(temporary.path, 'audio')
  const parent = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(parent)
  const original = new IpcError('WORKER_FAILED', `Catalog failed: ${root}`)
  const cleanupFailure = Object.assign(new Error(`Cleanup failed: ${parent}`), {
    code: 'EACCES',
  })
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  const dispose = PreparationSpool.prototype.dispose
  let allowCleanup = false
  t.mock.method(
    PreparationSpool.prototype,
    'dispose',
    async function (this: PreparationSpool): Promise<void> {
      if (!allowCleanup) {
        throw cleanupFailure
      }
      await dispose.call(this)
    },
  )
  const service = new ImportPreparationService(
    {
      readImportCatalog: async () => {
        throw original
      },
    },
    parent,
  )
  temporary.beforeRemove(async () => {
    allowCleanup = true
    await service.close()
  })
  await assert.rejects(service.prepare([root]), (error: unknown) => {
    assert.ok(error instanceof IpcError)
    assert.equal(error.code, 'STORAGE_FAILED')
    assert.ok(error.cause instanceof AggregateError)
    assert.equal(error.cause.errors[0], original)
    const cleanup = error.cause.errors[1]
    assert.ok(cleanup instanceof IpcError)
    assert.equal(cleanup.cause, cleanupFailure)
    assert.ok(!error.message.includes(temporary.path))
    assert.ok(!JSON.stringify(error).includes(temporary.path))
    return true
  })
  assert.deepEqual(
    diagnostics.mock.calls.map((call) => call.arguments),
    [
      ['Import preparation failed:', 'cleanup', 'EACCES'],
      ['Import preparation failed:', 'build', 'WORKER_FAILED'],
    ],
  )
  assert.equal((await readdir(parent)).length, 1)
  await assert.rejects(service.prepare([root]), { code: 'INVALID_INPUT' })
  allowCleanup = true
  await service.close()
  assert.deepEqual(await readdir(parent), [])
})

test('close drains an in-flight preparation and cleans its resources without starting another', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-close')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const spool = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(spool)
  const reached = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const service = new ImportPreparationService(
    {
      readImportCatalog: async (input) => {
        reached.resolve()
        await resume.promise
        return readImportCatalog(db, input)
      },
    },
    spool,
  )
  temporary.beforeRemove(() => service.close())
  const preparing = service.prepare([root])
  await reached.promise
  await assert.rejects(service.prepare([root]), { code: 'INVALID_INPUT' })
  const closing = service.close()
  resume.resolve()
  const preparation = await preparing
  await closing
  assert.deepEqual(await readdir(spool), [])
  assert.throws(() => service.get(preparation.id), { code: 'NOT_FOUND' })
})

test('source changes retain the first observation and require fresh discovery', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-changed')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  const nested = path.join(root, 'nested')
  await mkdir(nested, { recursive: true })
  const location = path.join(nested, 'source.wav')
  await writeFile(location, 'old')
  const initial = await stat(location)
  let changed = false
  const service = new ImportPreparationService(
    {
      readImportCatalog: async (input) => {
        const result = readImportCatalog(db, input)
        if (input.paths.length > 0 && !changed) {
          await writeFile(location, 'a changed observation')
          changed = true
        }
        return result
      },
    },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root, nested])
  assert.equal(preparation.state, 'blocked')
  assert.equal(preparation.candidateCount, 1)
  assert.equal(preparation.roots[1].issues[0].code, 'SOURCE_CHANGED')
  const beforeRescan = await service.listCandidates({
    preparationId: preparation.id,
    revision: 1,
  })
  assert.equal(beforeRescan.items[0].file.observedSizeBytes, initial.size)
  assert.equal(beforeRescan.items[0].file.observedMtimeMs, initial.mtimeMs)
  const current = await stat(location)
  assert.notEqual(current.size, initial.size)
  assert.equal(service.get(preparation.id).state, 'blocked')
  await service.discard(preparation.id, 1)
  const refreshed = await service.prepare([root, nested])
  assert.equal(refreshed.state, 'ready')
  const afterRescan = await service.listCandidates({
    preparationId: refreshed.id,
    revision: 1,
  })
  assert.notEqual(afterRescan.items[0].id, beforeRescan.items[0].id)
  assert.equal(afterRescan.items[0].file.observedSizeBytes, current.size)
  assert.equal(afterRescan.items[0].file.observedMtimeMs, current.mtimeMs)
})

test('depth safety limit blocks discovery instead of reporting truncated success', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-depth')
  const { db } = createMemoryDatabase(t)
  const root = path.join(temporary.path, 'audio')
  await mkdir(path.join(root, ...Array.from({ length: 65 }, () => 'd')), {
    recursive: true,
  })
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    temporary.path,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root])
  assert.equal(preparation.state, 'blocked')
  assert.ok(
    preparation.roots[0].issues.some(
      (issue) => issue.code === 'LIMIT_EXCEEDED',
    ),
  )
})

test('failed discard invalidates reads and remains retryable without exposing paths', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires POSIX permissions and a non-root user.')
    return
  }
  const temporary = await createTemporaryDirectory(t, 'import-cleanup-failure')
  const { db } = createMemoryDatabase(t)
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  const root = path.join(temporary.path, 'audio')
  const parent = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(parent)
  await writeFile(path.join(root, 'source.wav'), '')
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    parent,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root])
  const directory = path.join(parent, (await readdir(parent))[0])
  await chmod(directory, 0o500)
  try {
    await assert.rejects(
      service.discard(preparation.id, 1),
      (error: unknown) => {
        assert.ok(error instanceof Error && 'code' in error)
        assert.equal(error.code, 'STORAGE_FAILED')
        assert.ok(!error.message.includes(temporary.path))
        return true
      },
    )
    assert.throws(() => service.get(preparation.id), { code: 'NOT_FOUND' })
    await assert.rejects(
      service.listCandidates({ preparationId: preparation.id, revision: 1 }),
      { code: 'NOT_FOUND' },
    )
    await assert.rejects(service.prepare([root]), { code: 'INVALID_INPUT' })
    assert.equal(diagnostics.mock.callCount(), 1)
    assert.deepEqual(diagnostics.mock.calls[0].arguments.slice(0, 2), [
      'Import preparation failed:',
      'cleanup',
    ])
    assert.ok(
      ['EACCES', 'EPERM'].includes(diagnostics.mock.calls[0].arguments[2]),
    )
  } finally {
    await chmod(directory, 0o700)
  }
  await service.discard(preparation.id, 1)
  assert.deepEqual(await readdir(parent), [])
})

test('corrupt temporary candidate data fails explicitly instead of returning an empty page', async (t) => {
  const temporary = await createTemporaryDirectory(t, 'import-spool-corruption')
  const { db } = createMemoryDatabase(t)
  const diagnostics = t.mock.method(console, 'error', () => undefined)
  const root = path.join(temporary.path, 'audio')
  const parent = path.join(temporary.path, 'spool')
  await mkdir(root)
  await mkdir(parent)
  await writeFile(path.join(root, 'source.wav'), '')
  const service = new ImportPreparationService(
    { readImportCatalog: async (input) => readImportCatalog(db, input) },
    parent,
  )
  temporary.beforeRemove(() => service.close())
  const preparation = await service.prepare([root])
  const directory = path.join(parent, (await readdir(parent))[0])
  const candidate = (await readdir(directory)).find((file) =>
    file.endsWith('.json'),
  )
  assert.ok(candidate)
  await writeFile(path.join(directory, candidate), '{')
  await assert.rejects(
    service.listCandidates({ preparationId: preparation.id, revision: 1 }),
    { code: 'STORAGE_FAILED' },
  )
  assert.deepEqual(
    diagnostics.mock.calls.map((call) => call.arguments),
    [['Import preparation failed:', 'read-page', 'UNEXPECTED_ERROR']],
  )
  await service.discard(preparation.id, 1)
  assert.deepEqual(await readdir(parent), [])
})
