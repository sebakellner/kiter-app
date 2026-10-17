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
