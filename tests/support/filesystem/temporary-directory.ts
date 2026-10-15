import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

export async function createTemporaryDirectory(
  t: TestContext,
  label: string,
): Promise<{
  path: string
  beforeRemove: (cleanup: () => void | Promise<void>) => void
}> {
  const directory = await mkdtemp(path.join(tmpdir(), `kiter-${label}-`))
  const cleanups: Array<() => void | Promise<void>> = []
  t.after(async () => {
    // A failed resource shutdown must not delete files still in use.
    for (const cleanup of cleanups.toReversed()) {
      await cleanup()
    }
    await rm(directory, { recursive: true, force: true })
  })
  return {
    path: await realpath(directory),
    beforeRemove: (cleanup) => {
      cleanups.push(cleanup)
    },
  }
}
