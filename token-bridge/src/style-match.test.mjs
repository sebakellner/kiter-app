// The reverse direction for text styles: a Figma style is a flattened snapshot
// and a repository typography token is a composite of references, so the only
// safe inversion compares values and never invents a reference.
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { applyStylePull } from './pull-styles.mjs'
import { serializeTokens } from './serialize.mjs'
import { matchTextStyles } from './style-match.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// Exactly what the push produces for typography/body: every value is what the
// composite already resolves to, so a style holding these numbers is unchanged.
const BODY = {
  name: 'typography/body',
  fontFamily: 'Instrument Sans',
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 21,
  letterSpacing: 0,
}

function style(overrides = {}) {
  return { ...BODY, ...overrides }
}

function buildStub() {
  const calls = []
  return {
    calls,
    runBuild: (root) => {
      calls.push(root)
    },
  }
}

test('reports a style the composite already produces as unchanged', () => {
  const { proposals, report } = matchTextStyles({
    repoRoot,
    styles: [style()],
  })

  assert.deepEqual(proposals, [])
  assert.deepEqual(report, {
    changed: [],
    unchanged: ['typography/body'],
    unmatched: [],
    diverged: [],
    missingToken: [],
  })
})

test('proposes the primitive a changed font size matches (S2)', () => {
  const { proposals, report } = matchTextStyles({
    repoRoot,
    styles: [style({ fontSize: 18 })],
  })

  assert.deepEqual(
    report.changed.map((entry) => entry.name),
    ['typography/body'],
  )
  assert.deepEqual(report.unchanged, [])
  assert.deepEqual(report.unmatched, [])
  assert.deepEqual(report.diverged, [])
  assert.deepEqual(report.missingToken, [])

  assert.equal(proposals.length, 1)
  assert.equal(proposals[0].path, 'typography.body')
  assert.deepEqual(proposals[0].current, {
    fontFamily: '{font.family.instrument-sans}',
    fontSize: '{font.size.14}',
    fontWeight: '{font.weight.400}',
    letterSpacing: '{font.letter-spacing.normal}',
    lineHeight: '{font.line-height.normal}',
  })
  assert.deepEqual(proposals[0].next, {
    fontFamily: '{font.family.instrument-sans}',
    fontSize: '{font.size.18}',
    fontWeight: '{font.weight.400}',
    letterSpacing: '{font.letter-spacing.normal}',
    lineHeight: '{font.line-height.normal}',
  })
  // The proposal keeps the property order the repository file already uses.
  assert.deepEqual(
    Object.keys(proposals[0].next),
    Object.keys(proposals[0].current),
  )
})

test('reports a value with no primitive and writes nothing (S6)', () => {
  const { proposals, report } = matchTextStyles({
    repoRoot,
    styles: [style({ fontSize: 15 })],
  })

  assert.deepEqual(proposals, [])
  assert.deepEqual(report.unmatched, [
    { name: 'typography/body', property: 'fontSize', value: 15 },
  ])
  assert.deepEqual(report.changed, [])
  assert.deepEqual(report.unchanged, [])
  assert.deepEqual(report.missingToken, [])
})

test('reports a line height the composite cannot express', () => {
  const { proposals, report } = matchTextStyles({
    repoRoot,
    styles: [style({ lineHeight: 30 })],
  })

  assert.deepEqual(proposals, [])
  assert.deepEqual(report.diverged, [
    { name: 'typography/body', expected: 21, actual: 30 },
  ])
  assert.deepEqual(report.changed, [])
  assert.deepEqual(report.unchanged, [])
})

test('reports a style name with no typography token', () => {
  const { proposals, report } = matchTextStyles({
    repoRoot,
    styles: [style({ name: 'typography/unknown' })],
  })

  assert.deepEqual(proposals, [])
  assert.deepEqual(report.missingToken, ['typography/unknown'])
  assert.deepEqual(report.unchanged, [])
})

test('matches each property only inside its own primitive group', () => {
  // `fontSize: 4` has no `font.size.*` token even though `space.4` is 16px and
  // a weight of 400 exists: groups are never crossed.
  const { report } = matchTextStyles({
    repoRoot,
    styles: [style({ fontSize: 400 })],
  })

  assert.deepEqual(report.unmatched, [
    { name: 'typography/body', property: 'fontSize', value: 400 },
  ])
})

// A miniature repository in the committed dialect, so a write can be compared
// line by line without touching the real tokens/ tree.
const FIXTURE = {
  'tokens/primitives/color.json': {
    color: {
      white: {
        $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#FFFFFF' },
        $type: 'color',
      },
    },
  },
  'tokens/primitives/typography.json': {
    font: {
      $description: 'Raw typography values.',
      size: {
        14: { $value: { value: 14, unit: 'px' }, $type: 'dimension' },
        18: { $value: { value: 18, unit: 'px' }, $type: 'dimension' },
      },
      family: {
        'instrument-sans': {
          $description: 'The shared UI family.',
          $value: ['Instrument Sans', 'sans-serif'],
          $type: 'fontFamily',
        },
      },
      weight: { 400: { $value: 400, $type: 'fontWeight' } },
      'line-height': { normal: { $value: 1.5, $type: 'number' } },
      'letter-spacing': {
        normal: { $value: { value: 0, unit: 'px' }, $type: 'dimension' },
      },
    },
  },
  'tokens/semantic/color.json': {
    color: {
      action: {
        primary: {
          $value: '{color.white}',
          $type: 'color',
          $description: 'The only accent for primary actions.',
        },
      },
    },
  },
  'tokens/semantic/typography.json': {
    typography: {
      $description: 'Composite text styles.',
      body: {
        $description: 'Default reading text.',
        $type: 'typography',
        $value: {
          fontFamily: '{font.family.instrument-sans}',
          fontSize: '{font.size.14}',
          fontWeight: '{font.weight.400}',
          letterSpacing: '{font.letter-spacing.normal}',
          lineHeight: '{font.line-height.normal}',
        },
      },
      caption: {
        $description: 'Supporting metadata.',
        $type: 'typography',
        $value: {
          fontFamily: '{font.family.instrument-sans}',
          fontSize: '{font.size.14}',
          fontWeight: '{font.weight.400}',
          letterSpacing: '{font.letter-spacing.normal}',
          lineHeight: '{font.line-height.normal}',
        },
      },
    },
  },
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kiter-tokens-styles-'))
  for (const [relPath, data] of Object.entries(FIXTURE)) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, serializeTokens(data))
  }
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })
  return root
}

function listFiles(root) {
  return ['primitives', 'semantic'].flatMap((folder) =>
    readdirSync(join(root, 'tokens', folder))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => `tokens/${folder}/${name}`),
  )
}

function snapshot(root) {
  const files = {}
  for (const relPath of listFiles(root)) {
    files[relPath] = readFileSync(join(root, relPath), 'utf8')
  }
  return files
}

test('writes only the changed composite in the file that owns it (S7)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { calls, runBuild } = buildStub()

  const { report, written } = await applyStylePull({
    repoRoot: root,
    styles: [style({ name: 'typography/caption' }), style({ fontSize: 18 })],
    runBuild,
  })

  assert.deepEqual(written, ['tokens/semantic/typography.json'])
  assert.deepEqual(calls, [root])
  assert.deepEqual(report.unchanged, ['typography/caption'])
  assert.deepEqual(
    report.changed.map((entry) => entry.name),
    ['typography/body'],
  )

  const after = snapshot(root)
  for (const relPath of Object.keys(before)) {
    if (relPath === 'tokens/semantic/typography.json') {
      continue
    }
    assert.equal(after[relPath], before[relPath], `${relPath} is untouched`)
  }

  // The diff is the one value that changed: same line count, one differing line.
  const beforeLines = before['tokens/semantic/typography.json'].split('\n')
  const afterLines = after['tokens/semantic/typography.json'].split('\n')
  assert.equal(afterLines.length, beforeLines.length)
  const differing = afterLines
    .map((line, index) => (line === beforeLines[index] ? undefined : index))
    .filter((index) => index !== undefined)
  assert.equal(differing.length, 1)
  assert.equal(
    afterLines[differing[0]],
    '        "fontSize": "{font.size.18}",',
  )

  // Every $description survives, and only the body composite moved.
  const text = after['tokens/semantic/typography.json']
  assert.match(text, /"\$description": "Composite text styles\."/)
  assert.match(text, /"\$description": "Default reading text\."/)
  assert.match(text, /"\$description": "Supporting metadata\."/)
  const data = JSON.parse(text)
  assert.equal(data.typography.body.$description, 'Default reading text.')
  assert.deepEqual(data.typography.body.$value, {
    fontFamily: '{font.family.instrument-sans}',
    fontSize: '{font.size.18}',
    fontWeight: '{font.weight.400}',
    letterSpacing: '{font.letter-spacing.normal}',
    lineHeight: '{font.line-height.normal}',
  })
  assert.deepEqual(
    data.typography.caption,
    FIXTURE['tokens/semantic/typography.json'].typography.caption,
  )

  // A second pull of the same styles has nothing left to write.
  const second = await applyStylePull({
    repoRoot: root,
    styles: [style({ name: 'typography/caption' }), style({ fontSize: 18 })],
    runBuild,
  })
  assert.deepEqual(second.written, [])
  assert.deepEqual(snapshot(root), after)
})

test('writes nothing but still builds when no style changed (S8)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { calls, runBuild } = buildStub()

  const { report, written } = await applyStylePull({
    repoRoot: root,
    styles: [
      style({ name: 'typography/body' }),
      style({ name: 'typography/caption' }),
    ],
    runBuild,
  })

  assert.deepEqual(written, [])
  assert.deepEqual(calls, [root])
  assert.deepEqual(report.changed, [])
  assert.deepEqual(snapshot(root), before)
})

test('writes nothing for an unmatched, divergent or missing style (S6)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { calls, runBuild } = buildStub()

  const { report, written } = await applyStylePull({
    repoRoot: root,
    styles: [
      style({ fontSize: 15 }),
      style({ lineHeight: 40 }),
      style({ name: 'typography/unknown' }),
    ],
    runBuild,
  })

  assert.deepEqual(written, [])
  assert.deepEqual(calls, [root])
  assert.deepEqual(report.unmatched, [
    { name: 'typography/body', property: 'fontSize', value: 15 },
  ])
  assert.deepEqual(report.diverged, [
    { name: 'typography/body', expected: 21, actual: 40 },
  ])
  assert.deepEqual(report.missingToken, ['typography/unknown'])
  assert.deepEqual(snapshot(root), before)
})
