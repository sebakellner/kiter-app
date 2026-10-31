import { z } from 'zod'
import { requirePackPage } from '../domain/pack.ts'
import type {
  Pack,
  PackImportCandidate,
  PackImportRequest,
  PackImportReview,
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
  prepareImport: 'packs:prepare-import',
  listImportCandidates: 'packs:list-import-candidates',
  importPack: 'packs:import-pack',
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

export interface PackPrepareImportRequest {
  directory: string
}

// Import candidates belong to a prepared source root, not to a Pack: a folder
// being registered for the first time has no Pack yet.
export interface PackImportCandidatesRequest extends PackPageRequest {
  sourceRootId: string
}

export type PackImportCandidatesPage = PackPage<PackImportCandidate>

export interface PacksApi {
  list: (request?: PackListRequest) => Promise<IpcResult<PackListPage>>
  detail: (request: PackDetailRequest) => Promise<IpcResult<PackDetail>>
  samples: (request: PackSamplesRequest) => Promise<IpcResult<PackSamplesPage>>
  prepareImport: (
    request: PackPrepareImportRequest,
  ) => Promise<IpcResult<PackImportReview>>
  listImportCandidates: (
    request: PackImportCandidatesRequest,
  ) => Promise<IpcResult<PackImportCandidatesPage>>
  importPack: (request: PackImportRequest) => Promise<IpcResult<Pack>>
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

export function requirePackImportCandidatesRequest(
  value: unknown,
): Required<PackImportCandidatesRequest> {
  if (!isRecord(value) || !isEntityId(value.sourceRootId)) {
    throw new DomainValidationError('Invalid Pack import candidate request.')
  }
  return { sourceRootId: value.sourceRootId, ...requirePackPage(value) }
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

// Every review token is a complete SHA-256 digest of the reviewed state.
const reviewToken = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Expected a complete review token.')

// A stored Pack carries no source root path; only list rows add it.
const storedPackSchema = z.strictObject({
  id: entityId,
  sourceRootId: entityId,
  name: packName,
  description: packDescription,
  coverAssetId: entityId.nullable(),
})

const packSchema = storedPackSchema.extend({ sourceRootPath })

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

// A candidate is a Sample under the prepared root plus the conflict the surface
// must resolve before committing the Pack.
const packImportCandidateSchema = z.strictObject({
  sampleId: entityId,
  packId: entityId.nullable(),
  originAssignment: z.enum(['automatic', 'manual']),
  name: z.string().min(1),
  path: z.string().min(1),
  conflict: z.boolean(),
})

const packImportCandidatesPageSchema = pageSchema(packImportCandidateSchema)

const packImportReviewSchema = z
  .strictObject({
    sourceRootId: entityId,
    pack: storedPackSchema.nullable(),
    sampleCount: z.int().nonnegative(),
    conflictCount: z.int().nonnegative(),
    token: reviewToken,
  })
  .refine(
    (review) => review.conflictCount <= review.sampleCount,
    'Conflicting Samples cannot exceed the reviewed Samples.',
  )

const packImportPrepareSchema = z.strictObject({
  directory: z.string().min(1),
})

const packImportDecisionSchema = z.strictObject({
  sampleId: entityId,
  resolution: z.enum(['keep', 'assign']),
})

// The commit guard enforces what the domain already requires, so a forged
// request cannot reach the worker as a partially reviewed Pack import.
const packImportRequestSchema = z.strictObject({
  sourceRootId: entityId,
  token: reviewToken,
  name: packName,
  description: packDescription.optional(),
  decisions: z
    .array(packImportDecisionSchema)
    .refine(
      (decisions) =>
        new Set(decisions.map((decision) => decision.sampleId)).size ===
        decisions.length,
      'Decisions must name each conflicting Sample once.',
    ),
})

// Preload cannot compile generated code, so guards always interpret.
const OPTIONS = { jitless: true } as const

function guard<T>(schema: z.ZodType<T>): (value: unknown) => value is T {
  return (value: unknown): value is T =>
    schema.safeParse(value, OPTIONS).success
}

export const isPackListPage = guard<PackListPage>(packListPageSchema)

export const isPackDetail = guard<PackDetail>(packDetailSchema)

export const isPackSamplesPage = guard<PackSamplesPage>(packSamplesPageSchema)

export const isPackImportCandidatesPage = guard<PackImportCandidatesPage>(
  packImportCandidatesPageSchema,
)

export const isPackImportReview = guard<PackImportReview>(
  packImportReviewSchema,
)

export const isPack = guard<Pack>(storedPackSchema)

export function requirePackPrepareImportRequest(
  value: unknown,
): PackPrepareImportRequest {
  const result = packImportPrepareSchema.safeParse(value, OPTIONS)
  if (!result.success) {
    throw new DomainValidationError('Invalid Pack import preparation request.')
  }
  return result.data
}

export function requirePackImportRequest(value: unknown): PackImportRequest {
  const result = packImportRequestSchema.safeParse(value, OPTIONS)
  if (!result.success) {
    throw new DomainValidationError('Invalid Pack import request.')
  }
  return result.data
}
