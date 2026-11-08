import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { createTemporaryDirectory } from '../../../../tests/support/filesystem/temporary-directory.ts'
import {
  verifyCatalogSource,
  verifyCatalogSourceSync,
} from './source-access.ts'
import type { CatalogSample } from '../../../shared/ipc/library.ts'

test('source access rejects missing files, unregistered sources and symlinked ancestors', async (t) => {
  const { path: directory } = await createTemporaryDirectory(
    t,
    'catalog-access',
  )
  const root = path.join(directory, 'samples')
  await mkdir(root)
  const file = path.join(root, 'kick.wav')
  await writeFile(file, 'original')
  const sample: CatalogSample = {
    id: 'sample',
    name: 'kick.wav',
    relativePath: 'kick.wav',
    path: file,
    favorite: true,
    rootPath: root,
    sourceRevision: 1,
  }
  await verifyCatalogSource(sample)
  verifyCatalogSourceSync(sample)
  await assert.rejects(verifyCatalogSource({ ...sample, rootPath: null }))
  await assert.rejects(
    verifyCatalogSource({
      ...sample,
      path: path.join(directory, 'outside.wav'),
    }),
  )
  await rm(file)
  await assert.rejects(verifyCatalogSource(sample))
  assert.throws(() => verifyCatalogSourceSync(sample))
  const outside = path.join(directory, 'outside')
  await mkdir(outside)
  await writeFile(path.join(outside, 'kick.wav'), 'different')
  await symlink(outside, path.join(root, 'linked'), 'junction')
  const linked = { ...sample, path: path.join(root, 'linked', 'kick.wav') }
  await assert.rejects(verifyCatalogSource(linked))
  assert.throws(() => verifyCatalogSourceSync(linked))
})

// The drag gesture needs a synchronous variant, so the rule exists twice. Both
// entry points must reach the same decision for every shape of source; this
// matrix is the net that keeps them from drifting apart.
test('source access decisions agree between the async and sync variants', async (t) => {
  const { path: directory } = await createTemporaryDirectory(t, 'catalog-agree')
  const root = path.join(directory, 'samples')
  await mkdir(root)
  await mkdir(path.join(root, 'nested'))
  await writeFile(path.join(root, 'kick.wav'), 'original')
  await writeFile(path.join(root, 'nested', 'snare.wav'), 'nested')
  const file = path.join(root, 'kick.wav')
  const sample: CatalogSample = {
    id: 'sample',
    name: 'kick.wav',
    relativePath: 'kick.wav',
    path: file,
    favorite: false,
    rootPath: root,
    sourceRevision: 1,
  }
  const outside = path.join(directory, 'outside')
  await mkdir(outside)
  await writeFile(path.join(outside, 'kick.wav'), 'different')
  await symlink(outside, path.join(root, 'linked'), 'junction')
  await symlink(
    path.join(outside, 'kick.wav'),
    path.join(root, 'link.wav'),
    'file',
  )

  const cases: Array<{
    label: string
    sample: CatalogSample
    accepted: boolean
  }> = [
    { label: 'registered file', sample, accepted: true },
    {
      label: 'registered nested file',
      sample: { ...sample, path: path.join(root, 'nested', 'snare.wav') },
      accepted: true,
    },
    {
      label: 'unregistered source',
      sample: { ...sample, rootPath: null },
      accepted: false,
    },
    {
      label: 'path outside the registered folder',
      sample: { ...sample, path: path.join(outside, 'kick.wav') },
      accepted: false,
    },
    {
      label: 'path equal to the registered folder',
      sample: { ...sample, path: root },
      accepted: false,
    },
    {
      label: 'symlinked ancestor',
      sample: { ...sample, path: path.join(root, 'linked', 'kick.wav') },
      accepted: false,
    },
    {
      label: 'symlinked file',
      sample: { ...sample, path: path.join(root, 'link.wav') },
      accepted: false,
    },
    {
      label: 'non-canonical registered folder',
      sample: { ...sample, rootPath: `${root}${path.sep}` },
      accepted: false,
    },
  ]

  for (const { label, sample: current, accepted } of cases) {
    const asyncOutcome = await verifyCatalogSource(current).then(
      () => 'accepted' as const,
      () => 'rejected' as const,
    )
    const syncOutcome = await Promise.resolve()
      .then(() => verifyCatalogSourceSync(current))
      .then(
        () => 'accepted' as const,
        () => 'rejected' as const,
      )
    assert.equal(
      asyncOutcome,
      accepted ? 'accepted' : 'rejected',
      `async variant decided wrongly for: ${label}`,
    )
    assert.equal(syncOutcome, asyncOutcome, `variants disagree for: ${label}`)
  }
})
