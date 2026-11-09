import { expect, test } from 'vitest'
import { locateGenrePatch, locateGenreState } from './locateGenre'

const genreId = '4e5f6071-8293-4da4-bec5-f60718293a4b'

test('filters Samples by the located Genre and clears filters that would hide them', () => {
  expect(
    locateGenrePatch({ locateGenreId: genreId, locateGenreName: 'House' }),
  ).toEqual({
    favoritesOnly: false,
    instruments: [],
    genres: [{ id: genreId, name: 'House' }],
    sampleTypes: [],
    search: '',
    offset: 0,
    scrollTop: 0,
    selectedId: null,
  })
})

test('ignores navigation state without a valid Genre identity or name', () => {
  expect(locateGenrePatch(null)).toBeNull()
  expect(locateGenrePatch('house')).toBeNull()
  expect(
    locateGenrePatch({ locateGenreId: 'genre-1', locateGenreName: 'House' }),
  ).toBeNull()
  expect(locateGenrePatch({ locateGenreId: genreId })).toBeNull()
  expect(
    locateGenrePatch({ locateGenreId: genreId, locateGenreName: '  ' }),
  ).toBeNull()
})

test('carries the Genre identity and presentation name to the Samples view', () => {
  expect(locateGenreState({ id: genreId, name: 'House' })).toEqual({
    locateGenreId: genreId,
    locateGenreName: 'House',
  })
})
