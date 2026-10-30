import { z } from 'zod'
import { requirePackPage } from '../domain/pack.ts'
import type { Pack, PackPage, PackPageRequest } from '../domain/pack.ts'
import { MAX_PAGE_LIMIT } from '../domain/pagination.ts'
import { requireDescription } from '../domain/presentation.ts'
import { isEntityId, requirePresentationName } from '../domain/validation.ts'
import type { IpcResult } from './result.ts'

export const PACK_CHANNELS = {
  list: 'packs:list',
} as const

export type PackListRequest = PackPageRequest
export type PackListPage = PackPage<Pack>

export interface PacksApi {
  list: (request?: PackListRequest) => Promise<IpcResult<PackListPage>>
}

export function requirePackListRequest(
  value: unknown,
): Required<PackListRequest> {
  return requirePackPage(value)
}

const entityId = z.string().refine(isEntityId, 'Invalid entity identifier.')

// Stored presentation text is normalized; a reply that is not cannot be shown.
const packName = z.string().refine((value) => {
  try {
    return requirePresentationName(value) === value
  } catch {
    return false
  }
}, 'Expected a normalized Pack name.')

const packDescription = z
  .string()
  .nullable()
  .refine((value) => {
    try {
      return requireDescription(value) === value
    } catch {
      return false
    }
  }, 'Expected a normalized Pack description.')

const packSchema = z.strictObject({
  id: entityId,
  sourceRootId: entityId,
  name: packName,
  description: packDescription,
  coverAssetId: entityId.nullable(),
})

const packListPageSchema = z
  .strictObject({
    items: z.array(packSchema),
    total: z.int().nonnegative(),
    limit: z.int().min(1).max(MAX_PAGE_LIMIT),
    offset: z.int().nonnegative(),
  })
  .refine(
    (page) =>
      page.items.length <= page.limit &&
      page.items.length <= Math.max(0, page.total - page.offset),
    'Pack page items exceed the page bounds.',
  )

// Preload cannot compile generated code, so guards always interpret.
const OPTIONS = { jitless: true } as const

function guard<T>(schema: z.ZodType<T>): (value: unknown) => value is T {
  return (value: unknown): value is T =>
    schema.safeParse(value, OPTIONS).success
}

export const isPackListPage = guard<PackListPage>(packListPageSchema)
