import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

import { encodeLeaf } from '../../scripts/tokens-bridge/inverse.mjs'
import { mergePayload } from '../../scripts/tokens-bridge/merge.mjs'
import { projectTokens } from '../../scripts/tokens-bridge/project.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

function readTokenSet(setName) {
  const directory = join(repoRoot, 'tokens', setName)
  const tree = {}
  const names = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  for (const name of names) {
    const source = readFileSync(join(directory, name), 'utf8')
    deepMerge(tree, JSON.parse(source))
  }
  return tree
}

function readRepoTree() {
  return {
    primitives: readTokenSet('primitives'),
    semantic: readTokenSet('semantic'),
  }
}

function groupDescriptionPaths(node, prefix = []) {
  if (!isPlainObject(node) || isTokenLeaf(node)) {
    return []
  }
  const found = Object.hasOwn(node, '$description') ? [prefix.join('.')] : []
  for (const [key, value] of Object.entries(node)) {
    found.push(...groupDescriptionPaths(value, [...prefix, key]))
  }
  return found
}

test('projecting and merging the inverse payload reproduces tokens/ (S8)', () => {
  const canonical = readRepoTree()
  const projected = projectTokens(repoRoot)
  const mergeInput = readRepoTree()

  const { tree, report } = mergePayload(mergeInput, projected)

  assert.deepEqual(tree, canonical)
  assert.deepEqual(mergeInput, canonical)
  assert.deepEqual(report, { changed: [], added: [], untouched: 0 })
})

test('flattens shadow composites to CSS strings and rebuilds them (S3)', () => {
  const primitives = projectTokens(repoRoot).primitives
  const canonical = readTokenSet('primitives')

  const black = primitives.shadow['black-28']
  assert.equal(black.$type, 'shadow')
  assert.equal(black.$value, '0px 12px 36px 0px rgba(0, 0, 0, 0.28)')

  const inset = primitives.shadow['inset-yellow-500']
  assert.equal(inset.$type, 'shadow')
  assert.equal(inset.$value, '3px 0px 0px 0px #FFC800 inset')

  assert.deepEqual(
    encodeLeaf(canonical.shadow['black-28'], black.$value),
    canonical.shadow['black-28'].$value,
  )
  assert.deepEqual(
    encodeLeaf(canonical.shadow['inset-yellow-500'], inset.$value),
    canonical.shadow['inset-yellow-500'].$value,
  )
})

test('flattens colors, dimensions and numbers on real tokens', () => {
  const projected = projectTokens(repoRoot)
  const primitives = projected.primitives
  const canonical = readTokenSet('primitives')

  assert.equal(primitives.color.slate['300'].$value, '#BFC0C2')
  assert.equal(
    primitives.color['black-alpha']['28'].$value,
    'rgba(0, 0, 0, 0.28)',
  )
  assert.equal(primitives.color.transparent.$value, 'rgba(0, 0, 0, 0)')
  assert.equal(primitives.space['4'].$value, '16px')
  assert.equal(primitives.radius['8'].$value, '8px')
  assert.equal(primitives.opacity['50'].$value, 0.5)
  assert.equal(primitives.opacity['50'].$type, 'number')
  assert.equal(primitives.font.weight['600'].$value, 600)
  assert.deepEqual(primitives.font.family['instrument-sans'].$value, [
    'Instrument Sans',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'sans-serif',
  ])
  assert.equal(
    projected.semantic.color.action.primary.$value,
    '{color.yellow.500}',
  )

  assert.deepEqual(encodeLeaf(canonical.space['4'], '16px'), {
    value: 16,
    unit: 'px',
  })
  assert.equal(encodeLeaf(canonical.opacity['50'], 0.5), 0.5)
  assert.equal(encodeLeaf(undefined, '#BFC0C2'), '#BFC0C2')
})

test('encodes raw Figma values for dimension and color tokens (T8)', () => {
  const canonical = readTokenSet('primitives')

  assert.deepEqual(encodeLeaf(canonical.space['4'], 16), {
    value: 16,
    unit: 'px',
  })
  assert.deepEqual(encodeLeaf(canonical.radius['8'], 8), {
    value: 8,
    unit: 'px',
  })
  assert.deepEqual(
    encodeLeaf(canonical.color.slate['300'], {
      r: 191 / 255,
      g: 192 / 255,
      b: 194 / 255,
      a: 1,
    }),
    canonical.color.slate['300'].$value,
  )
  assert.deepEqual(
    encodeLeaf(canonical.color.slate['300'], {
      r: 191 / 255,
      g: 192 / 255,
      b: 194 / 255,
    }),
    canonical.color.slate['300'].$value,
  )
  assert.deepEqual(
    encodeLeaf(canonical.color.slate['300'], {
      r: 0.749,
      g: 0.7529411764705882,
      b: 0.7607843137254902,
      a: 1,
    }),
    canonical.color.slate['300'].$value,
  )
  assert.deepEqual(
    encodeLeaf(canonical.color['black-alpha']['28'], {
      r: 0,
      g: 0,
      b: 0,
      a: 0.28,
    }),
    canonical.color['black-alpha']['28'].$value,
  )
  const translucent = encodeLeaf(canonical.color['black-alpha']['28'], {
    r: 0,
    g: 0,
    b: 0,
    a: 0.5,
  })
  assert.deepEqual(translucent, {
    colorSpace: 'srgb',
    components: [0, 0, 0],
    alpha: 0.5,
  })
  assert.equal(Object.hasOwn(translucent, 'hex'), false)

  const effects = [{ type: 'DROP_SHADOW', radius: 4 }]
  assert.deepEqual(encodeLeaf(canonical.shadow['black-28'], effects), effects)
})

test('keeps a token that the payload omits (S6)', () => {
  const payload = projectTokens(repoRoot)
  delete payload.primitives.color.slate['300']
  delete payload.semantic.color.action.primary

  const canonical = readRepoTree()
  const { tree, report } = mergePayload(canonical, payload)

  assert.deepEqual(
    tree.primitives.color.slate['300'],
    canonical.primitives.color.slate['300'],
  )
  assert.deepEqual(
    tree.semantic.color.action.primary,
    canonical.semantic.color.action.primary,
  )
  assert.equal(report.untouched, 2)
  assert.deepEqual(report.added, [])
})

test('never takes $description from the payload (S7)', () => {
  const payload = projectTokens(repoRoot)
  payload.primitives.color.black = {
    $type: 'color',
    $value: '#111111',
    $description: 'Edited in Figma',
  }
  payload.primitives.color.slate['300'] = {
    $type: 'color',
    $value: '#000000',
    $description: 'Edited in Figma',
  }

  const canonical = readRepoTree()
  const { tree, report } = mergePayload(canonical, payload)

  assert.equal(
    tree.primitives.color.black.$description,
    canonical.primitives.color.black.$description,
  )
  assert.deepEqual(tree.primitives.color.black.$value, {
    colorSpace: 'srgb',
    components: [17 / 255, 17 / 255, 17 / 255],
    hex: '#111111',
  })
  assert.equal(
    Object.hasOwn(tree.primitives.color.slate['300'], '$description'),
    false,
  )
  assert.equal(
    tree.primitives.color.slate.$description,
    canonical.primitives.color.slate.$description,
  )
  assert.deepEqual(report.changed, [
    { path: 'color.slate.300', from: '#BFC0C2', to: '#000000' },
    { path: 'color.black', from: '#000000', to: '#111111' },
  ])
})

test('reports payload tokens that the repository does not have', () => {
  const payload = projectTokens(repoRoot)
  payload.primitives.color.slate['301'] = {
    $type: 'color',
    $value: '#123456',
  }

  const canonical = readRepoTree()
  const { tree, report } = mergePayload(canonical, payload)

  assert.deepEqual(tree, canonical)
  assert.deepEqual(report.added, ['color.slate.301'])
  assert.deepEqual(report.changed, [])
})

test('drops group $description and keeps token $description (S7)', () => {
  const projected = projectTokens(repoRoot)

  assert.deepEqual(groupDescriptionPaths(projected.primitives), [])
  assert.deepEqual(groupDescriptionPaths(projected.semantic), [])
  assert.equal(projected.primitives.color.slate.$description, undefined)
  assert.equal(projected.semantic.typography.$description, undefined)
  assert.equal(typeof projected.primitives.color.black.$description, 'string')
  assert.equal(
    typeof projected.primitives.font.family['instrument-sans'].$description,
    'string',
  )
  assert.equal(
    typeof projected.semantic.typography.caption.$description,
    'string',
  )
})

test('snaps a float32 alpha back to the repository value (S8)', () => {
  const token = {
    $type: 'color',
    $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.28 },
  }
  const encoded = encodeLeaf(token, { r: 0, g: 0, b: 0, a: 0.2800000011920929 })
  assert.deepEqual(encoded, {
    colorSpace: 'srgb',
    components: [0, 0, 0],
    alpha: 0.28,
  })
})
