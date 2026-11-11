import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN_FOLDERS = ['primitives', 'semantic']
const ALIAS = /^\{([^{}]+)\}$/

/**
 * Builds the two token families that cannot be Figma variables: typography
 * composites become text styles and shadow composites become effect styles.
 *
 * Styles are push-only. A designer edit in Figma does not come back yet; the
 * repository stays the single source of truth, so this module only reads
 * `tokens/**\/*.json` and never writes.
 */
export function buildStyles(repoRoot = process.cwd()) {
  const tree = readRepositoryTree(repoRoot)
  const leaves = flattenLeaves(tree, [], [])
  return {
    text: buildTextStyles(tree, leaves),
    effects: buildEffectStyles(tree, leaves),
  }
}

function buildTextStyles(tree, leaves) {
  const styles = []
  for (const leaf of leaves) {
    if (leaf.token.$type !== 'typography') {
      continue
    }
    const style = toTextStyle(tree, leaf)
    if (style) {
      styles.push(style)
    }
  }
  return styles
}

function buildEffectStyles(tree, leaves) {
  const styles = []
  for (const leaf of leaves) {
    if (leaf.token.$type !== 'shadow') {
      continue
    }
    const style = toEffectStyle(tree, leaf)
    if (style) {
      styles.push(style)
    }
  }
  return styles
}

/**
 * One text style. `fontFamily` is a fallback list in the repository and a
 * single family in Figma, `lineHeight` is a unitless multiplier that Figma
 * stores in pixels, and `letterSpacing` is a DTCG dimension whose numeric part
 * is the pixel value.
 */
function toTextStyle(tree, leaf) {
  const value = leaf.token.$value
  if (!isPlainObject(value)) {
    return undefined
  }
  const family = resolveValue(tree, value.fontFamily)
  const fontFamily = Array.isArray(family) ? family[0] : family
  const fontSize = toNumber(resolveValue(tree, value.fontSize))
  const fontWeight = toNumber(resolveValue(tree, value.fontWeight))
  const multiplier = toNumber(resolveValue(tree, value.lineHeight))
  const letterSpacing = toNumber(resolveValue(tree, value.letterSpacing))
  if (
    typeof fontFamily !== 'string' ||
    fontFamily === '' ||
    fontSize === undefined ||
    fontWeight === undefined ||
    multiplier === undefined ||
    letterSpacing === undefined
  ) {
    return undefined
  }
  return {
    name: styleName(leaf.path),
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight: Math.round(fontSize * multiplier),
    letterSpacing,
  }
}

/**
 * One effect style. A shadow token may alias another composite, so the value is
 * resolved first; DTCG allows a list of shadows in a single token.
 */
function toEffectStyle(tree, leaf) {
  const value = resolveValue(tree, leaf.token.$value)
  const composites = Array.isArray(value) ? value : [value]
  const effects = []
  for (const composite of composites) {
    const effect = toFigmaEffect(tree, composite)
    if (effect) {
      effects.push(effect)
    }
  }
  if (effects.length === 0) {
    return undefined
  }
  return { name: styleName(leaf.path), effects }
}

function toFigmaEffect(tree, shadow) {
  if (!isPlainObject(shadow)) {
    return undefined
  }
  const color = resolveValue(tree, shadow.color)
  const offsetX = toNumber(resolveValue(tree, shadow.offsetX))
  const offsetY = toNumber(resolveValue(tree, shadow.offsetY))
  const radius = toNumber(resolveValue(tree, shadow.blur))
  const spread = toNumber(resolveValue(tree, shadow.spread))
  if (
    !isColorObject(color) ||
    offsetX === undefined ||
    offsetY === undefined ||
    radius === undefined ||
    spread === undefined
  ) {
    return undefined
  }
  return {
    type: shadow.inset === true ? 'INNER_SHADOW' : 'DROP_SHADOW',
    // Repository channels are already 0..1, which is what Figma stores.
    color: {
      r: color.components[0],
      g: color.components[1],
      b: color.components[2],
      a: typeof color.alpha === 'number' ? color.alpha : 1,
    },
    offset: { x: offsetX, y: offsetY },
    radius,
    spread,
    visible: true,
    blendMode: 'NORMAL',
  }
}

// The Figma name is the token path with `/` separators, like a variable.
function styleName(path) {
  return path.join('/')
}

/**
 * Resolves `{group.token}` against the whole repository tree. A literal value,
 * including an already resolved one, is returned as is.
 */
function resolveValue(tree, value) {
  if (typeof value !== 'string') {
    return value
  }
  const alias = ALIAS.exec(value.trim())
  if (!alias) {
    return value
  }
  const target = nodeAtPath(tree, alias[1].split('.'))
  return isTokenLeaf(target) ? target.$value : value
}

function nodeAtPath(tree, path) {
  let current = tree
  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

// A number, or the numeric part of a DTCG dimension, in pixels.
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (isDimensionObject(value)) {
    return value.value
  }
  return undefined
}

function readRepositoryTree(repoRoot) {
  const tree = {}
  for (const folder of TOKEN_FOLDERS) {
    mergeInto(tree, readFolder(repoRoot, folder))
  }
  return tree
}

function readFolder(repoRoot, folder) {
  const directory = join(repoRoot, 'tokens', folder)
  const names = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  const tree = {}
  for (const name of names) {
    mergeInto(tree, JSON.parse(readFileSync(join(directory, name), 'utf8')))
  }
  return tree
}

// Leaves keep repository order: primitives first, then semantic, so a style is
// always reported in the same order.
function flattenLeaves(node, path, leaves) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) {
      continue
    }
    if (isTokenLeaf(value)) {
      leaves.push({ path: [...path, key], token: value })
      continue
    }
    if (isPlainObject(value)) {
      flattenLeaves(value, [...path, key], leaves)
    }
  }
  return leaves
}

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
}

function isColorObject(value) {
  return (
    isPlainObject(value) &&
    Array.isArray(value.components) &&
    value.components.length === 3
  )
}

function isDimensionObject(value) {
  return (
    isPlainObject(value) &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string'
  )
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
