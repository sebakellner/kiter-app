import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { createInstrument } from '../classification/operations.ts'
import { isSearchSuggestResponse } from '../../../../shared/ipc/search.ts'
import { isDbReply, isDbRequest } from '../../protocol/messages.ts'
import { searchSuggest } from './suggestions.ts'
import { SEARCH_SUGGEST_FAILURE, searchSuggestResult } from './handler.ts'

function suggest(
  db: ReturnType<typeof createMemoryDatabase>['db'],
  request: unknown,
): ReturnType<typeof searchSuggestResult> {
  return searchSuggestResult((input) => searchSuggest(db, input), request)
}

test('search:suggest reports the bounded response for a valid request', async (t) => {
  const { db } = createMemoryDatabase(t)
  createInstrument(db, { name: 'Techno Lead' })
  const result = await suggest(db, { query: 'techno' })
  assert.ok(result.ok)
  assert.ok(isSearchSuggestResponse(result.data))
  assert.equal(result.data.query, 'techno')
  assert.deepEqual(
    result.data.groups.map(({ kind }) => kind),
    ['instrument', 'genre'],
  )
  assert.deepEqual(
    result.data.groups[0].items.map(({ name }) => name),
    ['Techno Lead'],
  )
})

test('search:suggest rejects invalid requests before querying', async (t) => {
  const { db } = createMemoryDatabase(t)
  assert.deepEqual(await suggest(db, { query: '' }), {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'Type at least 2 characters to search.',
    },
  })
  assert.deepEqual(await suggest(db, { query: 42 }), {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'Invalid search. Use at most 500 characters and 32 words, without control characters.',
    },
  })
  assert.deepEqual(await suggest(db, null), {
    ok: false,
    error: { code: 'INVALID_INPUT', message: 'Invalid search request.' },
  })
})

test('search:suggest reports storage failures without leaking details', async () => {
  const result = await searchSuggestResult(
    () => {
      throw new Error('SQLITE_CANTOPEN /Users/private/catalog.sqlite')
    },
    { query: 'techno' },
  )
  assert.deepEqual(result, { ok: false, error: SEARCH_SUGGEST_FAILURE })
  assert.deepEqual(SEARCH_SUGGEST_FAILURE, {
    code: 'STORAGE_FAILED',
    message: 'Unable to search. Check database storage and try again.',
  })
})

test('the DB protocol carries one bounded search-suggest request and reply', async (t) => {
  const { db } = createMemoryDatabase(t)
  createInstrument(db, { name: 'Techno Lead' })
  const request = {
    requestId: 1,
    action: 'search-suggest',
    input: { query: 'techno' },
  }
  assert.equal(isDbRequest(request), true)
  // A query that cannot start a textual search never reaches the worker.
  assert.equal(isDbRequest({ ...request, input: { query: 't' } }), false)
  assert.equal(isDbRequest({ ...request, input: null }), false)
  const result = await suggest(db, { query: 'techno' })
  assert.ok(result.ok)
  assert.equal(
    isDbReply({ requestId: 1, action: 'search-suggest', result: result.data }),
    true,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'search-suggest',
      result: { groups: [] },
    }),
    false,
  )
})
