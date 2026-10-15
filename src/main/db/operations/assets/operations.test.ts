import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import * as assets from './operations.ts'
import { readLocalProfile } from '../profile/operations.ts'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeImageAsset } from '../../../../../tests/support/fixtures/image.ts'

test('Failed reference updates roll back image registration and preserve the previous avatar', (t) => {
  const connection = createMemoryDatabase(t)
  const { db } = connection
  const initial = makeImageAsset()
  assets.publishImage(db, {
    target: { kind: 'profile' },
    expectedAssetId: null,
    asset: initial,
  })
  const replacement = makeImageAsset({ id: randomUUID() })
  connection.native.exec(
    `CREATE TRIGGER reject_avatar BEFORE UPDATE OF avatar_asset_id ON user_profiles BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`,
  )
  assert.throws(() =>
    assets.publishImage(db, {
      target: { kind: 'profile' },
      expectedAssetId: initial.id,
      asset: replacement,
    }),
  )
  assert.equal(readLocalProfile(db).profile.avatarAssetId, initial.id)
  assert.equal(assets.getImage(db, initial.id)?.state, 'ready')
  assert.equal(assets.getImage(db, replacement.id), null)
})
