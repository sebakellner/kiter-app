import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

export const IMPORT_SNAPSHOT_BATCH_SIZE = 100
export const IMPORT_PREPARATION_MAX_ROOTS = 32

const id = z.string().refine(isEntityId, 'Invalid catalog identifier.')
const location = z
  .string()
  .min(1)
  .max(32768)
  .refine((s) => !s.includes('\0'))
const locations = (max: number): z.ZodArray<typeof location> =>
  z
    .array(location)
    .max(max)
    .refine((items) => new Set(items).size === items.length)

export const importCatalogRequestSchema = z.object({
  roots: locations(IMPORT_PREPARATION_MAX_ROOTS),
  paths: locations(IMPORT_SNAPSHOT_BATCH_SIZE),
})

export const importRootSnapshotSchema = z.object({
  canonicalPath: location,
  registration: z.object({ id, registered: z.boolean() }).nullable(),
  pack: z.object({ id, name: z.string() }).nullable(),
})

export const importCandidateSnapshotSchema = z.object({
  canonicalPath: location,
  excluded: z.boolean(),
  sample: z
    .object({
      id,
      packId: id.nullable(),
      originAssignment: z.enum(['automatic', 'manual']),
      sourceRevision: z.number().int().min(1),
      observedSizeBytes: z.number().int().nonnegative().nullable(),
      observedMtimeMs: z.number().finite().nullable(),
    })
    .nullable(),
})

export const importCatalogSnapshotSchema = z.object({
  roots: z.array(importRootSnapshotSchema).max(IMPORT_PREPARATION_MAX_ROOTS),
  candidates: z
    .array(importCandidateSnapshotSchema)
    .max(IMPORT_SNAPSHOT_BATCH_SIZE),
})

export type ImportCatalogRequest = z.infer<typeof importCatalogRequestSchema>
export type ImportCatalogSnapshot = z.infer<typeof importCatalogSnapshotSchema>
export type ImportRootSnapshot = z.infer<typeof importRootSnapshotSchema>
export type ImportCandidateSnapshot = z.infer<
  typeof importCandidateSnapshotSchema
>
