import { isDeepStrictEqual } from 'node:util'

import { encodeLeaf } from './inverse.mjs'
import { projectLeafValue } from './project.mjs'

const ALIAS = /^\{([^{}]+)\}$/

/**
 * Merges the flattened payload back into the canonical tree. Only leaves that
 * the payload carries are updated; nothing is deleted, inserted, or documented
 * from Figma.
 *
 * `knownPaths` is every token path the repository declares, combined across its
 * folders. An alias the payload carries is written only when its target is one
 * of them: a dangling alias would break the build, so the existing token stays
 * and the pair is reported as `dangling`.
 */
export function mergePayload(repoTree, payloadBySet, options) {
  const tree = structuredClone(repoTree)
  const report = { changed: [], added: [], dangling: [], untouched: 0 }
  const knownPaths = options?.knownPaths
    ? new Set(options.knownPaths)
    : undefined
  const setNames = new Set([
    ...Object.keys(isPlainObject(tree) ? tree : {}),
    ...Object.keys(isPlainObject(payloadBySet) ? payloadBySet : {}),
  ])
  for (const setName of [...setNames].sort()) {
    mergeSet(tree[setName], payloadBySet?.[setName], report, knownPaths)
  }
  return { tree, report }
}

function mergeSet(repoSet, payloadSet, report, knownPaths) {
  const present = new Set()
  if (isPlainObject(payloadSet)) {
    walkLeaves(payloadSet, [], (path, payloadLeaf) => {
      const tokenPath = path.join('.')
      present.add(tokenPath)
      const repoLeaf = nodeAtPath(repoSet, path)
      if (!isTokenLeaf(repoLeaf)) {
        report.added.push(tokenPath)
        return
      }
      // The payload may carry the projected vocabulary or a raw Figma value.
      // Encoding first and projecting the result compares both spellings in the
      // language of the projection, so a raw `{ r, g, b, a }` that reproduces
      // the repository token is a no-op instead of a rewrite.
      const from = projectLeafValue(repoLeaf)
      const encoded = encodeLeaf(repoLeaf, payloadLeaf.$value)
      const alias = aliasOf(encoded)
      if (alias !== undefined && knownPaths && !knownPaths.has(alias)) {
        report.dangling.push({ path: tokenPath, alias })
        return
      }
      const to = projectLeafValue({ ...repoLeaf, $value: encoded })
      if (isDeepStrictEqual(from, to)) {
        return
      }
      report.changed.push({ path: tokenPath, from, to })
      repoLeaf.$value = encoded
    })
  }
  if (isPlainObject(repoSet)) {
    walkLeaves(repoSet, [], (path) => {
      if (!present.has(path.join('.'))) {
        report.untouched += 1
      }
    })
  }
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
