import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requireSampleInstrumentsRequest,
  requireSampleInstrumentsSaveRequest,
  isSampleInstrumentsSnapshot,
} from './sampleInstruments.ts'

const id = '00000000-0000-4000-8000-000000000001'
const token = 'a'.repeat(64)

test('manual instrument contracts accept clearing and reject duplicate, unbounded or forged identities', () => {
  assert.deepEqual(
    requireSampleInstrumentsSaveRequest({
      sampleId: id,
      token,
      instrumentIds: [],
    }),
    { sampleId: id, token, instrumentIds: [] },
  )
  assert.throws(() =>
    requireSampleInstrumentsRequest({ sampleId: '/file.wav' }),
  )
  for (const overrides of [
    { token: 'invalid' },
    { instrumentIds: [id, id] },
    { instrumentIds: ['/file.wav'] },
    { instrumentIds: Array.from({ length: 1001 }, () => id) },
  ]) {
    assert.throws(() =>
      requireSampleInstrumentsSaveRequest({
        sampleId: id,
        token,
        instrumentIds: [],
        ...overrides,
      }),
    )
  }
  assert.equal(
    isSampleInstrumentsSnapshot({ sampleId: id, token, instruments: [] }),
    true,
  )
  assert.equal(
    isSampleInstrumentsSnapshot({
      sampleId: id,
      token,
      instruments: [
        { id, name: 'Kick' },
        { id, name: 'Kick' },
      ],
    }),
    false,
  )
})
