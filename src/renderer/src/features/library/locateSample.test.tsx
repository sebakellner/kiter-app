import { expect, test } from 'vitest'
import { locateSamplePatch, locateSampleState } from './locateSample'
import { MAX_CATALOG_SEARCH_LENGTH } from '@shared/features/library/search'

const sampleId = '3f9c1b2a-4d5e-4f60-8a71-2b3c4d5e6f70'

test('clears the filters that would hide the located Sample and selects it', () => {
  expect(
    locateSamplePatch({ locateSampleId: sampleId, locateSearch: 'Warm Kick' }),
  ).toEqual({
    favoritesOnly: false,
    instruments: [],
    genres: [],
    sampleTypes: [],
    search: 'Warm Kick',
    offset: 0,
    scrollTop: 0,
    selectedId: sampleId,
  })
})

test('ignores navigation state without a valid Sample identifier', () => {
  expect(locateSamplePatch(null)).toBeNull()
  expect(locateSamplePatch('samples')).toBeNull()
  expect(locateSamplePatch({ locateSampleId: 'sample-1' })).toBeNull()
  expect(locateSamplePatch({ locateSampleId: sampleId })).toMatchObject({
    selectedId: sampleId,
    search: '',
  })
})

test('drops a name the catalog search contract rejects instead of an invalid query', () => {
  const patch = locateSamplePatch({
    locateSampleId: sampleId,
    locateSearch: 'k'.repeat(MAX_CATALOG_SEARCH_LENGTH + 1),
  })
  expect(patch?.search).toBe('')
  expect(patch?.selectedId).toBe(sampleId)
})

test('carries the Sample identity and presentation name to the Samples view', () => {
  expect(locateSampleState({ id: sampleId, name: 'Warm Kick' })).toEqual({
    locateSampleId: sampleId,
    locateSearch: 'Warm Kick',
  })
})
