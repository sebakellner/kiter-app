import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

const token = z.string().regex(/^[a-f0-9]{64}$/u)
const target = z.strictObject({
  kind: z.enum(['sample', 'pack']),
  id: z.string().refine(isEntityId),
})
const assignment = z.strictObject({
  dimension: z.enum(['instrument', 'genre']),
  key: z.string().min(1).max(4096),
})
export const importClassificationContextRequestSchema = z
  .strictObject({
    offset: z.int().min(0).max(10000).default(0),
    token: token.optional(),
    targets: z
      .array(target)
      .max(100)
      .refine(
        (items) =>
          new Set(items.map((item) => JSON.stringify(item))).size ===
          items.length,
      )
      .default([]),
  })
  .refine(
    (input) =>
      (input.offset === 0 && input.targets.length === 0) ||
      Boolean(input.token),
  )

export const importClassificationContextSchema = z.strictObject({
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
      }),
    )
    .max(100),
})
export type ImportClassificationContextRequest = z.input<
  typeof importClassificationContextRequestSchema
>
export type ImportClassificationContext = z.infer<
  typeof importClassificationContextSchema
>
