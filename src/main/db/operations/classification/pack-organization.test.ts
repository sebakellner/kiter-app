import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { createAuthor, createInstrument, renameAuthor } from './operations.ts'
import { readImportPackOrganizationCatalog } from './pack-organization.ts'
import { isDbRequest, isDbReply } from '../../protocol/messages.ts'
import { dispatchRequest } from '../../worker/dispatch.ts'

test('Pack organization catalog preserves homonyms, paginates under one token and never writes on reads', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const first = createAuthor(db, { name: 'Producer A' })
  const second = createAuthor(db, { name: 'Producer A' })
  const instrument = createInstrument(db, { name: 'Piano' })
  for (let index = 0; index < 105; index++) {
    createAuthor(db, { name: `Artist ${index}` })
  }
  const before = native.serialize()
  const page = readImportPackOrganizationCatalog(db, {})
  assert.equal(page.items.length, 100)
  assert.equal(page.total, 134)
  const next = readImportPackOrganizationCatalog(db, {
    offset: 100,
    token: page.token,
  })
  assert.equal(next.items.length, 34)
  const items = [...page.items, ...next.items]
  assert.equal(
    items.filter(
      (entry) => entry.kind === 'author' && entry.name === 'Producer A',
    ).length,
    2,
  )
  assert.ok(
    items.some(
      (entry) =>
        entry.kind === 'instrument' &&
        entry.id === instrument.id &&
        entry.key === 'instrument:piano',
    ),
  )
  assert.ok(items.some((entry) => entry.id === first.id))
  assert.ok(items.some((entry) => entry.id === second.id))
  assert.deepEqual(native.serialize(), before)
  const request = {
    action: 'read-import-pack-organization-catalog' as const,
    input: { token: page.token, offset: 100 },
    requestId: 1,
  }
  assert.equal(isDbRequest(request), true)
  const reply = dispatchRequest(db, request)
  assert.equal(isDbReply(reply), true)
  assert.deepEqual(reply, {
    action: request.action,
    requestId: 1,
    result: next,
  })
  renameAuthor(db, { id: first.id, name: 'Producer B' })
  assert.throws(
    () =>
      readImportPackOrganizationCatalog(db, { offset: 100, token: page.token }),
    { code: 'STALE_REVIEW' },
  )
})

test('Pack organization worker contracts reject unpinned pages and unsupported request or response fields', (t) => {
  const { db } = createMemoryDatabase(t)
  for (const input of [
    { offset: 100 },
    { offset: -1 },
    { offset: 30001 },
    { offset: 0, sourcePath: '/untrusted' },
  ]) {
    assert.equal(
      isDbRequest({
        action: 'read-import-pack-organization-catalog',
        input,
        requestId: 1,
      }),
      false,
    )
    assert.throws(() => readImportPackOrganizationCatalog(db, input), {
      code: 'INVALID_INPUT',
    })
  }
  const page = readImportPackOrganizationCatalog(db, {})
  assert.equal(
    isDbReply({
      action: 'read-import-pack-organization-catalog',
      requestId: 1,
      result: { ...page, token: 'forged' },
    }),
    false,
  )
})
