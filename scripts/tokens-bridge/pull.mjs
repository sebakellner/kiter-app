import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { format } from 'prettier'

import { mergePayload } from './merge.mjs'

const TOKEN_FOLDERS = ['primitives', 'semantic']

/**
 * Applies the flattened payload Figma returns to tokens/<folder>/*.json.
 *
 * A token's identity is its path, and a file owns the top-level root keys it
 * declares. Every file is rebuilt from the merged tree using only the paths it
 * already owned, so a pull rewrites the files that changed, keeps the key order
 * of each of them, and never creates one.
 */
export async function applyPull({ repoRoot, payload, runBuild = runTokens }) {
  assertPayloadSets(payload)
  const files = TOKEN_FOLDERS.flatMap((folder) => readFolder(repoRoot, folder))
  const merged = mergePayload(readFolderTrees(files), payload ?? {})

  // Serialize everything before the first write: a failure while rebuilding or
  // formatting leaves the tree untouched instead of half written.
  const pending = []
  for (const file of files) {
    const next = reconstructFile(file, merged.tree[file.folder])
    // Compare parsed values, not text: the repository uses `objectWrap:
    // preserve`, so re-serializing an unchanged file would still differ from
    // its source wrapping and rewrite every file on a no-op pull.
    if (deepEqual(next, file.data)) {
      continue
    }
    pending.push({
      ...file,
      serialized: await serialize(next, file.absolutePath),
    })
  }
  for (const file of pending) {
    writeFileSync(file.absolutePath, file.serialized)
  }

  runBuild(repoRoot)
  return { report: merged.report, written: pending.map((file) => file.relPath) }
}

function readFolder(repoRoot, folder) {
  const directory = join(repoRoot, 'tokens', folder)
  const names = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  return names.map((name) => ({
    folder,
    name,
    relPath: `tokens/${folder}/${name}`,
    absolutePath: join(directory, name),
    data: JSON.parse(readFileSync(join(directory, name), 'utf8')),
  }))
}

/**
 * Merges the files of one set into the tree the surgical merge works on. Root
 * keys are unique within a folder, which is what lets a rebuilt file keep only
 * its own paths; a duplicate would make the split ambiguous.
 */
function readFolderTrees(files) {
  const trees = {}
  const owners = new Map()
  for (const file of files) {
    trees[file.folder] ??= {}
    for (const root of Object.keys(file.data)) {
      const owner = owners.get(root)
      if (owner !== undefined && owner.folder === file.folder) {
        throw new Error(
          `tokens/${file.folder} declares "${root}" in both ${owner.name} and ${file.name}`,
        )
      }
      owners.set(root, file)
    }
    mergeInto(trees[file.folder], file.data)
  }
  return trees
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

function reconstructFile(file, folderTree) {
  const next = {}
  for (const root of Object.keys(file.data)) {
    next[root] = reconstructNode(file.data[root], folderTree?.[root])
  }
  return next
}

/**
 * Rebuilds one node keeping the order the file already used. Keys the merged
 * tree gained that the file did not own are appended last, so an edit never
 * reorders unrelated tokens.
 */
function reconstructNode(original, merged) {
  if (merged === undefined) {
    return original
  }
  if (
    !isPlainObject(original) ||
    !isPlainObject(merged) ||
    isTokenLeaf(merged)
  ) {
    return merged
  }
  const next = {}
  for (const key of Object.keys(original)) {
    next[key] = Object.hasOwn(merged, key)
      ? reconstructNode(original[key], merged[key])
      : original[key]
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!Object.hasOwn(next, key)) {
      next[key] = value
    }
  }
  return next
}

function assertPayloadSets(payload) {
  for (const folder of TOKEN_FOLDERS) {
    const set = payload?.[folder]
    if (set !== undefined && !isPlainObject(set)) {
      throw new Error(`payload.${folder} must be an object`)
    }
  }
}

/**
 * Serializes with Prettier so a pull writes the formatting the repository
 * already uses. Plain JSON.stringify reformats 9 of the 13 token files and
 * makes `pnpm format:check` fail after any pull.
 */
function serialize(value, filepath) {
  return format(`${JSON.stringify(value, null, 2)}\n`, {
    filepath,
    objectWrap: 'collapse',
  })
}

function runTokens(repoRoot) {
  const result = spawnSync('pnpm', ['tokens'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`pnpm tokens exited with code ${result.status}`)
  }
}

function isTokenLeaf(node) {
  return isPlainObject(node) && Object.hasOwn(node, '$value')
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left, right) {
  if (left === right) {
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false
    }
    return left.every((item, index) => deepEqual(item, right[index]))
  }
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]),
  )
}
