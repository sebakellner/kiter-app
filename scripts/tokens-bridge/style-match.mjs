import { isDeepStrictEqual } from 'node:util'

import { readRepositoryTree, textStyleAt, tokenLeaves } from './styles.mjs'

// Where the primitive a mappable property can point at lives. A property only
// ever matches a token inside its own group: `fontSize: 14` is `font.size.14`,
// never a spacing step that happens to be 14.
const PRIMITIVE_GROUPS = {
  fontFamily: ['font', 'family'],
  fontSize: ['font', 'size'],
  fontWeight: ['font', 'weight'],
  letterSpacing: ['font', 'letter-spacing'],
}

const MAPPABLE = Object.keys(PRIMITIVE_GROUPS)

/**
 * Inverts the composition of a text style by value. A repository `typography.*`
 * token is a composite of references and a Figma style is a flattened snapshot,
 * so the only safe way back is to find the primitive whose value is exactly what
 * Figma holds. Nothing is invented:
 *
 * - a mappable property with no primitive of that exact value is `unmatched`,
 *   reported with the property and the value, and nothing is written;
 * - `lineHeight` is not mappable at all — the repository stores
 *   `fontSize x multiplier` and the style stores the product, so a disagreeing
 *   line height is `diverged` and nothing is written;
 * - `textCase`, `textDecoration` and everything else are ignored, not an error;
 * - a style whose name maps to no typography token is `missingToken`.
 *
 * `unmatched` is reported ahead of `diverged` for the same style: it names a
 * property that has no reference to write, which is the actionable finding. A
 * style is only `changed` when every mappable property matched and the resulting
 * references differ from the composite the repository already has.
 *
 * The module only reads `tokens/**\/*.json`; `proposals` is what the writer in
 * `pull-styles.mjs` applies.
 */
export function matchTextStyles({ repoRoot, styles } = {}) {
  const tree = readRepositoryTree(repoRoot)
  const index = primitiveIndex(tree)
  const report = {
    changed: [],
    unchanged: [],
    unmatched: [],
    diverged: [],
    missingToken: [],
  }
  const proposals = []
  const claimed = new Set()
  for (const style of Array.isArray(styles) ? styles : []) {
    if (!isPlainObject(style)) {
      continue
    }
    const name = typeof style.name === 'string' ? style.name.trim() : ''
    const path = toPath(name)
    const node = nodeAtPath(tree, path)
    const produced = path.length === 0 ? undefined : textStyleAt(tree, path)
    if (!produced || !isTypographyLeaf(node)) {
      // No usable composite: either no token at that path, or a token the push
      // skips because it does not resolve to a complete style.
      report.missingToken.push(name)
      continue
    }
    const outcome = matchStyle({ name, node, produced, style, index })
    if (outcome.kind === 'unmatched') {
      report.unmatched.push(...outcome.entries)
      continue
    }
    if (outcome.kind === 'diverged') {
      report.diverged.push(outcome.entry)
      continue
    }
    if (outcome.kind === 'unchanged') {
      report.unchanged.push(name)
      continue
    }
    // Two styles can carry the same name in Figma, so the first change to a
    // token path is the one proposed; a later duplicate is reported but does not
    // compete for the same write.
    const tokenPath = path.join('.')
    report.changed.push({
      name,
      path: tokenPath,
      current: structuredClone(outcome.current),
      next: structuredClone(outcome.next),
    })
    if (!claimed.has(tokenPath)) {
      claimed.add(tokenPath)
      proposals.push({
        path: tokenPath,
        current: structuredClone(outcome.current),
        next: structuredClone(outcome.next),
      })
    }
  }
  return { proposals, report }
}

function matchStyle({ name, node, produced, style, index }) {
  // Keeping the composite's own keys is what holds the property order of the
  // repository file, and what keeps a property the rule ignores untouched.
  const current = node.$value
  const next = {}
  const unmatched = []
  let diverged
  for (const [property, value] of Object.entries(current)) {
    if (property === 'lineHeight') {
      if (style.lineHeight !== produced.lineHeight) {
        diverged = {
          name,
          expected: produced.lineHeight,
          actual: style.lineHeight,
        }
      }
      next[property] = value
      continue
    }
    if (!MAPPABLE.includes(property)) {
      next[property] = value
      continue
    }
    const incoming = style[property]
    if (incoming === produced[property]) {
      next[property] = value
      continue
    }
    const target = index[property].get(incoming)
    if (target === undefined) {
      unmatched.push({ name, property, value: incoming })
      continue
    }
    next[property] = `{${target}}`
  }

  if (unmatched.length > 0) {
    return { kind: 'unmatched', entries: unmatched }
  }
  if (diverged) {
    return { kind: 'diverged', entry: diverged }
  }
  if (isDeepStrictEqual(next, current)) {
    return { kind: 'unchanged' }
  }
  return { kind: 'changed', current, next }
}

/**
 * The primitive tokens each mappable property can point at, by the value Figma
 * would hold. Indexed in repository order, so the first token with a value wins
 * and the same style always proposes the same reference.
 */
function primitiveIndex(tree) {
  const index = {}
  for (const property of MAPPABLE) {
    index[property] = new Map()
  }
  for (const leaf of tokenLeaves(tree)) {
    for (const property of MAPPABLE) {
      if (!inGroup(leaf.path, PRIMITIVE_GROUPS[property])) {
        continue
      }
      const value = matchValue(property, leaf.token.$value)
      if (value === undefined || index[property].has(value)) {
        continue
      }
      index[property].set(value, leaf.path.join('.'))
    }
  }
  return index
}

function inGroup(path, group) {
  return (
    path.length === group.length + 1 &&
    group.every((key, offset) => path[offset] === key)
  )
}

// The value a property matches on: the first family of a fallback list, the
// numeric part of a dimension, or the number itself.
function matchValue(property, value) {
  if (property === 'fontFamily') {
    if (typeof value === 'string') {
      return value
    }
    return Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : undefined
  }
  if (isDimensionObject(value)) {
    return value.value
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// `typography/body` -> `['typography', 'body']`: the style name is the token
// path, exactly like a variable name is.
function toPath(name) {
  return name
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

function nodeAtPath(node, path) {
  let current = node
  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

function isTypographyLeaf(node) {
  return (
    isTokenLeaf(node) &&
    node.$type === 'typography' &&
    isPlainObject(node.$value)
  )
}

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
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
