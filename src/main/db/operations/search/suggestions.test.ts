import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { importSampleFixtures } from '../../../../../tests/support/database/import-samples.ts'
import { makePackInsert } from '../../../../../tests/support/database/factories/pack.ts'
import { makeCollectionInsert } from '../../../../../tests/support/database/factories/collection.ts'
import {
  createAuthor,
  createInstrument,
  setInstrumentAssignment,
} from '../classification/operations.ts'
import { createGenre } from '../classification/genres.ts'
import { getPackSourceRoot } from '../packs/operations.ts'
import { collections } from '../../schema/collections.ts'
import { packs } from '../../schema/packs.ts'
import {
  SUGGESTION_KINDS,
  SUGGESTION_LIMIT,
  isSearchSuggestResponse,
  type SearchSuggestResponse,
  type SuggestionKind,
} from '../../../../shared/ipc/search.ts'
import { searchSuggest } from './suggestions.ts'

const root = path.resolve('search-suggestions-fixture')

function groupNames(
  response: SearchSuggestResponse,
  kind: SuggestionKind,
): string[] {
  return (
    response.groups
      .find((group) => group.kind === kind)
      ?.items.map(({ name }) => name) ?? []
  )
}

function addPack(
  db: ReturnType<typeof createMemoryDatabase>['db'],
  name: string,
): void {
  const sourceRootId = getPackSourceRoot(db, root).id
  db.insert(packs)
    .values(makePackInsert(randomUUID(), sourceRootId, { name }))
    .run()
}

test('keeps at most five suggestions per kind in canonical group order', (t) => {
  const { db } = createMemoryDatabase(t)
  for (const suffix of ['1', '2', '3', '4', '5', '6', '7']) {
    db.insert(collections)
      .values(makeCollectionInsert(randomUUID(), { name: `Techno ${suffix}` }))
      .run()
  }
  const response = searchSuggest(db, { query: 'techno' })
  assert.ok(isSearchSuggestResponse(response))
  assert.deepEqual(
    response.groups.map(({ kind }) => kind),
    [...SUGGESTION_KINDS].filter((kind) =>
      response.groups.some((group) => group.kind === kind),
    ),
  )
  for (const group of response.groups) {
    assert.ok(group.items.length > 0 && group.items.length <= SUGGESTION_LIMIT)
  }
  assert.deepEqual(groupNames(response, 'collection'), [
    'Techno 1',
    'Techno 2',
    'Techno 3',
    'Techno 4',
    'Techno 5',
  ])
})

test('ranks exact names first, then name prefixes, then substrings', (t) => {
  const { db } = createMemoryDatabase(t)
  createInstrument(db, { name: 'Techno Lead' })
  createInstrument(db, { name: 'Deep Techno Kit' })
  createInstrument(db, { name: 'Deep Techno' })
  const exact = createInstrument(db, { name: 'Techno' })
  const response = searchSuggest(db, { query: 'techno' })
  assert.ok(isSearchSuggestResponse(response))
  assert.deepEqual(groupNames(response, 'instrument'), [
    'Techno',
    'Techno Lead',
    'Deep Techno',
    'Deep Techno Kit',
  ])
  assert.deepEqual(response.groups[0].items[0], {
    kind: 'instrument',
    id: exact.id,
    name: 'Techno',
  })
})

test('requires every query word, in any order and across searchable fields', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, root, [
    'Techno/Kick 808.wav',
    'House/Clap.wav',
  ])
  const kick = imported.find(({ name }) => name === 'Kick 808.wav')!
  const drums = createInstrument(db, { name: 'Drums' })
  setInstrumentAssignment(db, {
    id: drums.id,
    target: { kind: 'sample', id: kick.id },
    assigned: true,
  })
  const names = (query: string): string[] =>
    groupNames(searchSuggest(db, { query }), 'sample')
  // Words match in reverse order, and an assigned Instrument name supplies one word.
  assert.deepEqual(names('kick drums'), ['Kick 808.wav'])
  assert.deepEqual(names('808 kick'), ['Kick 808.wav'])
  // Every word must match the same Sample.
  assert.deepEqual(names('clap drums'), [])
  assert.deepEqual(names('kick missing'), [])
  assert.deepEqual(names('TECHNO 808'), ['Kick 808.wav'])
})

test('rejects requests that cannot start a textual search', (t) => {
  const { db } = createMemoryDatabase(t)
  for (const query of ['', ' ', 'a', '  k  ']) {
    assert.throws(() => searchSuggest(db, { query }), {
      name: 'DomainValidationError',
      message: 'Type at least 2 characters to search.',
    })
  }
  assert.throws(() => searchSuggest(db, null as never), {
    name: 'DomainValidationError',
    message: 'Invalid search request.',
  })
  assert.deepEqual(searchSuggest(db, { query: 'Nothing Matches This' }), {
    query: 'nothing matches this',
    groups: [],
  })
})

test('returns every matching kind in canonical order with the normalized query', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, root, ['Técno/Kick.wav'])
  addPack(db, 'Técno Toolkit')
  db.insert(collections)
    .values(makeCollectionInsert(randomUUID(), { name: 'Técno Selection' }))
    .run()
  createInstrument(db, { name: 'Técno Lead' })
  createAuthor(db, { name: 'Técno Author' })
  createGenre(db, { name: 'Técno' })
  const response = searchSuggest(db, { query: '  TÉCNO  ' })
  assert.ok(isSearchSuggestResponse(response))
  assert.equal(response.query, 'tecno')
  assert.deepEqual(
    response.groups.map(({ kind }) => kind),
    [...SUGGESTION_KINDS],
  )
  for (const group of response.groups) {
    assert.ok(group.items.length > 0 && group.items.length <= 5)
    assert.ok(group.items.every((item) => item.kind === group.kind))
  }
  assert.deepEqual(groupNames(response, 'pack'), ['Técno Toolkit'])
  assert.deepEqual(groupNames(response, 'collection'), ['Técno Selection'])
  assert.deepEqual(groupNames(response, 'instrument'), ['Técno Lead'])
  assert.deepEqual(groupNames(response, 'author'), ['Técno Author'])
  assert.deepEqual(groupNames(response, 'genre'), ['Técno'])
  assert.deepEqual(response.groups[0].items, [
    {
      kind: 'sample',
      id: imported[0].id,
      name: 'Kick.wav',
      detail: path.join('Técno', 'Kick.wav'),
    },
  ])
})
