import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { encodeLeaf } from './inverse.mjs'
import { folderOwners, TOKEN_FOLDERS, variableName } from './names.mjs'

/**
 * Reads the canonical DTCG tree and returns the flattened payload Figma needs.
 * Files inside a folder merge into a single tree, and each folder keeps its own
 * root group: Figma groups variables by their first name segment, so the folder
 * in the name is what keeps `color/` from mixing a primitive scale with a
 * semantic role. The repository path itself never changes.
 */
export function projectTokens(repoRoot = process.cwd()) {
  const projected = {}
  for (const folder of TOKEN_FOLDERS) {
    projected[folder] = projectTree(readTree(repoRoot, folder))
  }
  return projected
}

/**
 * Converts the projected tree into the raw values the Figma plugin writes. The
 * plugin never learns the DTCG vocabulary: aliases become `{ alias }` markers,
 * colors become `{ r, g, b, a }` and dimensions become plain numbers.
 *
 * A leaf whose projected value is a composite object (typography, border) has no
 * Figma variable type, so it is left out instead of being pushed as one
 * variable per property. Nothing is dropped from the repository: the pull never
 * deletes a token the document does not carry.
 *
 * The folder roots of the projected tree become the first segment of every
 * variable name, so a reference marker carries the folder that owns its target.
 */
export function toFigmaTree(tree) {
  return convertTree(tree, folderOwners(tree))
}

function convertTree(tree, owners) {
  const converted = {}
  for (const [key, value] of Object.entries(tree)) {
    if (isTokenLeaf(value)) {
      const leaf = toFigmaLeaf(value, owners)
      if (leaf !== undefined) {
        converted[key] = leaf
      }
    } else if (isPlainObject(value)) {
      const group = convertTree(value, owners)
      if (Object.keys(group).length > 0) {
        converted[key] = group
      }
    } else {
      converted[key] = value
    }
  }
  return converted
}

/**
 * The name a reference marker carries. An alias points at the token it names, so
 * the marker takes the folder that owns that target, never the folder of the
 * token holding the alias. A target no folder declares keeps the bare path and
 * is reported: Figma then shows a dangling reference instead of a silently
 * wrong one, and the pull leaves the repository untouched.
 */
function aliasTargetName(path, owners) {
  const folder = owners.get(path)
  if (folder === undefined) {
    console.warn(
      `token-bridge: alias target "${path}" is not a repository token`,
    )
    return path
  }
  return variableName(folder, path)
}

function toFigmaLeaf(token, owners) {
  // Shadows travel as effect styles instead. A composite has no variable type,
  // so the flattened CSS string would arrive as a STRING variable no designer
  // can apply. `token-bridge/src/styles.mjs` builds those styles.
  if (token.$type === 'shadow') {
    return undefined
  }
  const value = token.$value
  if (typeof value === 'string') {
    const alias = /^\{([^{}]+)\}$/.exec(value)
    if (alias) {
      return { alias: aliasTargetName(alias[1], owners) }
    }
  }
  if (isPlainObject(value)) {
    return undefined
  }
  if (token.$type === 'color' && typeof value === 'string') {
    const color = encodeLeaf({ $type: 'color' }, value)
    if (isColorObject(color)) {
      return {
        r: color.components[0],
        g: color.components[1],
        b: color.components[2],
        a: color.alpha === undefined ? 1 : color.alpha,
      }
    }
  }
  if (token.$type === 'dimension' && typeof value === 'string') {
    const dimension = encodeLeaf({ $type: 'dimension' }, value)
    if (isDimensionObject(dimension)) {
      return dimension.value
    }
  }
  return value
}

/**
 * Flattens one canonical leaf to the value Figma receives. Exported so the
 * surgical merge reports changes in the same vocabulary as the projection.
 */
export function projectLeafValue(token) {
  return projectValue(token.$value, token.$type)
}

function readTree(repoRoot, setName) {
  const directory = join(repoRoot, 'tokens', setName)
  const names = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  const tree = {}
  for (const name of names) {
    mergeInto(tree, JSON.parse(readFileSync(join(directory, name), 'utf8')))
  }
  return tree
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

function projectTree(tree) {
  const projected = {}
  for (const [key, value] of Object.entries(tree)) {
    if (key === '$description') {
      // Group descriptions document the repository and never reach Figma.
      continue
    }
    if (isTokenLeaf(value)) {
      projected[key] = projectLeaf(value)
    } else if (isPlainObject(value)) {
      projected[key] = projectTree(value)
    } else {
      projected[key] = value
    }
  }
  return projected
}

function projectLeaf(token) {
  const projected = {}
  for (const [key, value] of Object.entries(token)) {
    projected[key] = key === '$value' ? projectValue(value, token.$type) : value
  }
  return projected
}

function projectValue(value, type) {
  if (type === 'color' && isColorObject(value)) {
    return colorToString(value)
  }
  if (type === 'shadow' && isPlainObject(value)) {
    return shadowToString(value)
  }
  if (isDimensionObject(value)) {
    return `${value.value}${value.unit}`
  }
  if (Array.isArray(value)) {
    return value.map((item) => projectValue(item, type))
  }
  if (isPlainObject(value)) {
    const projected = {}
    for (const [key, item] of Object.entries(value)) {
      projected[key] = projectValue(item, type)
    }
    return projected
  }
  return value
}

function colorToString(color) {
  const channels = color.components.map((channel) => Math.round(channel * 255))
  if (color.alpha === undefined || color.alpha === 1) {
    return `#${channels.map(hexPair).join('')}`
  }
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${color.alpha})`
}

function shadowToString(shadow) {
  const offsets = [
    shadow.offsetX,
    shadow.offsetY,
    shadow.blur,
    shadow.spread,
  ].map((dimension) => projectValue(dimension, 'dimension'))
  const color = isColorObject(shadow.color)
    ? colorToString(shadow.color)
    : String(shadow.color)
  const inset = shadow.inset === true ? ' inset' : ''
  return `${offsets.join(' ')} ${color}${inset}`
}

function hexPair(channel) {
  return channel.toString(16).padStart(2, '0').toUpperCase()
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
