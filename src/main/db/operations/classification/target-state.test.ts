import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  changedStateFields,
  targetStateFields,
  targetStateToken,
} from './target-state.ts'
import type { StandaloneClassificationContextTarget } from '../../../../shared/features/classification/standalone-context-schemas.ts'

// A fixed reviewed target, never read from a catalog: these digests are the
// contract both the preparation and the execution compare, so they must not move
// because a field was renamed, reordered or dropped from the shared field list.
const reviewed: StandaloneClassificationContextTarget = {
  target: { kind: 'sample', id: '11111111-1111-4111-8111-111111111111' },
  currentType: 'loop',
  assignments: [{ dimension: 'genre', key: 'genre:house' }],
  sources: [
    {
      rootId: '22222222-2222-4222-8222-222222222222',
      rootPath: '/root',
      relativePath: 'Drums/kick.wav',
      availability: 'available',
      canonicalPath: '/root/Drums/kick.wav',
    },
  ],
  originPackId: null,
  originGenreKeys: ['house'],
}

test('the reviewed read-state token stays byte-identical', () => {
  assert.equal(
    targetStateToken(reviewed),
    '273067f0ac96ce190720f17c5f2fd6747448b36b5bdc27c58ea4347602892ea4',
  )
})

test('field digests explain one field each and cover the whole reviewed state', () => {
  assert.deepEqual(targetStateFields(reviewed), {
    target: 'd7944055d8c58d00',
    currentType: '889c19fd926bc4ca',
    assignments: '25b9d1229ee3c916',
    sources: '65a17d4450ca22c5',
    originPackId: '74234e98afe7498f',
    originGenreKeys: '356b22a4a50381a3',
  })
})

test('changed fields are reported in canonical order and never invented', () => {
  const current = targetStateFields({
    ...reviewed,
    currentType: 'one-shot',
    originGenreKeys: [],
  })
  assert.deepEqual(changedStateFields(targetStateFields(reviewed), current), [
    'currentType',
    'originGenreKeys',
  ])
  assert.deepEqual(
    changedStateFields(
      targetStateFields(reviewed),
      targetStateFields(reviewed),
    ),
    [],
  )
})
