import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { folderOwners, TOKEN_FOLDERS, variableName } from './names.mjs'

const ALIAS = /^\{([^{}]+)\}$/

/**
 * Builds the two token families that cannot be Figma variables: typography
 * composites become text styles and shadow composites become effect styles.
 *
 * A text style comes back from Figma through `style-match.mjs`, which compares
 * it against exactly these values. Effect styles are still push-only. This
 * module only reads `tokens/**\/*.json` and never writes.
 */
export function buildStyles(repoRoot = process.cwd()) {
  const { tree, owners } = readRepository(repoRoot)
  const leaves = flattenLeaves(tree, [], [])
  return {
    text: buildTextStyles(tree, leaves, owners),
    effects: buildEffectStyles(tree, leaves),
  }
}

function buildTextStyles(tree, leaves, owners) {
  const styles = []
  for (const leaf of leaves) {
    if (leaf.token.$type !== 'typography') {
      continue
    }
    const style = toTextStyle(tree, leaf, owners)
    if (style) {
      styles.push(style)
    }
  }
  // Figma keeps the order styles were created in, so the scale order is fixed
  // here and the panel reads top to bottom as a type scale.
  return styles.sort(
    (left, right) =>
      left.fontSize - right.fontSize || left.name.localeCompare(right.name),
  )
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
  return styles.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * One text style. `fontFamily` is a fallback list in the repository and a
 * single family in Figma, `lineHeight` is a unitless multiplier that Figma
 * stores in pixels, and `letterSpacing` is a DTCG dimension whose numeric part
 * is the pixel value.
 *
 * `bindings` names the variable each bindable property should point at, so the
 * style stops carrying a second copy of a value the variables already own.
 */
function toTextStyle(tree, leaf, owners) {
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
    // Figma stores a line height in pixels and the repository stores a
    // multiplier, so this literal is the product and has no variable to bind
    // to. Binding it would need a token for e.g. 21px that does not exist.
    lineHeight: Math.round(fontSize * multiplier),
    letterSpacing,
    bindings: textBindings(value, owners),
  }
}

/**
 * The variable names a text style binds, taken from the composite's own aliases
 * so a binding can never drift from the token it came from. A property holding
 * a literal has no variable to point at and gets no entry; `fontFamily` is out
 * of scope because its token is a fallback array the push does not turn into a
 * variable.
 */
function textBindings(value, owners) {
  const bindings = {}
  const fontSize = aliasName(value.fontSize, owners)
  if (fontSize) {
    bindings.fontSize = fontSize
  }
  const letterSpacing = aliasName(value.letterSpacing, owners)
  if (letterSpacing) {
    bindings.letterSpacing = letterSpacing
  }
  return bindings
}

// `{font.size.14}` -> `primitives/font/size/14`: a binding names the variable,
// and the variable name starts with the folder that owns the target token.
function aliasName(value, owners) {
  const alias = aliasOf(value)
  if (alias === undefined) {
    return undefined
  }
  const folder = owners.get(alias)
  return folder === undefined ? undefined : variableName(folder, alias)
}

// The reference a DTCG alias string carries, or undefined for a literal.
function aliasOf(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = ALIAS.exec(value.trim())
  return match ? match[1] : undefined
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
  const alias = aliasOf(value)
  if (alias === undefined) {
    return value
  }
  const target = nodeAtPath(tree, alias.split('.'))
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

export function readRepositoryTree(repoRoot) {
  return readRepository(repoRoot).tree
}

/**
 * The repository tree, with both folders combined, plus the folder each token
 * path belongs to. A style name carries no folder, but the variable a binding
 * names does, so the owner has to travel with the tree.
 */
export function readRepository(repoRoot = process.cwd()) {
  const folderTrees = {}
  for (const folder of TOKEN_FOLDERS) {
    folderTrees[folder] = readFolder(repoRoot, folder)
  }
  const tree = {}
  for (const folder of TOKEN_FOLDERS) {
    mergeInto(tree, folderTrees[folder])
  }
  return { tree, owners: folderOwners(folderTrees) }
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

/**
 * The text style the push would produce for one token path, or `undefined` when
 * the repository has no complete composite there. The reverse direction uses it
 * so both directions share one resolution rule and one rounding rule.
 */
export function textStyleAt(tree, path, owners) {
  const node = nodeAtPath(tree, path)
  if (!isTokenLeaf(node)) {
    return undefined
  }
  return toTextStyle(tree, { path, token: node }, owners)
}

/** Every token leaf with its path, in repository order. */
export function tokenLeaves(tree) {
  return flattenLeaves(tree, [], [])
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
