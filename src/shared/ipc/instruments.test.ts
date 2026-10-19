import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isInstrument,
  isInstrumentPage,
  requireInstrumentCreateRequest,
  requireInstrumentListRequest,
  requireInstrumentRenameRequest,
} from './instruments.ts'
import { DomainValidationError } from '../domain/validation.ts'
import { IpcError, requireIpcResult } from './result.ts'

const id = '00000000-0000-4000-8000-000000000001'
const instrument = { id, name: 'Percusión' }

test('Instrument requests reuse Unicode name and bounded literal-search rules', () => {
  assert.deepEqual(
    requireInstrumentCreateRequest({ name: ' Percusio\u0301n ' }),
    {
      name: 'Percusión',
    },
  )
  assert.deepEqual(requireInstrumentRenameRequest({ id, name: ' DRUMS ' }), {
    id,
    name: 'DRUMS',
  })
  assert.deepEqual(requireInstrumentListRequest({}), {
    search: '',
    limit: 50,
    offset: 0,
  })
  assert.deepEqual(
    requireInstrumentListRequest({
      search: ' E\u0301_% ',
      limit: 100,
      offset: 2,
    }),
    { search: 'é_%', limit: 100, offset: 2 },
  )
  assert.deepEqual(requireInstrumentCreateRequest({ name: '🎵'.repeat(120) }), {
    name: '🎵'.repeat(120),
  })
})

test('Instrument requests reject malformed names, identifiers and pages', () => {
  for (const value of [
    undefined,
    null,
    [],
    {},
    { name: 1 },
    { name: ' ' },
    { name: '\nDrums' },
    { name: 'Drums\u2028' },
    { name: 'a'.repeat(121) },
  ]) {
    assert.throws(
      () => requireInstrumentCreateRequest(value),
      DomainValidationError,
    )
    assert.throws(
      () => requireInstrumentRenameRequest(value),
      DomainValidationError,
    )
  }
  for (const badId of [undefined, null, '', 'invalid', 1]) {
    assert.throws(
      () => requireInstrumentRenameRequest({ id: badId, name: 'Drums' }),
      DomainValidationError,
    )
  }
  for (const value of [
    undefined,
    null,
    [],
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '50' },
    { offset: -1 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { search: null },
    { search: '\n' },
    { search: 'a'.repeat(121) },
  ]) {
    assert.throws(
      () => requireInstrumentListRequest(value),
      DomainValidationError,
    )
  }
})

test('Instrument response validation rejects malformed or non-normalized data', () => {
  assert.equal(isInstrument(instrument), true)
  for (const value of [
    null,
    { ...instrument, id: 'invalid' },
    { ...instrument, name: ' Percusión ' },
    { ...instrument, name: 'Percusio\u0301n' },
    { ...instrument, name: '' },
    { ...instrument, name: 1 },
  ]) {
    assert.equal(isInstrument(value), false)
    assert.throws(
      () => requireIpcResult({ ok: true, data: value }, isInstrument),
      (error: unknown) =>
        error instanceof IpcError && error.code === 'PROTOCOL_ERROR',
    )
  }
})

test('Instrument page responses require complete and consistent pagination metadata', () => {
  const page = { items: [instrument], total: 1, limit: 50, offset: 0 }
  assert.deepEqual(
    requireIpcResult({ ok: true, data: page }, isInstrumentPage),
    {
      ok: true,
      data: page,
    },
  )
  assert.equal(
    isInstrumentPage({ items: [], total: 0, limit: 50, offset: 10 }),
    true,
  )
  for (const value of [
    null,
    { items: [], total: 0 },
    { ...page, items: [null] },
    { ...page, items: null },
    { ...page, total: 0 },
    { ...page, total: -1 },
    { ...page, total: 1.5 },
    { ...page, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, limit: 101 },
    { ...page, limit: 0 },
    { ...page, offset: 1 },
    { ...page, offset: -1 },
    { ...page, items: [instrument, instrument], total: 2, limit: 1 },
  ]) {
    assert.equal(isInstrumentPage(value), false)
  }
})
