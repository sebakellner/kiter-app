import { z } from 'zod'
import { requirePackPage } from '../domain/pack.ts'
import type {
  Pack,
  PackPage,
  PackPageRequest,
  PackSample,
} from '../domain/pack.ts'
import type { Author, Instrument } from '../domain/classification.ts'
import type { Page } from '../domain/pagination.ts'
import { MAX_PAGE_LIMIT } from '../domain/pagination.ts'
import { requireDescription } from '../domain/presentation.ts'
import type { Genre } from '../domain/recognition.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requirePresentationName,
} from '../domain/validation.ts'
import type { IpcResult } from './result.ts'

export const PACK_CHANNELS = {
  list: 'packs:list',
  detail: 'packs:detail',
  samples: 'packs:samples',
} as const

export type PackListRequest = PackPageRequest

// Pack names come from their folder, so rows carry the source root path that
// keeps two Packs sharing a name distinguishable.
export interface PackListItem extends Pack {
  sourceRootPath: string
}

export type PackListPage = PackPage<PackListItem>

export interface PackDetailRequest {
  id: string
}

// Instruments, Authors and Genres are bounded reads that echo their own total,
// so a detail never claims a complete list it did not read.
export interface PackDetail {
  pack: PackListItem
  instruments: Page<Instrument>
  authors: Page<Author>
  genres: Page<Genre>
}

export interface PackSamplesRequest extends PackPageRequest {
  id: string
}

export type PackSamplesPage = PackPage<PackSample>

export interface PacksApi {
  list: (request?: PackListRequest) => Promise<IpcResult<PackListPage>>
  detail: (request: PackDetailRequest) => Promise<IpcResult<PackDetail>>
  samples: (request: PackSamplesRequest) => Promise<IpcResult<PackSamplesPage>>
}

export function requirePackListRequest(
  value: unknown,
): Required<PackListRequest> {
  return requirePackPage(value)
}

export function requirePackDetailRequest(value: unknown): PackDetailRequest {
  if (!isRecord(value) || !isEntityId(value.id)) {
    throw new DomainValidationError('Invalid Pack detail request.')
  }
  return { id: value.id }
}

export function requirePackSamplesRequest(
  value: unknown,
): Required<PackSamplesRequest> {
  if (!isRecord(value) || !isEntityId(value.id)) {
    throw new DomainValidationError('Invalid Pack Samples request.')
  }
  return { id: value.id, ...requirePackPage(value) }
}

const entityId = z.string().refine(isEntityId, 'Invalid entity identifier.')

// Stored presentation text is normalized; a reply that is not cannot be shown.
function normalizedName(message: string): z.ZodType<string> {
  return z.string().refine((value) => {
    try {
      return requirePresentationName(value) === value
    } catch {
      return false
    }
  }, message)
}

const packName = normalizedName('Expected a normalized Pack name.')

const classificationName = normalizedName('Expected a normalized entity name.')

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

const sourceRootPath = z.string().min(1)

const packSchema = z.strictObject({
  id: entityId,
  sourceRootId: entityId,
  name: packName,
  description: packDescription,
  coverAssetId: entityId.nullable(),
  sourceRootPath,
})

const paginationFields = {
  total: z.int().nonnegative(),
  limit: z.int().min(1).max(MAX_PAGE_LIMIT),
  offset: z.int().nonnegative(),
}

function withinPageBounds(page: {
  readonly items: readonly unknown[]
  total: number
  limit: number
  offset: number
}): boolean {
  return (
    page.items.length <= page.limit &&
    page.items.length <= Math.max(0, page.total - page.offset)
  )
}

interface PageShape<Item> {
  items: Item[]
  total: number
  limit: number
  offset: number
}

function pageSchema<Item extends z.ZodType>(
  item: Item,
): z.ZodType<PageShape<z.output<Item>>> {
  return z
    .strictObject({ items: z.array(item), ...paginationFields })
    .refine(withinPageBounds, 'Page items exceed the page bounds.')
}

const packListPageSchema = pageSchema(packSchema)

const instrumentSchema = z.strictObject({
  id: entityId,
  name: classificationName,
})

const authorSchema = z.strictObject({
  id: entityId,
  name: classificationName,
})

const genreSchema = z.strictObject({
  id: entityId,
  name: classificationName,
})

const packDetailSchema = z.strictObject({
  pack: packSchema,
  instruments: pageSchema(instrumentSchema),
  authors: pageSchema(authorSchema),
  genres: pageSchema(genreSchema),
})

// Samples under a Pack keep their stored origin and derived presentation name.
const packSampleSchema = z.strictObject({
  sampleId: entityId,
  packId: entityId.nullable(),
  originAssignment: z.enum(['automatic', 'manual']),
  name: z.string().min(1),
  path: z.string().min(1),
})

const packSamplesPageSchema = pageSchema(packSampleSchema)

// Preload cannot compile generated code, so guards always interpret.
const OPTIONS = { jitless: true } as const

function guard<T>(schema: z.ZodType<T>): (value: unknown) => value is T {
  return (value: unknown): value is T =>
    schema.safeParse(value, OPTIONS).success
}

export const isPackListPage = guard<PackListPage>(packListPageSchema)

export const isPackDetail = guard<PackDetail>(packDetailSchema)

export const isPackSamplesPage = guard<PackSamplesPage>(packSamplesPageSchema)
