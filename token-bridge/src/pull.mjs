import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { commitWrites } from './commit.mjs'
import { mergePayload } from './merge.mjs'
import { serializeTokens } from './serialize.mjs'

const TOKEN_FOLDERS = ['primitives', 'semantic']

/**
 * Applies the single tree Figma returns to tokens/<folder>/*.json.
 *
 * A token's identity is its path, and a file owns the top-level root keys it
 * declares. Figma cannot say which folder a variable belongs to, so the same
 * tree is merged into every folder: each folder takes the paths it declares and
 * a path that no folder declares is only reported once. Every file is rebuilt
 * from the merged tree using only the paths it already owned, so a pull rewrites
 * the files that changed, keeps the key order of each of them, and never
 * creates one.
 */
export async function applyPull({ repoRoot, payload, runBuild = runTokens }) {
  const tokens = normalizeTree(assertTokenTree(payload?.tokens))
  const files = TOKEN_FOLDERS.flatMap((folder) => readFolder(repoRoot, folder))
  const folderTrees = readFolderTrees(files)

  const runs = TOKEN_FOLDERS.map((folder) => {
    const { tree, report } = mergePayload(
      { [folder]: folderTrees[folder] },
      { [folder]: tokens },
    )
    return { folder, tree, report }
  })
  const merged = {
    tree: {},
    report: combineReports(runs.map((run) => run.report)),
  }
  for (const run of runs) {
    merged.tree[run.folder] = run.tree[run.folder]
  }

  // Serialize everything before the first write. `commitWrites` writes the
  // files and runs the build, so a failed build restores them all.
  const pending = []
  for (const file of files) {
    const next = reconstructFile(file, merged.tree[file.folder])
    // Compare parsed values, not text: the dialect serializes a file the same
    // way the repository does, but a comparison that walks the tree is what
    // guarantees a pull that changes nothing never writes.
    if (deepEqual(next, file.data)) {
      continue
    }
    pending.push({
      ...file,
      serialized: serializeTokens(next),
    })
  }
  commitWrites(pending, repoRoot, runBuild)
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

/**
 * Combines the per-folder reports of the same tree. A change belongs to the
 * folder that declares the path, an addition to neither of them: only a path
 * that every folder rejected is reported, once.
 */
function combineReports(reports) {
  const changed = new Map()
  const added = new Map()
  let untouched = 0
  for (const report of reports) {
    untouched += report.untouched
    for (const change of report.changed) {
      if (!changed.has(change.path)) {
        changed.set(change.path, change)
      }
    }
    for (const path of report.added) {
      added.set(path, (added.get(path) ?? 0) + 1)
    }
  }
  return {
    changed: [...changed.values()],
    added: [...added]
      .filter(([, count]) => count === reports.length)
      .map(([path]) => path),
    untouched,
  }
}

function assertTokenTree(tokens) {
  if (!isPlainObject(tokens)) {
    throw new Error('payload.tokens must be an object')
  }
  return tokens
}

/**
 * Adapts the tree the plugin sends to the shape the surgical merge walks. The
 * plugin only knows raw Figma values, so a node is a group unless it already
 * looks like a value. The alias marker the plugin sends becomes the
 * repository's `{group.token}` string, and a token wrapper is unwrapped so a
 * payload built from the projection also works.
 */
function normalizeTree(node) {
  const normalized = {}
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) {
      continue
    }
    if (isPlainObject(value) && !isRawValue(value) && !isTokenLeaf(value)) {
      normalized[key] = normalizeTree(value)
      continue
    }
    normalized[key] = {
      $value: normalizeRawValue(isTokenLeaf(value) ? value.$value : value),
    }
  }
  return normalized
}

function normalizeRawValue(value) {
  if (isPlainObject(value) && typeof value.alias === 'string') {
    return `{${value.alias}}`
  }
  return value
}

function isRawValue(value) {
  if (typeof value.alias === 'string') {
    return true
  }
  return ['r', 'g', 'b'].every((channel) => typeof value[channel] === 'number')
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
