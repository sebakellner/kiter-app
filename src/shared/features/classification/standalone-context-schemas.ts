import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

// Standalone catalog-backed classification context for the session review core.
// One bounded worker read per page: 1–100 unique catalog targets returned
// complete on every page, 100-row vocabulary/alias pages over at most 10,000
// rows each (the worker fails beyond that ceiling), at most 100 source rows,
// 1,000 assignments and 1,000 origin Genre keys per target, and an 8 MiB
// serialized response ceiling. Pages after the first require the vocabulary
// token of the first page; the token pins vocabulary/aliases across pages.
// The read never writes catalog data.
const token = z.string().regex(/^[a-f0-9]{64}$/u)
const target = z.strictObject({
  kind: z.enum(['sample', 'pack']),
  id: z.string().refine(isEntityId),
})
const assignment = z.strictObject({
  dimension: z.enum(['instrument', 'genre']),
  key: z.string().min(1).max(4096),
})
// One registered root association of the target. Samples carry one entry per
// registered root containing their source file; a Pack carries its supplying
// root only, which contributes root name evidence and has no file observation.
const source = z.strictObject({
  rootId: z.string().refine(isEntityId),
  rootPath: z.string().min(1).max(4096),
  // Location of the Sample's source file inside this root with platform
  // separators; empty for a Pack's supplying root.
  relativePath: z.string().max(4096),
  // sample_sources availability; null for Pack roots without a source file.
  availability: z.enum(['available', 'missing', 'inaccessible']).nullable(),
  canonicalPath: z.string().min(1).max(4096),
})

export const standaloneClassificationContextRequestSchema = z
  .strictObject({
    offset: z.int().min(0).max(10000).default(0),
    token: token.optional(),
    targets: z
      .array(target)
      .min(1)
      .max(100)
      .refine(
        (items) =>
          new Set(items.map((item) => JSON.stringify(item))).size ===
          items.length,
      ),
  })
  .refine((input) => input.offset === 0 || Boolean(input.token))

export const standaloneClassificationContextSchema = z.strictObject({
  token,
  vocabulary: z
    .array(
      z.strictObject({
        key: z.string(),
        dimension: z.enum(['instrument', 'genre', 'sample-type']),
        name: z.string(),
        entityId: z.string().refine(isEntityId).nullable(),
        state: z.enum(['active', 'offered', 'deleted']),
      }),
    )
    .max(100),
  aliases: z
    .array(
      z.strictObject({
        id: z.string().refine(isEntityId),
        targetKey: z.string(),
        term: z.string(),
        suppliedKey: z.string().nullable(),
      }),
    )
    .max(100),
  vocabularyTotal: z.int().min(0).max(10000),
  aliasTotal: z.int().min(0).max(10000),
  targets: z
    .array(
      z.strictObject({
        target,
        currentType: z.enum(['loop', 'one-shot']).nullable(),
        assignments: z.array(assignment).max(1000),
        sources: z.array(source).max(100),
        // The Sample's current origin Pack; null for Packs and unassigned Samples.
        originPackId: z.string().refine(isEntityId).nullable(),
        // Samples: the origin Pack's saved Genres. Packs: their own saved Genres.
        originGenreKeys: z.array(z.string().min(1).max(4096)).max(1000),
      }),
    )
    .min(1)
    .max(100),
})
export type StandaloneClassificationContextRequest = z.input<
  typeof standaloneClassificationContextRequestSchema
>
export type StandaloneClassificationContext = z.infer<
  typeof standaloneClassificationContextSchema
>
export type StandaloneClassificationContextTarget =
  StandaloneClassificationContext['targets'][number]
