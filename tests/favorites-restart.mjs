import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import electron from 'electron'
import { createWav } from './wav.mjs'

const dir = await mkdtemp(path.join(tmpdir(), 'kiter-favorites-restart-'))
try {
  await mkdir(path.join(dir, 'samples'))
  await mkdir(path.join(dir, 'empty'))
  await mkdir(path.join(dir, 'data'))
  const audio = createWav()
  await writeFile(path.join(dir, 'samples', 'song.wav'), audio)
  for (const phase of ['save', 'remove', 'verify']) {
    const result = spawnSync(electron, ['tests/favorites.electron.mjs', phase, dir], {
      encoding: 'utf8',
      timeout: 60000
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) throw result.error
    assert.equal(result.status, 0, `Electron favorites phase ${phase} failed`)
    assert.doesNotMatch(result.stderr, /Catalog shutdown failed|local catalog stopped unexpectedly/)
  }
  assert.deepEqual(await readFile(path.join(dir, 'samples', 'song.wav')), audio)
} finally {
  await rm(dir, { recursive: true, force: true })
}
