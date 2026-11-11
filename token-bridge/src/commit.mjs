import { readFileSync, writeFileSync } from 'node:fs'

// Writes the pending files, then runs the build. A failed build restores every
// written file, so a pull either lands with fresh CSS or leaves the tree byte
// for byte as it was, and the error names what was rolled back.
export function commitWrites(pending, repoRoot, runBuild) {
  const written = []
  try {
    for (const file of pending) {
      written.push({ ...file, source: readFileSync(file.absolutePath, 'utf8') })
      writeFileSync(file.absolutePath, file.serialized)
    }
    runBuild(repoRoot)
  } catch (cause) {
    for (const file of written) {
      writeFileSync(file.absolutePath, file.source)
    }
    const rolledBack = written.map((file) => file.relPath)
    const reason = cause instanceof Error ? cause.message : String(cause)
    const error = new Error(
      `build failed, rolled back ${rolledBack.join(', ') || 'none'}: ${reason}`,
    )
    error.rolledBack = rolledBack
    throw error
  }
}
