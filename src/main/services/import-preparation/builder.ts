import { randomUUID } from 'node:crypto'
import type { DbClient } from '../../db'
import {
  IMPORT_SNAPSHOT_BATCH_SIZE,
  importCatalogSnapshotSchema,
} from '../../../shared/features/imports/schemas.ts'
import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { canonicalRoot, discoverImportRoot } from './discovery.ts'
import { PreparationLimitError, type PreparationSpool } from './spool.ts'
import {
  PREPARATION_LIMITS,
  type ImportPreparation,
  type PreparationRoot,
  type PreparationIssue,
  type PreparationCandidate,
} from './types.ts'

export function addPreparationIssue(
  root: PreparationRoot,
  issue: PreparationIssue,
): void {
  root.state = 'blocked'
  root.issueCount++
  if (root.issues.length < PREPARATION_LIMITS.issuesPerRoot) {
    root.issues.push(issue)
  }
}

async function storeBatch(
  database: Pick<DbClient, 'readImportCatalog'>,
  root: PreparationRoot,
  files: DiscoveredAudioFile[],
  spool: PreparationSpool,
): Promise<void> {
  const snapshot = importCatalogSnapshotSchema.parse(
    await database.readImportCatalog({
      roots: [],
      paths: files.map((file) => file.path),
    }),
  )
  const catalog = new Map(
    snapshot.candidates.map((candidate) => [
      candidate.canonicalPath,
      candidate,
    ]),
  )
  for (const file of files) {
    const observed = catalog.get(file.path)
    if (!observed) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Import catalog observation is incomplete.',
      )
    }
    const id = spool.candidateId(file.path)
    const existing = await spool.read(id)
    if (
      existing &&
      (existing.file.observedSizeBytes !== file.observedSizeBytes ||
        existing.file.observedMtimeMs !== file.observedMtimeMs)
    ) {
      addPreparationIssue(root, {
        code: 'SOURCE_CHANGED',
        relativePath: file.relativePath,
      })
    }
    const candidate: PreparationCandidate = existing
      ? structuredClone(existing)
      : { id, file, occurrences: [], catalog: observed }
    if (
      !candidate.occurrences.some((occurrence) => occurrence.rootId === root.id)
    ) {
      candidate.occurrences.push({
        rootId: root.id,
        relativePath: file.relativePath,
      })
    }
    await spool.write(candidate, existing)
  }
}

export async function discoverPreparationRoots(
  database: Pick<DbClient, 'readImportCatalog'>,
  directories: string[],
  spool: PreparationSpool,
  previous?: ImportPreparation,
): Promise<PreparationRoot[]> {
  const roots: PreparationRoot[] = []
  for (const location of directories) {
    const root: PreparationRoot = {
      id:
        previous?.roots.find((root) => root.location === location)?.id ??
        randomUUID(),
      location,
      state: 'completed',
      catalog: null,
      discoveredCount: 0,
      skippedSymlinks: 0,
      issueCount: 0,
      issues: [],
    }
    try {
      root.location = await canonicalRoot(location)
      if (roots.some((other) => other.location === root.location)) {
        continue
      }
    } catch {
      addPreparationIssue(root, { code: 'UNSAFE_LOCATION', relativePath: '' })
    }
    roots.push(root)
  }
  const snapshot = importCatalogSnapshotSchema.parse(
    await database.readImportCatalog({
      roots: roots
        .filter((root) => root.state === 'completed')
        .map((root) => root.location),
      paths: [],
    }),
  )
  for (const root of roots) {
    root.catalog =
      snapshot.roots.find((item) => item.canonicalPath === root.location) ??
      null
    if (root.issues.length === 0 && !root.catalog) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Import root observation is incomplete.',
      )
    }
    if (root.catalog?.registration?.registered === false) {
      addPreparationIssue(root, {
        code: 'REGISTRATION_INACTIVE',
        relativePath: '',
      })
    }
    if (root.issues.some((issue) => issue.code === 'UNSAFE_LOCATION')) {
      continue
    }
    let batch: DiscoveredAudioFile[] = []
    let limited = false
    const flush = async (): Promise<void> => {
      if (batch.length === 0) {
        return
      }
      try {
        await storeBatch(database, root, batch, spool)
      } catch (error) {
        if (!(error instanceof PreparationLimitError)) {
          throw error
        }
        addPreparationIssue(root, { code: 'LIMIT_EXCEEDED', relativePath: '' })
        limited = true
      }
      batch = []
    }
    for await (const event of discoverImportRoot(root.location)) {
      if (event.kind === 'issue') {
        addPreparationIssue(root, event.issue)
      } else if (event.kind === 'symlink') {
        root.skippedSymlinks++
      } else {
        root.discoveredCount++
        batch.push(event.file)
        if (batch.length === IMPORT_SNAPSHOT_BATCH_SIZE) {
          await flush()
        }
      }
      if (limited) {
        break
      }
    }
    await flush()
  }
  return roots
}
