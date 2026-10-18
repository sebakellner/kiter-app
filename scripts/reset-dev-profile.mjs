import { app } from 'electron'
import { lstatSync, mkdirSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../.kiter-dev', import.meta.url))
const profile = join(root, 'current')

function isDirectory(path) {
  try {
    const info = lstatSync(path)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Expected a directory without symbolic links.')
    }
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function reset() {
  if (!isDirectory(root) || !isDirectory(profile)) {
    console.log(
      'No development profile to archive. Run pnpm dev to create one.',
    )
    return
  }

  // Use Electron's own lock, including its stale-lock recovery, on both platforms.
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
  if (!app.requestSingleInstanceLock()) {
    throw new Error('Close the development app before running pnpm dev:reset.')
  }

  try {
    const archives = join(root, 'archives')
    if (!isDirectory(archives)) {
      mkdirSync(archives)
    }
    const name = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
    // Chromium's Windows lockfile prevents renaming its parent directory.
    // Release it immediately before the synchronous rename, without yielding.
    if (process.platform === 'win32') {
      app.releaseSingleInstanceLock()
    }
    renameSync(profile, join(archives, name))
    console.log(`Development profile archived to .kiter-dev/archives/${name}`)
    console.log(
      'Run pnpm dev to create a fresh profile with current migrations.',
    )
  } finally {
    app.releaseSingleInstanceLock()
  }
}

// Finish filesystem work before Electron becomes ready or creates a session.
try {
  reset()
  app.exit(0)
} catch (error) {
  console.error(
    'Development profile reset failed:',
    error.code ?? error.message,
  )
  app.exit(1)
}
