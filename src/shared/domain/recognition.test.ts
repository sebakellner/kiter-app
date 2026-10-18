import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recognitionKey, recognitionTokens } from './recognition.ts'

test('case boundaries split recognition clues without changing stored alias keys', () => {
  assert.deepEqual(recognitionTokens('100_VintageDrums_05_TL', true), [
    '100',
    'vintage',
    'drums',
    '05',
    'tl',
  ])
  assert.deepEqual(recognitionTokens('vintageDrums_kick01_808Bass', true), [
    'vintage',
    'drums',
    'kick01',
    '808bass',
  ])
  assert.deepEqual(recognitionTokens('E\u0301te\u0301Drums', true), [
    'été',
    'drums',
  ])
  assert.deepEqual(recognitionTokens('VINTAGEDRUMS', true), ['vintagedrums'])
  assert.equal(recognitionKey('HipHop'), 'hiphop')
  assert.equal(recognitionKey('hiphop'), 'hiphop')
})
