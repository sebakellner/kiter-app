import type { AppDatabase } from '../../../src/main/db/runtime/connection.ts'
import { importFolder } from '../../../src/main/db/operations/sources/import.ts'
import type { LibrarySample } from '../../../src/shared/ipc/library.ts'
import { makeDiscoveredAudioFile } from '../fixtures/source.ts'

export function importSampleFixtures(
  db: AppDatabase,
  root: string,
  relativePaths: string[] = ['kick.wav'],
): LibrarySample[] {
  return importFolder(
    db,
    root,
    relativePaths.map((relativePath) =>
      makeDiscoveredAudioFile(root, relativePath),
    ),
  )
}
