// A Figma variable name carries the folder that owns the token it addresses.
// The repository path stays the only identity: the folder is projected into the
// name on push and validated on pull, so ownership is never guessed.

export const TOKEN_FOLDERS = ['primitives', 'semantic']

/**
 * `primitives/color/slate/300` from `('primitives', 'color.slate.300')` or from
 * a path array. The folder is the first name segment, which is what makes
 * `color/` hold a primitive scale and a semantic role in separate groups.
 */
export function variableName(folder, path) {
  const segments = Array.isArray(path) ? path : String(path).split('.')
  return [folder, ...segments].join('/')
}

/**
 * Splits a variable name into the folder it claims and the token path behind it.
 * Both separators are accepted because the plugin flattens a name to a dotted
 * path before it reaches the server.
 */
export function splitVariableName(name) {
  const text = String(name ?? '')
  const at = text.search(/[./]/)
  if (at < 1) {
    return undefined
  }
  const path = text
    .slice(at + 1)
    .split(/[./]/)
    .join('.')
  if (path === '') {
    return undefined
  }
  return { folder: text.slice(0, at), path }
}

/**
 * The folder that declares each token path, keyed by the dotted path. A path
 * lives in exactly one folder, so a name's folder is either the owner or wrong.
 * Works on the repository tree and on the projected tree, which both keep one
 * root group per folder.
 */
export function folderOwners(folderTrees) {
  const owners = new Map()
  for (const folder of TOKEN_FOLDERS) {
    const tree = folderTrees?.[folder]
    if (isPlainObject(tree)) {
      collectPaths(tree, [], folder, owners)
    }
  }
  return owners
}

/**
 * The repository reference a Figma alias name resolves to, or `undefined` when
 * the folder the name carries does not own the target it names. A source of an
 * alias never decides the edge: the target's own folder does.
 */
export function referenceOf(name, owners) {
  const split = splitVariableName(name)
  if (split === undefined || owners.get(split.path) !== split.folder) {
    return undefined
  }
  return split.path
}

function collectPaths(node, path, folder, owners) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$') || !isPlainObject(value)) {
      continue
    }
    if (isTokenLeaf(value)) {
      owners.set([...path, key].join('.'), folder)
      continue
    }
    collectPaths(value, [...path, key], folder, owners)
  }
}

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
