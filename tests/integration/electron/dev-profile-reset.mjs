import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import electron from 'electron'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kiter-dev-reset-'))
  const beforeRemove = []
  t.after(async () => {
    for (const cleanup of beforeRemove.toReversed()) {
      await cleanup()
    }
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  })
  await mkdir(join(root, 'scripts'))
  const script = join(root, 'scripts', 'reset-dev-profile.mjs')
  await copyFile(
    new URL('../../../scripts/reset-dev-profile.mjs', import.meta.url),
    script,
  )
  return {
    root,
    script,
    profile: join(root, '.kiter-dev', 'current'),
    beforeRemove,
  }
}

function launch(script, args = []) {
  const child = spawn(electron, [script, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data) => {
    stdout += data
  })
  child.stderr.on('data', (data) => {
    stderr += data
  })
  const result = once(child, 'close').then(([code]) => ({
    code,
    stdout,
    stderr,
  }))
  return { child, result }
}

test('reset preserves the entire profile in an archive and leaves audio untouched', async (t) => {
  const { root, script, profile } = await fixture(t)
  await mkdir(join(profile, 'db'), { recursive: true })
  await mkdir(join(profile, 'library', 'images'), { recursive: true })
  const files = [
    'db/kiter.sqlite',
    'db/kiter.sqlite-wal',
    'db/kiter.sqlite-shm',
    'library/images/cover.png',
    'Preferences',
  ]
  for (const file of files) {
    await writeFile(join(profile, file), `original ${file}`)
  }
  const audio = join(root, 'source.wav')
  await writeFile(audio, 'original audio')

  const result = await launch(script).result
  assert.equal(result.code, 0, result.stderr)
  const archives = join(root, '.kiter-dev', 'archives')
  const entries = await readdir(archives)
  assert.equal(entries.length, 1)
  for (const file of files) {
    assert.equal(
      await readFile(join(archives, entries[0], file), 'utf8'),
      `original ${file}`,
    )
  }
  await assert.rejects(readdir(profile), { code: 'ENOENT' })
  assert.equal(await readFile(audio, 'utf8'), 'original audio')

  assert.equal((await launch(script).result).code, 0)
  assert.deepEqual(await readdir(archives), entries)
})

test('reset with no profile does not create one', async (t) => {
  const { root, script } = await fixture(t)
  const result = await launch(script).result
  assert.equal(result.code, 0, result.stderr)
  await assert.rejects(readdir(join(root, '.kiter-dev')), { code: 'ENOENT' })
})

test('reset refuses an open Electron profile', async (t) => {
  const { root, script, profile, beforeRemove } = await fixture(t)
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'sentinel'), 'preserved')
  const holder = join(root, 'scripts', 'holder.mjs')
  await writeFile(
    holder,
    `
    import { app } from 'electron'
    app.setPath('userData', process.argv[2])
    if (!app.requestSingleInstanceLock()) app.exit(1)
    process.stdin.once('data', () => app.quit())
    console.log('locked')
  `,
  )
  const running = launch(holder, [profile])
  beforeRemove.push(async () => {
    running.child.stdin.end('quit')
    await running.result
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Profile lock startup timed out')),
      10000,
    )
    running.child.stdout.on('data', (data) => {
      if (data.toString().includes('locked')) {
        clearTimeout(timer)
        resolve()
      }
    })
    running.result.then(() => {
      clearTimeout(timer)
      reject(new Error('Lock holder exited early'))
    })
  })

  const result = await launch(script).result
  assert.equal(result.code, 1, result.stdout)
  assert.match(result.stderr, /Close the development app/)
  assert.equal(await readFile(join(profile, 'sentinel'), 'utf8'), 'preserved')
  await assert.rejects(readdir(join(root, '.kiter-dev', 'archives')), {
    code: 'ENOENT',
  })
})

test(
  'reset refuses a symlinked development root',
  {
    skip:
      process.platform === 'win32'
        ? 'Requires Windows symlink privileges'
        : false,
  },
  async (t) => {
    const { root, script } = await fixture(t)
    const outside = join(root, 'outside')
    await mkdir(join(outside, 'current'), { recursive: true })
    await writeFile(join(outside, 'current', 'sentinel'), 'preserved')
    await symlink(outside, join(root, '.kiter-dev'), 'dir')
    const result = await launch(script).result
    assert.equal(result.code, 1)
    assert.equal(
      await readFile(join(outside, 'current', 'sentinel'), 'utf8'),
      'preserved',
    )
  },
)
