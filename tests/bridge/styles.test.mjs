import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  mergeTokenTrees,
  projectTokens,
  toFigmaTree,
} from '../../scripts/tokens-bridge/project.mjs'
import { buildStyles } from '../../scripts/tokens-bridge/styles.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function styleNamed(styles, name) {
  const found = styles.find((style) => style.name === name)
  assert.ok(found, `expected a style named ${name}`)
  return found
}

function figmaTree() {
  const { primitives, semantic } = projectTokens(repoRoot)
  return toFigmaTree(mergeTokenTrees(primitives, semantic))
}

// Every scalar or object leaf of the projected tree, with its `/` path, so a
// test can assert what Figma is about to receive without knowing the shape.
function leafEntries(node, prefix = []) {
  const entries = []
  for (const [key, value] of Object.entries(node)) {
    const path = [...prefix, key]
    if (isPlainObject(value) && !isRawValue(value)) {
      entries.push(...leafEntries(value, path))
      continue
    }
    entries.push({ path: path.join('/'), value })
  }
  return entries
}

function isRawValue(value) {
  return typeof value.alias === 'string' || typeof value.r === 'number'
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test('builds one text style per typography composite (S1)', () => {
  const { text } = buildStyles(repoRoot)

  assert.equal(text.length, 11)
  assert.deepEqual(
    text.map((style) => style.name),
    [
      'typography/caption',
      'typography/label',
      'typography/control',
      'typography/control-strong',
      'typography/body',
      'typography/body-strong',
      'typography/section',
      'typography/title',
      'typography/display/small',
      'typography/display/medium',
      'typography/display/large',
    ],
  )

  // Every property is resolved from tokens/semantic/typography.json through the
  // primitives it aliases, so the numbers are the repository numbers.
  assert.deepEqual(styleNamed(text, 'typography/body'), {
    name: 'typography/body',
    fontFamily: 'Instrument Sans',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 21,
    letterSpacing: 0,
  })
  assert.deepEqual(styleNamed(text, 'typography/control-strong'), {
    name: 'typography/control-strong',
    fontFamily: 'Instrument Sans',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 20,
    letterSpacing: 0,
  })
})

test('multiplies the unitless line height by the font size', () => {
  const { text } = buildStyles(repoRoot)

  // 18px * 1.25 = 22.5 -> 23, 48px * 1.25 = 60.
  const section = styleNamed(text, 'typography/section')
  assert.equal(section.fontSize, 18)
  assert.equal(section.lineHeight, 23)

  const display = styleNamed(text, 'typography/display/large')
  assert.equal(display.fontSize, 48)
  assert.equal(display.lineHeight, 60)

  const title = styleNamed(text, 'typography/title')
  assert.equal(title.fontSize, 24)
  assert.equal(title.lineHeight, 30)

  for (const style of text) {
    assert.equal(typeof style.lineHeight, 'number')
    assert.ok(style.lineHeight >= style.fontSize)
  }
})

test('builds one effect style per shadow composite (S3)', () => {
  const { effects } = buildStyles(repoRoot)

  assert.equal(effects.length, 4)
  assert.deepEqual(
    effects.map((style) => style.name),
    [
      'shadow/black-28',
      'shadow/inset-violet-400',
      'shadow/inset-yellow-500',
      'shadow/selection-indicator',
    ],
  )

  assert.deepEqual(styleNamed(effects, 'shadow/black-28'), {
    name: 'shadow/black-28',
    effects: [
      {
        type: 'DROP_SHADOW',
        color: { r: 0, g: 0, b: 0, a: 0.28 },
        offset: { x: 0, y: 12 },
        radius: 36,
        spread: 0,
        visible: true,
        blendMode: 'NORMAL',
      },
    ],
  })

  const inset = styleNamed(effects, 'shadow/inset-yellow-500')
  assert.equal(inset.effects[0].type, 'INNER_SHADOW')
  assert.deepEqual(inset.effects[0].offset, { x: 3, y: 0 })
  assert.deepEqual(inset.effects[0].color, {
    r: 1,
    g: 0.7843137254901961,
    b: 0,
    a: 1,
  })
})

test('resolves a shadow alias to the composite it references', () => {
  const { effects } = buildStyles(repoRoot)

  const inset = styleNamed(effects, 'shadow/inset-yellow-500')
  const alias = styleNamed(effects, 'shadow/selection-indicator')

  assert.deepEqual(alias.effects, inset.effects)
  assert.equal(alias.effects[0].type, 'INNER_SHADOW')
})

test('pushes styles instead of shadow string variables (S3)', () => {
  const tree = figmaTree()

  assert.equal(Object.hasOwn(tree, 'shadow'), false)
  assert.deepEqual(
    leafEntries(tree).filter((entry) =>
      typeof entry.value === 'string'
        ? /inset|px .*rgba/.test(entry.value)
        : false,
    ),
    [],
  )

  // Everything else still travels as a variable.
  assert.deepEqual(tree.color.slate['300'], {
    r: 191 / 255,
    g: 192 / 255,
    b: 194 / 255,
    a: 1,
  })
  assert.equal(tree.space['4'], 16)
  assert.equal(tree.radius['8'], 8)
  assert.equal(tree.opacity['50'], 0.5)
  assert.deepEqual(tree.color.action.primary, { alias: 'color.yellow.500' })
})

test('lists text styles in scale order (S3)', () => {
  const { text } = buildStyles()
  const sizes = text.map((style) => style.fontSize)
  assert.deepEqual(
    sizes,
    [...sizes].sort((left, right) => left - right),
  )
  assert.equal(text[0].name, 'typography/caption')
  assert.equal(text.at(-1).name, 'typography/display/large')
})
