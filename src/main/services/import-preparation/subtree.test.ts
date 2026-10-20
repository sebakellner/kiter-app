import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { requireSubtreeScope } from './subtree.ts'

test('Windows subtree scopes accept either separator and normalize to native snapshot paths', () => {
  for (const scope of [
    'Drums/Kicks',
    'Drums\\Kicks',
    'Drums/Kicks/',
    'Drums\\\\Kicks\\',
    'Drums/\\Kicks',
  ]) {
    assert.equal(requireSubtreeScope(scope, path.win32), 'Drums\\Kicks')
  }
  assert.equal(requireSubtreeScope('', path.win32), '')
  assert.equal(
    requireSubtreeScope('Dru\u0301ms/🎵', path.win32),
    'Dru\u0301ms\\🎵',
  )
})

test('Windows absolute, drive-relative, UNC and traversal scopes reject before normalization', () => {
  for (const scope of [
    'C:\\audio',
    'C:/audio',
    'C:audio',
    '/audio',
    '\\audio',
    '\\\\server\\share',
    '../audio',
    '..\\audio',
    'sub/../audio',
    'sub\\.\\audio',
    'sub/..\\audio',
    'sub\0folder',
  ]) {
    assert.throws(() => requireSubtreeScope(scope, path.win32), {
      code: 'INVALID_INPUT',
    })
  }
})

test('POSIX subtree scopes normalize separators but preserve literal backslash folder names', () => {
  assert.equal(requireSubtreeScope('', path.posix), '')
  assert.equal(requireSubtreeScope('Drums//Kicks/', path.posix), 'Drums/Kicks')
  assert.equal(requireSubtreeScope('Drums\\Kicks', path.posix), 'Drums\\Kicks')
  assert.equal(
    requireSubtreeScope('Drums\\Kicks/sub', path.posix),
    'Drums\\Kicks/sub',
  )
  for (const scope of [
    '/audio',
    '//audio',
    '../audio',
    'sub/../audio',
    'sub/./audio',
    'sub\0folder',
  ]) {
    assert.throws(() => requireSubtreeScope(scope, path.posix), {
      code: 'INVALID_INPUT',
    })
  }
})
