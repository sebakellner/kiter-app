import type { AudioFile } from '../domain/source.ts'
import {
  instrumentFilterSchema,
  catalogSearchSchema,
  genreFilterSchema,
  sampleTypeFilterSchema,
  type SampleTypeFilter,
} from '../features/library/schemas.ts'
import { effectiveCatalogSearch } from '../features/library/search.ts'
import { isCollectionOrderToken } from './collections.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import type { IpcResult } from './result.ts'
import {
  requirePage,
  type Page,
  type PageRequest,
} from '../domain/pagination.ts'

export const LIBRARY_CHANNELS = {
  importFolder: 'library:import-folder',
  list: 'library:list',
  setFavorite: 'library:set-favorite',
  startDrag: 'library:start-drag',
  dragError: 'library:drag-error',
} as const

export type LibrarySample = AudioFile & { id: string; favorite: boolean }
export type AudioSample = LibrarySample & { audioUrl: string }
export type CatalogSample = LibrarySample & {
  rootPath: string | null
  sourceRevision: number
}
export type CatalogAudioSample = CatalogSample & {
  audioUrl: string | null
  unavailableReason: string | null
}
export interface LibraryListRequest extends PageRequest {
  favoritesOnly?: boolean
  instrumentIds?: string[]
  genreIds?: string[]
  sampleTypes?: SampleTypeFilter
  search?: string
  collectionId?: string
}
export type CatalogPage = Page<CatalogSample> & {
  collectionOrderToken?: string
}
export type LibraryPage = Omit<CatalogPage, 'items'> & {
  items: CatalogAudioSample[]
}

export function requireLibraryListRequest(value: unknown): LibraryListRequest {
  const page = requirePage(value)
  if (
    !isRecord(value) ||
    (value.favoritesOnly !== undefined &&
      typeof value.favoritesOnly !== 'boolean')
  ) {
    throw new DomainValidationError('Invalid Favorites filter.')
  }
  const instruments = instrumentFilterSchema.safeParse(
    value.instrumentIds === undefined ? [] : value.instrumentIds,
  )
  if (!instruments.success) {
    throw new DomainValidationError(
      'Invalid Instrument filter. Select at most 100 unique Instruments.',
    )
  }
  const genres = genreFilterSchema.safeParse(
    value.genreIds === undefined ? [] : value.genreIds,
  )
  if (!genres.success) {
    throw new DomainValidationError(
      'Invalid Genre filter. Select at most 100 unique Genres.',
    )
  }
  const types = sampleTypeFilterSchema.safeParse(
    value.sampleTypes === undefined ? [] : value.sampleTypes,
  )
  if (!types.success) {
    throw new DomainValidationError(
      'Invalid Sample type filter. Select unique Loop, One-Shot or Unknown values.',
    )
  }
  const search = catalogSearchSchema.safeParse(
    value.search === undefined ? '' : value.search,
  )
  if (!search.success) {
    throw new DomainValidationError(
      'Invalid search. Use at most 500 characters and 32 words, without control characters.',
    )
  }
  const text = effectiveCatalogSearch(search.data)
  if (value.collectionId !== undefined && !isEntityId(value.collectionId)) {
    throw new DomainValidationError('Invalid Collection identifier.')
  }
  return {
    ...page,
    favoritesOnly: value.favoritesOnly ?? false,
    ...(instruments.data.length > 0 ? { instrumentIds: instruments.data } : {}),
    ...(genres.data.length > 0 ? { genreIds: genres.data } : {}),
    ...(types.data.length > 0 ? { sampleTypes: types.data } : {}),
    ...(text ? { search: text } : {}),
    ...(value.collectionId !== undefined
      ? { collectionId: value.collectionId }
      : {}),
  }
}

export function isCatalogSample(value: unknown): value is CatalogSample {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.relativePath === 'string' &&
    typeof value.sourceRevision === 'number' &&
    Number.isSafeInteger(value.sourceRevision) &&
    value.sourceRevision > 0 &&
    (value.rootPath === null || typeof value.rootPath === 'string') &&
    isFavoriteState(value)
  )
}

export function isLibraryPage(value: unknown): value is LibraryPage {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requirePage(value)
    return (
      value.limit === limit &&
      value.offset === offset &&
      (value.collectionOrderToken === undefined ||
        isCollectionOrderToken(value.collectionOrderToken)) &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset) &&
      value.items.every(
        (item) =>
          isCatalogSample(item) &&
          isRecord(item) &&
          ((typeof item.audioUrl === 'string' &&
            /^sample:\/\/audio\/catalog\/[a-f0-9]{64}\/[A-Za-z0-9_-]+$/.test(
              item.audioUrl,
            ) &&
            item.unavailableReason === null) ||
            (item.audioUrl === null &&
              typeof item.unavailableReason === 'string')),
      )
    )
  } catch {
    return false
  }
}
export type FavoriteState = { id: string; favorite: boolean }
export type AudioDragError = { audioUrl: string; message: string }
export interface ImportFolderRequest {
  directory: string
}
export interface SetFavoriteRequest {
  id: string
  favorite: boolean
}

export interface LibraryApi {
  list: (request?: LibraryListRequest) => Promise<IpcResult<LibraryPage>>
  importFolder: (directory: string) => Promise<IpcResult<AudioSample[]>>
  setFavorite: (
    id: string,
    favorite: boolean,
  ) => Promise<IpcResult<FavoriteState>>
  startDrag: (audioUrl: string) => void
  onDragError: (listener: (error: AudioDragError) => void) => () => void
}

export function isImportFolderRequest(
  value: unknown,
): value is ImportFolderRequest {
  return (
    isRecord(value) &&
    typeof value.directory === 'string' &&
    value.directory.length > 0
  )
}

export function isSetFavoriteRequest(
  value: unknown,
): value is SetFavoriteRequest {
  return (
    isRecord(value) &&
    isEntityId(value.id) &&
    typeof value.favorite === 'boolean'
  )
}

export function isFavoriteState(value: unknown): value is FavoriteState {
  return (
    isRecord(value) &&
    isEntityId(value.id) &&
    typeof value.favorite === 'boolean'
  )
}

export function isAudioSamples(value: unknown): value is AudioSample[] {
  return (
    Array.isArray(value) &&
    value.every(
      (sample) =>
        isRecord(sample) &&
        typeof sample.name === 'string' &&
        typeof sample.path === 'string' &&
        typeof sample.relativePath === 'string' &&
        typeof sample.audioUrl === 'string' &&
        /^sample:\/\/audio\/[0-9a-f-]+$/.test(sample.audioUrl) &&
        isFavoriteState(sample),
    )
  )
}

export function isAudioDragError(value: unknown): value is AudioDragError {
  return (
    isRecord(value) &&
    typeof value.audioUrl === 'string' &&
    typeof value.message === 'string'
  )
}
