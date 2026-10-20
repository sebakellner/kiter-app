import { importCatalogSnapshotSchema } from '../../../shared/features/imports/schemas.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import type { DbClient } from '../../db'
import { canonicalRoot, discoverImportRoot } from './discovery.ts'
import type { PreparationSpool } from './spool.ts'
import type { ImportPreparation } from './types.ts'

// Full rediscovery detects additions/removals as well as changes to known files.
// This is deliberately not a filesystem/database atomicity or content guarantee.
export async function changedReviewRoots(
  database: Pick<DbClient, 'readImportCatalog'>,
  summary: ImportPreparation,
  spool: PreparationSpool,
): Promise<Set<string>> {
  const changed = new Set<string>()
  const roots = importCatalogSnapshotSchema.parse(
    await database.readImportCatalog({
      roots: summary.roots.map((root) => root.location),
      paths: [],
    }),
  ).roots
  for (const root of summary.roots) {
    const observed = roots.find((item) => item.canonicalPath === root.location)
    if (!observed) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Import root observation is incomplete.',
      )
    }
    if (JSON.stringify(root.catalog) !== JSON.stringify(observed)) {
      changed.add(root.id)
    }
    try {
      if ((await canonicalRoot(root.location)) !== root.location) {
        changed.add(root.id)
        continue
      }
    } catch {
      changed.add(root.id)
      continue
    }
    let count = 0
    let symlinks = 0
    for await (const event of discoverImportRoot(root.location)) {
      if (event.kind === 'issue') {
        changed.add(root.id)
      } else if (event.kind === 'symlink') {
        symlinks++
      } else {
        count++
        const candidate = await spool.read(spool.candidateId(event.file.path))
        if (
          !candidate ||
          !candidate.occurrences.some(
            (item) =>
              item.rootId === root.id &&
              item.relativePath === event.file.relativePath,
          ) ||
          candidate.file.observedSizeBytes !== event.file.observedSizeBytes ||
          candidate.file.observedMtimeMs !== event.file.observedMtimeMs
        ) {
          changed.add(root.id)
        }
      }
    }
    if (count !== root.discoveredCount || symlinks !== root.skippedSymlinks) {
      changed.add(root.id)
    }
  }
  for await (const batch of spool.batches()) {
    const snapshot = importCatalogSnapshotSchema.parse(
      await database.readImportCatalog({
        roots: [],
        paths: batch.map((item) => item.file.path),
      }),
    )
    const observations = new Map(
      snapshot.candidates.map((item) => [item.canonicalPath, item]),
    )
    for (const candidate of batch) {
      const observed = observations.get(candidate.file.path)
      if (!observed) {
        throw new IpcError(
          'PROTOCOL_ERROR',
          'Import catalog observation is incomplete.',
        )
      }
      if (JSON.stringify(candidate.catalog) !== JSON.stringify(observed)) {
        for (const occurrence of candidate.occurrences) {
          changed.add(occurrence.rootId)
        }
      }
    }
  }
  return changed
}
