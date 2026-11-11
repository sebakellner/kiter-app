import { isDeepStrictEqual } from 'node:util'

import { encodeLeaf } from './inverse.mjs'
import { projectLeafValue } from './project.mjs'

/**
 * Merges the flattened payload back into the canonical tree. Only leaves that
 * the payload carries are updated; nothing is deleted, inserted, or documented
 * from Figma.
 */
export function mergePayload(repoTree, payloadBySet) {
  const tree = structuredClone(repoTree)
  const report = { changed: [], added: [], untouched: 0 }
  const setNames = new Set([
    ...Object.keys(isPlainObject(tree) ? tree : {}),
    ...Object.keys(isPlainObject(payloadBySet) ? payloadBySet : {}),
  ])
  for (const setName of [...setNames].sort()) {
    mergeSet(tree[setName], payloadBySet?.[setName], report)
  }
  return { tree, report }
}

function mergeSet(repoSet, payloadSet, report) {
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
      const from = projectLeafValue(repoLeaf)
      const to = payloadLeaf.$value
      if (isDeepStrictEqual(from, to)) {
        return
      }
      report.changed.push({ path: tokenPath, from, to })
      repoLeaf.$value = encodeLeaf(repoLeaf, to)
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

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
