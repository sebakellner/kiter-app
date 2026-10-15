import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeName } from './classification.ts'

test('classification keys ignore external whitespace/case but preserve accents and internal spaces', () => {
  assert.equal(normalizeName('  DRUMS  '), 'drums')
  assert.equal(
    normalizeName('Électronique'),
    normalizeName(' E\u0301LECTRONIQUE '),
  )
  assert.notEqual(normalizeName('Électronique'), normalizeName('Electronique'))
  assert.notEqual(normalizeName('Hi Hat'), normalizeName('Hi  Hat'))
})
