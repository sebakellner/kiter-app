import { z } from 'zod'
import { importCandidateSnapshotSchema } from '../../../shared/features/imports/schemas.ts'
import { isDiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { PREPARATION_LIMITS } from './types.ts'
import { IMPORT_PREPARATION_MAX_ROOTS } from '../../../shared/features/imports/schemas.ts'

export const spooledCandidateSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/u),
  file: z.custom<
    import('../../../shared/domain/source.ts').DiscoveredAudioFile
  >(isDiscoveredAudioFile),
  occurrences: z
    .array(z.object({ rootId: z.string().uuid(), relativePath: z.string() }))
    .max(IMPORT_PREPARATION_MAX_ROOTS),
  catalog: importCandidateSnapshotSchema,
})

export const candidatePageRequestSchema = z.object({
  preparationId: z.string().uuid(),
  revision: z.number().int().positive(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export const cursorSchema = z.object({
  preparationId: z.string().uuid(),
  revision: z.number().int().positive(),
  offset: z.number().int().nonnegative().max(PREPARATION_LIMITS.candidates),
})
