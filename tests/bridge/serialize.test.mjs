import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { serializeTokens } from '../../scripts/tokens-bridge/serialize.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const TOKEN_FOLDERS = ['primitives', 'semantic']

// The real token files are the specification of the write dialect: the bridge
// must reproduce them exactly, so a pull that changes one value cannot drag a
// formatting change into the same commit.
const tokenFiles = TOKEN_FOLDERS.flatMap((folder) =>
  readdirSync(join(repoRoot, 'tokens', folder))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `tokens/${folder}/${name}`),
)

test('every token file round-trips byte for byte', () => {
  assert.equal(tokenFiles.length, 13)

  const failures = []
  for (const relPath of tokenFiles) {
    const raw = readFileSync(join(repoRoot, relPath), 'utf8')
    const serialized = serializeTokens(JSON.parse(raw))
    if (serialized !== raw) {
      failures.push(describeDifference(relPath, raw, serialized))
    }
  }

  assert.deepEqual(
    failures,
    [],
    `serializer does not reproduce the repository:\n${failures.join('\n')}`,
  )
})

test('orders $description first, then integer keys, then insertion order', () => {
  const value = { 2: 'two', a: 'a', 10: 'ten', $description: 'note' }

  assert.equal(
    serializeTokens(value),
    [
      '{',
      '  "$description": "note",',
      '  "2": "two",',
      '  "10": "ten",',
      '  "a": "a"',
      '}',
      '',
    ].join('\n'),
  )

  // The same order applies inside a value, where the keys share a line.
  const token = {
    space: {
      steps: { $value: { 4: 'b', c: 'c', 2: 'a' }, $type: 'string' },
    },
  }
  assert.equal(
    serializeTokens(token),
    [
      '{',
      '  "space": {',
      '    "steps": { "$value": { "2": "a", "4": "b", "c": "c" }, "$type": "string" }',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
})

test('expands a group and keeps a short token on one line', () => {
  const short = {
    radius: {
      control: { $value: { value: 4, unit: 'px' }, $type: 'dimension' },
    },
  }
  assert.equal(
    serializeTokens(short),
    [
      '{',
      '  "radius": {',
      '    "control": { "$value": { "value": 4, "unit": "px" }, "$type": "dimension" }',
      '  }',
      '}',
      '',
    ].join('\n'),
    'a group is a section and never shares a line, even when it would fit',
  )

  const long = {
    radius: {
      control: {
        $description:
          'Control corners use the 4px step shared with spacing so inputs and cards read as one family.',
        $type: 'dimension',
        $value: { value: 4, unit: 'px' },
      },
    },
  }
  assert.equal(
    serializeTokens(long),
    [
      '{',
      '  "radius": {',
      '    "control": {',
      '      "$description": "Control corners use the 4px step shared with spacing so inputs and cards read as one family.",',
      '      "$type": "dimension",',
      '      "$value": { "value": 4, "unit": "px" }',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'),
    'a token whose single line exceeds 80 columns expands',
  )
})

test('a value change in a real file is a single-line difference', () => {
  const relPath = 'tokens/primitives/radius.json'
  const raw = readFileSync(join(repoRoot, relPath), 'utf8')
  const data = JSON.parse(raw)
  data.radius['8'].$value.value = 9

  const serialized = serializeTokens(data)
  const before = raw.split('\n')
  const after = serialized.split('\n')
  assert.equal(after.length, before.length, 'line count must not change')

  const changed = after.filter((line, index) => line !== before[index])
  assert.deepEqual(
    changed,
    [
      '    "8": { "$value": { "value": 9, "unit": "px" }, "$type": "dimension" }',
    ],
    'only the line that carries the new value may differ',
  )
})

// Reports the first differing line of a file so a regression names the rule it
// broke instead of a wall of text.
function describeDifference(relPath, expected, actual) {
  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')
  const total = Math.max(expectedLines.length, actualLines.length)

  let first = -1
  let differing = 0
  for (let index = 0; index < total; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      differing += 1
      if (first === -1) {
        first = index
      }
    }
  }

  const at = first === -1 ? total : first
  return [
    `${relPath}: ${differing} line(s) differ, first at line ${at + 1}`,
    `  expected: ${String(JSON.stringify(expectedLines[at]))}`,
    `  actual:   ${String(JSON.stringify(actualLines[at]))}`,
  ].join('\n')
}
