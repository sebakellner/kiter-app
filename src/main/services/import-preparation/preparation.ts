import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import type { DbClient } from '../../db'
import {
  IMPORT_PREPARATION_MAX_ROOTS,
  IMPORT_SNAPSHOT_BATCH_SIZE,
  importCatalogSnapshotSchema,
} from '../../../shared/features/imports/schemas.ts'
import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { requirePage } from '../../../shared/domain/pagination.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { canonicalRoot, discoverImportRoot } from './discovery.ts'
import { PreparationSpool, PreparationLimitError } from './spool.ts'
import { cursorSchema, candidatePageRequestSchema } from './schemas.ts'
import { logPreparationFailure, preparationFailure } from './errors.ts'
import {
  PREPARATION_LIMITS,
  type ImportPreparation,
  type PreparationRoot,
  type PreparationIssue,
  type PreparationCandidate,
} from './types.ts'

interface Session {
  summary: ImportPreparation
  spool: PreparationSpool
  invalidated: boolean
  disposing: Promise<void> | null
}

// Instantiate once per owner in main. No renderer paths or audio capabilities.
export class ImportPreparationService {
  private session: Session | null = null
  private pending: Promise<ImportPreparation> | null = null
  private closed = false
  private cleanupPending: PreparationSpool | null = null
  private readonly database: Pick<DbClient, 'readImportCatalog'>
  private readonly temporaryParent: string

  constructor(
    database: Pick<DbClient, 'readImportCatalog'>,
    temporaryParent: string,
  ) {
    this.database = database
    this.temporaryParent = temporaryParent
  }

  async prepare(directories: string[]): Promise<ImportPreparation> {
    if (this.closed) {
      throw new IpcError('CLOSING', 'Import preparation is closed.')
    }
    if (this.session || this.pending || this.cleanupPending) {
      throw new DomainValidationError(
        'Discard the current import preparation first.',
      )
    }
    if (
      !Array.isArray(directories) ||
      directories.length === 0 ||
      directories.length > IMPORT_PREPARATION_MAX_ROOTS ||
      directories.some(
        (root) =>
          typeof root !== 'string' ||
          !path.isAbsolute(root) ||
          root.includes('\0'),
      )
    ) {
      throw new DomainValidationError(
        'Select between 1 and 32 absolute source folders.',
      )
    }
    this.pending = this.build(directories)
    try {
      return await this.pending
    } catch (error) {
      if (error instanceof IpcError || error instanceof DomainValidationError) {
        throw error
      }
      logPreparationFailure('prepare', error)
      throw preparationFailure(
        'Unable to prepare import. Check folder access and temporary storage.',
        error,
      )
    } finally {
      this.pending = null
    }
  }

  get(preparationId: string): ImportPreparation {
    return structuredClone(this.requireSession(preparationId).summary)
  }

  async listCandidates(input: {
    preparationId: string
    revision: number
    cursor?: string
    limit?: number
  }): Promise<{
    items: PreparationCandidate[]
    total: number
    revision: number
    nextCursor: string | null
  }> {
    const parsed = candidatePageRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new DomainValidationError('Invalid import preparation page.')
    }
    const session = this.requireSession(input.preparationId, input.revision)
    const { limit } = requirePage({ limit: input.limit })
    let offset = 0
    if (input.cursor !== undefined) {
      let cursor: unknown
      try {
        cursor = JSON.parse(
          Buffer.from(input.cursor, 'base64url').toString('utf8'),
        )
      } catch {
        throw new DomainValidationError('Invalid import preparation cursor.')
      }
      const parsedCursor = cursorSchema.safeParse(cursor)
      if (!parsedCursor.success) {
        throw new DomainValidationError('Invalid import preparation cursor.')
      }
      if (
        parsedCursor.data.preparationId !== input.preparationId ||
        parsedCursor.data.revision !== input.revision
      ) {
        throw new IpcError(
          'STALE_REVIEW',
          'Reload the current import preparation.',
        )
      }
      offset = parsedCursor.data.offset
    }
    let items: PreparationCandidate[]
    try {
      items = await session.spool.page(offset, limit)
    } catch (error) {
      this.requireSession(input.preparationId, input.revision)
      logPreparationFailure('read-page', error)
      throw preparationFailure(
        'Unable to read import preparation storage. Discard and prepare the folders again.',
        error,
      )
    }
    // A concurrent discard must not return a page from an invalidated session.
    this.requireSession(input.preparationId, input.revision)
    const next = offset + items.length
    return {
      items,
      total: session.summary.candidateCount,
      revision: input.revision,
      nextCursor:
        next < session.summary.candidateCount
          ? Buffer.from(
              JSON.stringify({
                preparationId: input.preparationId,
                revision: input.revision,
                offset: next,
              }),
            ).toString('base64url')
          : null,
    }
  }

  async discard(preparationId: string, revision: number): Promise<void> {
    const session = this.requireSession(preparationId, revision, true)
    session.invalidated = true
    if (!session.disposing) {
      session.disposing = this.cleanup(session.spool)
    }
    try {
      await session.disposing
      if (this.session === session) {
        this.session = null
      }
    } finally {
      // Failed cleanup remains retryable, but cannot serve partially removed pages.
      session.disposing = null
    }
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.pending) {
      // Preserve the original prepare error for its caller, while still draining.
      await this.pending.then(
        () => undefined,
        () => undefined,
      )
    }
    if (this.session) {
      await this.discard(this.session.summary.id, this.session.summary.revision)
    }
    if (this.cleanupPending) {
      await this.cleanup(this.cleanupPending)
      this.cleanupPending = null
    }
  }

  private requireSession(
    id: string,
    revision?: number,
    forDiscard = false,
  ): Session {
    if (
      !this.session ||
      this.session.summary.id !== id ||
      (this.session.invalidated && !forDiscard)
    ) {
      throw new IpcError(
        'NOT_FOUND',
        'The import preparation is no longer available.',
      )
    }
    if (revision !== undefined && revision !== this.session.summary.revision) {
      throw new IpcError(
        'STALE_REVIEW',
        'Reload the current import preparation.',
      )
    }
    return this.session
  }

  private async build(directories: string[]): Promise<ImportPreparation> {
    const id = randomUUID()
    const directory = await mkdtemp(
      path.join(this.temporaryParent, 'kiter-import-preparation-'),
    )
    const spool = new PreparationSpool(directory, id)
    try {
      const roots: PreparationRoot[] = []
      for (const location of directories) {
        const root: PreparationRoot = {
          id: randomUUID(),
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
          this.addIssue(root, { code: 'UNSAFE_LOCATION', relativePath: '' })
        }
        roots.push(root)
      }
      const snapshot = importCatalogSnapshotSchema.parse(
        await this.database.readImportCatalog({
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
          // Inactive roots can be inspected, never implicitly reactivated here.
          this.addIssue(root, {
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
            await this.storeBatch(root, batch, spool)
          } catch (error) {
            if (!(error instanceof PreparationLimitError)) {
              throw error
            }
            this.addIssue(root, { code: 'LIMIT_EXCEEDED', relativePath: '' })
            limited = true
          }
          batch = []
        }
        for await (const event of discoverImportRoot(root.location)) {
          if (event.kind === 'issue') {
            this.addIssue(root, event.issue)
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
      const summary: ImportPreparation = {
        id,
        revision: 1,
        state: roots.some((root) => root.state === 'blocked')
          ? 'blocked'
          : 'ready',
        candidateCount: spool.count,
        roots,
      }
      this.session = { summary, spool, invalidated: false, disposing: null }
      return structuredClone(summary)
    } catch (error) {
      this.cleanupPending = spool
      try {
        await this.cleanup(spool)
      } catch (cleanupError) {
        logPreparationFailure('build', error)
        throw preparationFailure(
          'Unable to prepare import and clean temporary storage. Check access and retry close.',
          new AggregateError(
            [error, cleanupError],
            'Import preparation and cleanup failed.',
          ),
        )
      }
      this.cleanupPending = null
      throw error
    }
  }

  private async cleanup(spool: PreparationSpool): Promise<void> {
    try {
      await spool.dispose()
    } catch (error) {
      logPreparationFailure('cleanup', error)
      throw preparationFailure(
        'Unable to clean import preparation storage. Check access and retry discard or close.',
        error,
      )
    }
  }

  private addIssue(root: PreparationRoot, issue: PreparationIssue): void {
    root.state = 'blocked'
    root.issueCount++
    if (root.issues.length < PREPARATION_LIMITS.issuesPerRoot) {
      root.issues.push(issue)
    }
  }

  private async storeBatch(
    root: PreparationRoot,
    files: DiscoveredAudioFile[],
    spool: PreparationSpool,
  ): Promise<void> {
    const snapshot = importCatalogSnapshotSchema.parse(
      await this.database.readImportCatalog({
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
        this.addIssue(root, {
          code: 'SOURCE_CHANGED',
          relativePath: file.relativePath,
        })
      }
      const candidate: PreparationCandidate = existing
        ? structuredClone(existing)
        : { id, file, occurrences: [], catalog: observed }
      if (
        !candidate.occurrences.some(
          (occurrence) => occurrence.rootId === root.id,
        )
      ) {
        candidate.occurrences.push({
          rootId: root.id,
          relativePath: file.relativePath,
        })
      }
      await spool.write(candidate, existing)
    }
  }
}
