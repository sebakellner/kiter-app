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
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import electron from 'electron'
import { createWav } from '../../support/fixtures/wav.mjs'

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
    stdio: ['ignore', 'pipe', 'pipe'],
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
  const result = once(child, 'close').then(([code, signal]) => ({
    code,
    signal,
    stdout,
    stderr,
  }))
  return { child, result }
}

test('reset preserves the entire profile in an archive and leaves audio untouched', async (t) => {
  const { root, script, profile } = await fixture(t)
  await mkdir(join(profile, 'db'), { recursive: true })
  await mkdir(join(profile, 'library', 'images'), { recursive: true })
  await mkdir(join(profile, 'empty directory'))
  const files = [
    'db/kiter.sqlite',
    'db/kiter.sqlite-wal',
    'db/kiter.sqlite-shm',
    'library/images/cover.png',
    'Preferences',
    'library/images/café cover.png',
  ]
  for (const file of files) {
    await writeFile(join(profile, file), `original ${file}`)
  }
  const audio = join(root, 'source.wav')
  const audioBytes = createWav(0.01)
  await writeFile(audio, audioBytes)

  const result = await launch(script).result
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.signal, null)
  const archives = join(root, '.kiter-dev', 'archives')
  const entries = await readdir(archives)
  assert.equal(entries.length, 1)
  const [created] = entries
  for (const file of files) {
    assert.equal(
      await readFile(join(archives, created, file), 'utf8'),
      `original ${file}`,
    )
  }
  assert.deepEqual(
    await readdir(join(archives, created, 'empty directory')),
    [],
  )
  await assert.rejects(readdir(profile), { code: 'ENOENT' })
  assert.deepEqual(await readFile(audio), audioBytes)

  const repeated = await launch(script).result
  assert.equal(repeated.code, 0, repeated.stderr)
  assert.deepEqual(await readdir(archives), entries)
})

test('reset with no profile does not create one', async (t) => {
  const { root, script } = await fixture(t)
  const result = await launch(script).result
  assert.equal(result.code, 0, result.stderr)
  await assert.rejects(readdir(join(root, '.kiter-dev')), { code: 'ENOENT' })
})

test('reset adds a new archive without changing earlier archives', async (t) => {
  const { root, script, profile } = await fixture(t)
  const archive = join(root, '.kiter-dev', 'archives', 'earlier')
  await mkdir(archive, { recursive: true })
  await writeFile(join(archive, 'sentinel'), 'preserved')
  await mkdir(profile)
  await writeFile(join(profile, 'sentinel'), 'new profile')

  const result = await launch(script).result
  assert.equal(result.code, 0, result.stderr)
  await assert.rejects(readdir(profile), { code: 'ENOENT' })
  const entries = await readdir(join(root, '.kiter-dev', 'archives'))
  assert.equal(entries.length, 2)
  const [created] = entries.filter((entry) => entry !== 'earlier')
  assert.ok(created)
  assert.equal(
    await readFile(
      join(root, '.kiter-dev', 'archives', created, 'sentinel'),
      'utf8',
    ),
    'new profile',
  )
  assert.equal(await readFile(join(archive, 'sentinel'), 'utf8'), 'preserved')
})

test('reset preserves the profile when the archive location is a file', async (t) => {
  const { root, script, profile } = await fixture(t)
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'sentinel'), 'profile preserved')
  const archives = join(root, '.kiter-dev', 'archives')
  await writeFile(archives, 'not a directory')

  const result = await launch(script).result
  assert.equal(result.code, 1, result.stdout)
  assert.match(result.stderr, /Expected a directory without symbolic links/)
  assert.equal(
    await readFile(join(profile, 'sentinel'), 'utf8'),
    'profile preserved',
  )
  assert.equal(await readFile(archives, 'utf8'), 'not a directory')
  assert.doesNotMatch(result.stdout, /Development profile archived/)
})

test('reset refuses an open Electron profile', async (t) => {
  const { root, script, profile, beforeRemove } = await fixture(t)
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'sentinel'), 'preserved')
  const server = createServer()
  beforeRemove.push(() => new Promise((resolve) => server.close(resolve)))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const connection = once(server, 'connection', {
    signal: AbortSignal.timeout(10000),
  })
  const holder = join(root, 'scripts', 'holder.mjs')
  await writeFile(
    holder,
    `
    import { app } from 'electron'
    import { connect } from 'node:net'
    app.setPath('userData', process.argv[2])
    app.setPath('sessionData', process.argv[2])
    if (!app.requestSingleInstanceLock()) app.exit(1)
    app.whenReady().then(() => {
      const socket = connect(Number(process.argv[3]), '127.0.0.1')
      socket.once('connect', () => socket.write('locked'))
      socket.once('data', () => app.exit(0))
      socket.once('error', () => app.exit(1))
    })
  `,
  )
  const running = launch(holder, [profile, String(server.address().port)])
  let socket
  beforeRemove.push(async () => {
    if (socket) {
      socket.end('quit')
    } else {
      running.child.kill()
    }
    const result = await running.result
    assert.equal(result.code, 0, result.stderr)
    assert.equal(
      result.signal,
      null,
      'Lock holder must exit without timing out',
    )
  })
  const [connected] = await Promise.race([
    connection,
    running.result.then((result) => {
      throw new Error(`Lock holder exited early: ${result.stderr}`)
    }),
  ])
  socket = connected
  const [message] = await once(socket, 'data', {
    signal: AbortSignal.timeout(10000),
  })
  assert.equal(message.toString(), 'locked')

  const result = await launch(script).result
  assert.equal(result.code, 1, result.stdout)
  assert.match(result.stderr, /Close the development app/)
  assert.equal(await readFile(join(profile, 'sentinel'), 'utf8'), 'preserved')
  await assert.rejects(readdir(join(root, '.kiter-dev', 'archives')), {
    code: 'ENOENT',
  })
})

for (const location of ['root', 'profile', 'archives']) {
  test(`reset refuses a symlinked development ${location}`, async (t) => {
    const { root, script, profile } = await fixture(t)
    const outside = join(root, 'outside')
    await mkdir(join(outside, 'current'), { recursive: true })
    const sentinel = join(outside, 'current', 'sentinel')
    await writeFile(sentinel, 'preserved')
    const target = {
      root: join(root, '.kiter-dev'),
      profile,
      archives: join(root, '.kiter-dev', 'archives'),
    }[location]
    if (location === 'profile') {
      await mkdir(join(root, '.kiter-dev'))
    } else if (location === 'archives') {
      await mkdir(profile, { recursive: true })
      await writeFile(join(profile, 'sentinel'), 'profile preserved')
    }
    // Directory junctions exercise the same guard without Windows privileges.
    await symlink(
      outside,
      target,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const result = await launch(script).result
    assert.equal(result.code, 1, result.stdout)
    assert.match(result.stderr, /Expected a directory without symbolic links/)
    assert.equal(await readFile(sentinel, 'utf8'), 'preserved')
    assert.deepEqual(await readdir(outside), ['current'])
    if (location === 'archives') {
      assert.equal(
        await readFile(join(profile, 'sentinel'), 'utf8'),
        'profile preserved',
      )
    }
  })
}
