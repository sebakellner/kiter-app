import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir, release } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from '@playwright/test'
import { createWav } from '../../support/fixtures/wav.mjs'

assert.equal(
  process.platform,
  'darwin',
  'This packaged smoke runner currently targets macOS',
)
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const asar = builderRequire('@electron/asar')
const source = path.resolve(process.argv[2] ?? 'dist/mac-arm64/my-app.app')
const directory = await mkdtemp(path.join(tmpdir(), 'kiter-packaged-recovery-'))
let application
const errors = []
try {
  const bundle = path.join(directory, 'Kiter Smoke.app')
  await cp(source, bundle, { recursive: true, verbatimSymlinks: true })
  const resources = path.join(bundle, 'Contents/Resources')
  const archive = path.join(resources, 'app.asar')
  const extracted = path.join(directory, 'archive')
  asar.extractAll(archive, extracted)
  const originalWorker = createHash('sha256')
    .update(await readFile(path.join(extracted, 'out/main/dbWorker.js')))
    .digest('hex')
  const metadata = JSON.parse(
    await readFile(path.join(extracted, 'package.json'), 'utf8'),
  )
  metadata.main = 'packaged-recovery-entry.mjs'
  await writeFile(
    path.join(extracted, 'package.json'),
    JSON.stringify(metadata),
  )
  await cp(
    fileURLToPath(new URL('./packaged-recovery-entry.mjs', import.meta.url)),
    path.join(extracted, metadata.main),
  )
  const repack = async () => {
    await asar.createPackageWithOptions(extracted, archive, {
      unpack: '**/*.node',
    })
  }
  await repack()
  const data = path.join(directory, 'data')
  const samples = path.join(directory, 'samples')
  await mkdir(data)
  await mkdir(samples)
  const audio = createWav(4)
  await writeFile(path.join(samples, 'kick.wav'), audio)
  const executablePath = path.join(bundle, 'Contents/MacOS/my-app')
  const start = async (extra = {}) => {
    const stderr = []
    application = await _electron.launch({
      executablePath,
      cwd: directory,
      env: { ...process.env, KITER_PACKAGED_SMOKE_DATA: data, ...extra },
      timeout: 30000,
    })
    application.process().stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr.push(text)
      if (
        /UnhandledPromiseRejection|Database shutdown failed|Application database startup failed/.test(
          text,
        )
      ) {
        errors.push(text)
      }
    })
    application.context().on('page', (page) => {
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text())
        }
      })
    })
    try {
      return await application.firstWindow()
    } catch (cause) {
      throw new Error(`Packaged startup failed: ${stderr.join('')}`, { cause })
    }
  }
  const stop = async () => {
    await application.close()
    application = undefined
  }
  const page = await start()
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true)
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor()
  await application.evaluate((_, selected) => {
    globalThis.packagedSmoke.selection = selected
  }, samples)
  await page.getByRole('button', { name: 'Open folder', exact: true }).click()
  await page.getByTestId('sample-name').waitFor()
  const identity = await page
    .locator('[data-sample-id]')
    .getAttribute('data-sample-id')
  await page.getByTestId('favorite-toggle').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid=favorite-toggle]')
        .getAttribute('aria-pressed') === 'true',
  )
  await page.waitForFunction(
    () => !document.querySelector('canvas[role=img]').hidden,
  )
  await page.locator('audio').evaluate((audio) => {
    audio.muted = true
  })
  await page.getByTestId('preview-toggle').click()
  await page.waitForFunction(
    () => document.querySelector('audio').currentTime > 0.05,
  )
  await stop()
  console.log(
    'PASS: packaged ASAR/native startup, import, Favorite, waveform and playback',
  )

  // Append a synthetic upgrade only to the disposable test artifact. The shipped
  // initial migration and all production JS/native binaries remain unchanged.
  const migrations = path.join(extracted, 'out/main/migrations')
  const journalPath = path.join(migrations, 'meta/_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  journal.entries.push({
    idx: 1,
    version: '6',
    when: journal.entries[0].when + 1,
    tag: '0001_smoke',
    breakpoints: true,
  })
  await writeFile(journalPath, JSON.stringify(journal))
  await writeFile(
    path.join(migrations, '0001_smoke.sql'),
    'CREATE INDEX smoke_upgrade ON samples(notes);',
  )
  await repack()
  await start()
  await application
    .firstWindow()
    .then((window) =>
      window
        .getByRole('button', { name: 'Open folder', exact: true })
        .waitFor(),
    )
  await stop()
  const backupRoot = path.join(data, 'db/backups')
  const backups = await readdir(backupRoot)
  assert.equal(backups.length, 1)
  const backup = path.join(backupRoot, backups[0])
  const manifest = JSON.parse(
    await readFile(path.join(backup, 'manifest.json'), 'utf8'),
  )
  assert.equal(manifest.kind, 'pre-migration')
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(backup, 'catalog.sqlite')))
      .digest('hex'),
    manifest.catalog.sha256,
  )
  console.log(
    'PASS: packaged worker creates verified protective backup before upgrade',
  )

  await start({ KITER_PACKAGED_SMOKE_INSPECT: '1' })
  await application.evaluate(async (_, id) => {
    await globalThis.packagedSmoke.request([
      { action: 'favorite', id, favorite: false },
    ])
  }, identity)
  await stop()
  // Force a recoverable migration failure, which opens the real startup recovery
  // flow; native dialogs are answered by the test-only bootstrap.
  journal.entries.push({
    idx: 2,
    version: '6',
    when: journal.entries[1].when + 1,
    tag: '0002_smoke',
    breakpoints: true,
  })
  await writeFile(journalPath, JSON.stringify(journal))
  await writeFile(
    path.join(migrations, '0002_smoke.sql'),
    `
    CREATE TEMP TABLE smoke_gate(value INTEGER CHECK(value = 1));
    INSERT INTO smoke_gate SELECT favorite FROM samples;
    DROP TABLE smoke_gate;
  `,
  )
  // First trigger startup backup failure by occupying its managed directory.
  // Keep existing backups intact in another fixture-owned location.
  const retained = path.join(data, 'db/retained-backups')
  await rename(backupRoot, retained)
  await writeFile(backupRoot, 'blocked backup destination')
  // The recovery bootstrap first selects an alternate writable destination.
  await repack()
  await start({
    KITER_PACKAGED_SMOKE_RESTORE: path.join(retained, backups[0]),
    KITER_PACKAGED_SMOKE_BACKUP_DIRECTORY: retained,
  })
  await application
    .firstWindow()
    .then((window) =>
      window
        .getByRole('button', { name: 'Open folder', exact: true })
        .waitFor(),
    )
  const dialogs = await application.evaluate(() =>
    globalThis.packagedSmoke.dialogs.map((dialog) => dialog.title),
  )
  assert.ok(dialogs.includes('Restore library backup'))
  await stop()
  await start({ KITER_PACKAGED_SMOKE_INSPECT: '1' })
  const replies = await application.evaluate(
    async (_, id) =>
      globalThis.packagedSmoke.request([{ action: 'get-sample', id }]),
    identity,
  )
  assert.equal(replies[0].result.id, identity)
  assert.equal(replies[0].result.favorite, true)
  await stop()
  assert.ok(
    (
      await Promise.all(
        (await readdir(retained)).map(async (entry) =>
          JSON.parse(
            await readFile(path.join(retained, entry, 'manifest.json'), 'utf8'),
          ),
        ),
      )
    ).some((entry) => entry.kind === 'pre-restoration'),
  )
  assert.deepEqual(await readFile(path.join(samples, 'kick.wav')), audio)
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(extracted, 'out/main/dbWorker.js')))
      .digest('hex'),
    originalWorker,
  )
  assert.deepEqual(errors, [])
  console.log(
    `PASS: packaged startup recovery, protective current-state copy and restored Favorite (${process.platform} ${release()} ${process.arch})`,
  )
} finally {
  if (application) {
    await application.close()
  }
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
