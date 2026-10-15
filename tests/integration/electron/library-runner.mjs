import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const directory = await mkdtemp(path.join(tmpdir(), 'kiter-app-test-'))
try {
  const result = spawnSync(
    electron,
    [
      fileURLToPath(new URL('./library.electron.mjs', import.meta.url)),
      directory,
    ],
    { cwd: directory, stdio: 'inherit', timeout: 120000 },
  )
  if (result.error) {
    throw result.error
  }
  assert.equal(result.status, 0, 'Electron library integration failed')
} finally {
  // Chromium may retain userData handles until the Electron process exits.
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
