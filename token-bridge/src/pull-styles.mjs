import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { commitWrites } from './commit.mjs'
import { TOKEN_FOLDERS } from './names.mjs'
import { serializeTokens } from './serialize.mjs'
import { matchTextStyles } from './style-match.mjs'

/**
 * Writes the text style changes back into the repository. Matching decides what
 * can be expressed; this function only applies the `changed` proposals, so an
 * unmatched, divergent or missing style leaves the tree untouched.
 *
 * Only the token's own `$value` is replaced. Its `$description`, its siblings
 * and the key order of the file all survive, and the file is written with the
 * committed dialect, which is what keeps a one-value change a one-line diff.
 *
 * `runBuild` is injected by the tests; in the bridge it regenerates the CSS so
 * a pull never leaves `src/styles/tokens.css` stale.
 */
export async function applyStylePull({
  repoRoot,
  styles,
  runBuild = runTokens,
}) {
  const { proposals, report } = matchTextStyles({ repoRoot, styles })
  const files = readTokenFiles(repoRoot)

  // Serialize everything before the first write. `commitWrites` writes the
  // files and runs the build, so a failed build restores them all.
  const pending = []
  if (proposals.length > 0) {
    for (const [file, entries] of claimOwners(files, proposals)) {
      const data = structuredClone(file.data)
      for (const proposal of entries) {
        const node = nodeAtPath(data, proposal.path.split('.'))
        if (!isTokenLeaf(node)) {
          continue
        }
        node.$value = structuredClone(proposal.next)
      }
      pending.push({
        relPath: file.relPath,
        absolutePath: file.absolutePath,
        serialized: serializeTokens(data),
      })
    }
  }
  commitWrites(pending, repoRoot, runBuild)
  return { report, written: pending.map((file) => file.relPath) }
}

function readTokenFiles(repoRoot) {
  return TOKEN_FOLDERS.flatMap((folder) => {
    const directory = join(repoRoot, 'tokens', folder)
    const names = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
    return names.map((name) => ({
      folder,
      relPath: `tokens/${folder}/${name}`,
      absolutePath: join(directory, name),
      data: JSON.parse(readFileSync(join(directory, name), 'utf8')),
    }))
  })
}

/**
 * The file that owns each proposed token path. Reading the repository merges the
 * folders in `TOKEN_FOLDERS` order and the later file wins, so the owner is the
 * last file that declares the path — writing anywhere else would leave the read
 * side unchanged.
 */
function claimOwners(files, proposals) {
  const owners = new Map()
  for (const proposal of proposals) {
    const keys = proposal.path.split('.')
    let owner
    for (const file of files) {
      if (isTokenLeaf(nodeAtPath(file.data, keys))) {
        owner = file
      }
    }
    if (owner === undefined) {
      continue
    }
    if (!owners.has(owner)) {
      owners.set(owner, [])
    }
    owners.get(owner).push(proposal)
  }
  return owners
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
