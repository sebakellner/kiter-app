import { isDeepStrictEqual } from 'node:util'

import { encodeLeaf } from './inverse.mjs'
import { folderOwners, referenceOf, variableName } from './names.mjs'
import { projectLeafValue } from './project.mjs'

const ALIAS = /^\{([^{}]+)\}$/

/**
 * Merges the flattened payload back into the canonical tree. Only leaves that
 * the payload carries are updated; nothing is deleted, inserted, or documented
 * from Figma.
 *
 * The payload keeps one root group per folder, because every variable name
 * carries the folder that owns its token. That claim is verified instead of
 * trusted: a leaf is written only when the folder it names declares the path,
 * so a name that points a semantic token at a primitive path (or the other way
 * round) is reported and left alone. The bridge never guesses ownership, never
 * creates a token, and never deletes or renames one.
 *
 * An alias is written only when the folder its reference carries owns the
 * target: a dangling alias would break the build, so the existing token stays
 * and the pair is reported as `dangling`.
 */
export function mergePayload(folderTrees, payloadTree) {
  const tree = structuredClone(folderTrees)
  const report = { changed: [], added: [], dangling: [], untouched: 0 }
  const owners = folderOwners(tree)
  const present = new Set()
  for (const [folder, payloadSet] of Object.entries(
    isPlainObject(payloadTree) ? payloadTree : {},
  )) {
    if (isPlainObject(payloadSet)) {
      mergeSet(tree, folder, payloadSet, report, owners, present)
    }
  }
  for (const folder of Object.keys(tree)) {
    walkLeaves(tree[folder], [], (path) => {
      if (!present.has(variableName(folder, path.join('.')))) {
        report.untouched += 1
      }
    })
  }
  return { tree, report }
}

function mergeSet(tree, folder, payloadSet, report, owners, present) {
  const repoSet = tree[folder]
  walkLeaves(payloadSet, [], (path, payloadLeaf) => {
    const tokenPath = path.join('.')
    const name = variableName(folder, tokenPath)
    const repoLeaf = nodeAtPath(repoSet, path)
    if (owners.get(tokenPath) !== folder || !isTokenLeaf(repoLeaf)) {
      // A name the repository does not have under the folder it claims: a new
      // token, a legacy name without a folder, or a path that belongs to the
      // other folder. All three are reported and never written.
      report.added.push(name)
      return
    }
    present.add(name)
    // The payload may carry the projected vocabulary or a raw Figma value.
    // Encoding first and projecting the result compares both spellings in the
    // language of the projection, so a raw `{ r, g, b, a }` that reproduces
    // the repository token is a no-op instead of a rewrite.
    const from = projectLeafValue(repoLeaf)
    const encoded = encodeLeaf(repoLeaf, payloadLeaf.$value)
    const alias = aliasOf(encoded)
    let value = encoded
    if (alias !== undefined) {
      const reference = referenceOf(alias, owners)
      if (reference === undefined) {
        report.dangling.push({ path: tokenPath, alias })
        return
      }
      value = `{${reference}}`
    }
    const to = projectLeafValue({ ...repoLeaf, $value: value })
    if (isDeepStrictEqual(from, to)) {
      return
    }
    report.changed.push({ path: tokenPath, from, to })
    repoLeaf.$value = value
  })
}

function walkLeaves(node, path, visit) {
  for (const [key, value] of Object.entries(node)) {
    if (!isPlainObject(value) || key.startsWith('$')) {
      continue
    }
    if (isTokenLeaf(value)) {
      visit([...path, key], value)
    } else {
      walkLeaves(value, [...path, key], visit)
    }
  }
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

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
}

// The token path a DTCG alias carries, or undefined for a literal value.
function aliasOf(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = ALIAS.exec(value.trim())
  return match ? match[1] : undefined
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
