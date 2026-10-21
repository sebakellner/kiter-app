import { z } from 'zod'
import { isEntityId, requirePresentationName } from '../../domain/validation.ts'

const id = z.string().refine(isEntityId)
const token = z.string().regex(/^[a-f0-9]{64}$/u)
export const packCreditNameSchema = z
  .string()
  .max(480)
  .transform((value, context) => {
    try {
      return requirePresentationName(value)
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Enter a valid credit name.',
      })
      return z.NEVER
    }
  })
const storedName = z
  .string()
  .max(480)
  .refine((value) => {
    try {
      return requirePresentationName(value) === value
    } catch {
      return false
    }
  }, 'Expected a normalized credit name.')
export const packOrganizationEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('author'), id, name: storedName }),
  z.strictObject({
    kind: z.literal('instrument'),
    id,
    name: storedName,
    key: z.string().min(1).max(4096),
  }),
  z.strictObject({
    kind: z.literal('genre'),
    id,
    name: storedName,
    key: z.string().min(1).max(4096),
  }),
])
export const packOrganizationCatalogRequestSchema = z
  .strictObject({
    offset: z.int().min(0).max(30000).default(0),
    token: token.optional(),
  })
  .refine((input) => input.offset === 0 || Boolean(input.token))
export const packOrganizationCatalogPageSchema = z.strictObject({
  token,
  total: z.int().min(0).max(30000),
  items: z.array(packOrganizationEntrySchema).max(100),
})
const ids = z
  .array(id)
  .max(100)
  .refine((items) => new Set(items).size === items.length)
export const packAuthorChoiceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('existing'), id }),
  z.strictObject({
    kind: z.literal('new'),
    draftId: id.optional(),
    name: packCreditNameSchema,
    acknowledgedAuthorIds: ids,
    acknowledgedDraftIds: ids,
  }),
])
export const packOrganizationSelectionSchema = z.strictObject({
  instrumentIds: ids,
  genreIds: ids,
  authors: z.array(packAuthorChoiceSchema).max(100),
})
export const packOrganizationDraftSchema = z.strictObject({
  instruments: z.array(packOrganizationEntrySchema.options[1]).max(100),
  genres: z.array(packOrganizationEntrySchema.options[2]).max(100),
  authors: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('existing'), id, name: storedName }),
        z.strictObject({
          kind: z.literal('new'),
          draftId: id,
          name: storedName,
          acknowledgedAuthors: z
            .array(packOrganizationEntrySchema.options[0])
            .max(100),
          acknowledgedDraftIds: ids,
        }),
      ]),
    )
    .max(100),
  needsReview: z.boolean(),
})
export type PackOrganizationEntry = z.infer<typeof packOrganizationEntrySchema>
export type PackOrganizationDraft = z.infer<typeof packOrganizationDraftSchema>
export type PackOrganizationSelection = z.input<
  typeof packOrganizationSelectionSchema
>
export type PackOrganizationCatalogRequest = z.input<
  typeof packOrganizationCatalogRequestSchema
>
export type PackOrganizationCatalogPage = z.infer<
  typeof packOrganizationCatalogPageSchema
>
