import path from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  importCatalogRequestSchema,
  type ImportCatalogRequest,
  type ImportCatalogSnapshot,
} from '../../../../shared/features/imports/schemas.ts'
import { DomainValidationError } from '../../../../shared/domain/validation.ts'
import { sourceRoots, excludedSources } from '../../schema/sources.ts'
import { packs } from '../../schema/packs.ts'
import { samples, sampleSources } from '../../schema/samples.ts'

// A bounded, read-only catalog observation, not a confirmation or source grant.
export function readImportCatalog(
  db: AppDatabase,
  input: ImportCatalogRequest,
): ImportCatalogSnapshot {
  const parsed = importCatalogRequestSchema.safeParse(input)
  if (
    !parsed.success ||
    ![...input.roots, ...input.paths].every(path.isAbsolute)
  ) {
    throw new DomainValidationError('Invalid import catalog snapshot request.')
  }
  return db.transaction(() => {
    const roots =
      input.roots.length === 0
        ? []
        : db
            .select({
              canonicalPath: sourceRoots.canonicalPath,
              id: sourceRoots.id,
              registered: sourceRoots.registered,
              packId: packs.id,
              packName: packs.name,
            })
            .from(sourceRoots)
            .leftJoin(packs, eq(packs.sourceRootId, sourceRoots.id))
            .where(inArray(sourceRoots.canonicalPath, input.roots))
            .all()
    const existing =
      input.paths.length === 0
        ? []
        : db
            .select({
              canonicalPath: sampleSources.canonicalPath,
              id: samples.id,
              packId: samples.packId,
              originAssignment: samples.originAssignment,
              sourceRevision: sampleSources.revision,
              observedSizeBytes: sampleSources.observedSizeBytes,
              observedMtimeMs: sampleSources.observedMtimeMs,
            })
            .from(sampleSources)
            .innerJoin(samples, eq(samples.id, sampleSources.sampleId))
            .where(inArray(sampleSources.canonicalPath, input.paths))
            .all()
    const excluded = new Set(
      input.paths.length === 0
        ? []
        : db
            .select({
              path: excludedSources.canonicalPath,
            })
            .from(excludedSources)
            .where(inArray(excludedSources.canonicalPath, input.paths))
            .all()
            .map((row) => row.path),
    )
    const rootMap = new Map(roots.map((row) => [row.canonicalPath, row]))
    const sampleMap = new Map(
      existing.map(({ canonicalPath, ...sample }) => [canonicalPath, sample]),
    )
    return {
      roots: input.roots.map((canonicalPath) => {
        const row = rootMap.get(canonicalPath)
        return {
          canonicalPath,
          registration: row ? { id: row.id, registered: row.registered } : null,
          pack:
            row?.packId && row.packName !== null
              ? { id: row.packId, name: row.packName }
              : null,
        }
      }),
      candidates: input.paths.map((canonicalPath) => ({
        canonicalPath,
        excluded: excluded.has(canonicalPath),
        sample: sampleMap.get(canonicalPath) ?? null,
      })),
    }
  })
}
