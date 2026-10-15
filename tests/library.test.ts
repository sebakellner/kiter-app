import assert from 'node:assert/strict'
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { LibrarySample } from '../src/shared/ipc/library.ts'
import type { DiscoveredAudioFile } from '../src/shared/domain/source.ts'
import {
  importLibraryFolder,
  readAudioDir,
} from '../src/main/services/library/library.ts'

test('lists only supported audio files, with full paths and natural ordering', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-library-'))
  try {
    const audio = [
      'track10.mp3',
      'track2.MP3',
      'a.wav',
      'b.FLAC',
      'c.ogg',
      'd.m4a',
      'e.aac',
    ]
    await Promise.all(
      [...audio, 'notes.txt', 'cover.png', 'video.mp4', 'fake.mp3.txt'].map(
        (name) => writeFile(path.join(dir, name), ''),
      ),
    )
    await mkdir(path.join(dir, 'folder.mp3'))
    await writeFile(path.join(dir, 'folder.mp3', 'nested.mp3'), '')

    const files = await readAudioDir(dir)
    assert.deepEqual(
      files,
      [
        'a.wav',
        'b.FLAC',
        'c.ogg',
        'd.m4a',
        'e.aac',
        'folder.mp3/nested.mp3',
        'track2.MP3',
        'track10.mp3',
      ].map((relative) => ({
        name: path.basename(relative),
        path: path.join(dir, relative),
        relativePath: relative.split('/').join(path.sep),
      })),
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('returns an empty list for a directory without audio', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-empty-'))
  try {
    assert.deepEqual(await readAudioDir(dir), [])
    await writeFile(path.join(dir, 'notes.txt'), '')
    await mkdir(path.join(dir, 'nested', 'empty'), { recursive: true })
    await writeFile(path.join(dir, 'nested', 'notes.txt'), '')
    assert.deepEqual(await readAudioDir(dir), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('includes deep subfolders and keeps duplicate names with distinct paths', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-nested-'))
  try {
    await mkdir(path.join(dir, 'album', 'disc2'), { recursive: true })
    await writeFile(path.join(dir, 'song.mp3'), '')
    await writeFile(path.join(dir, 'album', 'song.mp3'), '')
    await writeFile(path.join(dir, 'album', 'disc2', 'song.mp3'), '')
    await writeFile(path.join(dir, 'album', 'disc2', 'cover.jpg'), '')

    const files = await readAudioDir(dir)
    assert.deepEqual(
      files,
      ['album/disc2/song.mp3', 'album/song.mp3', 'song.mp3'].map(
        (relative) => ({
          name: 'song.mp3',
          path: path.join(dir, relative),
          relativePath: relative.split('/').join(path.sep),
        }),
      ),
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ignores symbolic links to files and directories, including cycles', async (t) => {
  if (process.platform === 'win32') {
    t.skip(
      'Creating symbolic links may require elevated permissions on Windows',
    )
    return
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-links-'))
  try {
    await writeFile(path.join(dir, 'song.mp3'), '')
    await symlink(dir, path.join(dir, 'cycle'))
    await symlink(path.join(dir, 'song.mp3'), path.join(dir, 'linked.mp3'))
    assert.deepEqual(await readAudioDir(dir), [
      {
        name: 'song.mp3',
        path: path.join(dir, 'song.mp3'),
        relativePath: 'song.mp3',
      },
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rejects unreadable subfolders instead of returning an incomplete list', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires POSIX permissions and a non-root user')
    return
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-permissions-'))
  const blocked = path.join(dir, 'blocked')
  try {
    await mkdir(blocked)
    await writeFile(path.join(dir, 'song.mp3'), '')
    await chmod(blocked, 0)
    await assert.rejects(readAudioDir(dir), { code: 'EACCES' })
  } finally {
    await chmod(blocked, 0o700)
    await rm(dir, { recursive: true, force: true })
  }
})

test('rejects unreadable paths instead of returning an empty list', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-errors-'))
  try {
    await assert.rejects(readAudioDir(path.join(dir, 'missing')), {
      code: 'ENOENT',
    })
    const file = path.join(dir, 'file.mp3')
    await writeFile(file, '')
    await assert.rejects(readAudioDir(file), { code: 'ENOTDIR' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('prepares canonical locations before importing and returns catalog identities and favorites', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-library-import-'))
  const importFolder = t.mock.fn(
    async (
      _root: string,
      files: DiscoveredAudioFile[],
    ): Promise<LibrarySample[]> =>
      files.map(({ name, path, relativePath }) => ({
        name,
        path,
        relativePath,
        id: '00000000-0000-4000-8000-000000000001',
        favorite: true,
      })),
  )
  try {
    await mkdir(path.join(dir, 'nested'))
    await writeFile(path.join(dir, 'nested', 'song.wav'), '')
    const root = await realpath(dir)
    const file = {
      name: 'song.wav',
      path: await realpath(path.join(dir, 'nested', 'song.wav')),
      relativePath: path.join('nested', 'song.wav'),
    }
    assert.deepEqual(await importLibraryFolder(dir, { importFolder }), [
      { ...file, id: '00000000-0000-4000-8000-000000000001', favorite: true },
    ])
    assert.equal(importFolder.mock.callCount(), 1)
    const observation = await stat(file.path)
    assert.deepEqual(importFolder.mock.calls[0].arguments, [
      root,
      [
        {
          ...file,
          observedSizeBytes: observation.size,
          observedMtimeMs: observation.mtimeMs,
        },
      ],
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('does not import a failed scan or expose personal paths in its error', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-library-import-error-'))
  const importFolder = t.mock.fn(async () => [])
  try {
    await assert.rejects(
      importLibraryFolder(path.join(dir, 'missing'), { importFolder }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /ENOENT/)
        assert.ok(!error.message.includes(dir))
        return true
      },
    )
    assert.equal(importFolder.mock.callCount(), 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('preserves a catalog failure instead of returning a successful empty import', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-library-catalog-error-'))
  const failure = new Error('Catalog write failed')
  const importFolder = t.mock.fn(async () => {
    throw failure
  })
  try {
    await assert.rejects(
      importLibraryFolder(dir, { importFolder }),
      (error: unknown) => error === failure,
    )
    assert.equal(importFolder.mock.callCount(), 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
