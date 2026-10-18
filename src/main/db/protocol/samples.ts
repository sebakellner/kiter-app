import type {
  Sample,
  SampleUpdateRequest,
  SamplePage,
  SamplePageRequest,
  SampleReference,
  SampleReferencesRequest,
  SampleRemovalReview,
  SampleRemovalRequest,
  ExcludedSource,
  SourceReinclusionRequest,
} from '../../../shared/domain/sample.ts'
import {
  requireSampleDisplayName,
  requireSampleNotes,
  requireSamplePage,
} from '../../../shared/domain/sample.ts'
import type {
  DiscoveredAudioFile,
  SourceRoot,
} from '../../../shared/domain/source.ts'
import { isDiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import {
  isToken,
  isNonnegativeInteger as isCount,
  isPage,
} from './validation.ts'
import {
  isCatalogSample,
  requireLibraryListRequest,
  type CatalogSample,
  type LibraryListRequest,
} from '../../../shared/ipc/library.ts'

export type SampleRequest =
  | { action: 'list-catalog-samples'; input: LibraryListRequest }
  | { action: 'get-catalog-sample'; id: string }
  | { action: 'get-sample' | 'review-sample-removal'; id: string }
  | { action: 'update-sample'; input: SampleUpdateRequest }
  | { action: 'list-sample-references'; input: SampleReferencesRequest }
  | { action: 'remove-sample'; input: SampleRemovalRequest }
  | { action: 'list-excluded-sources'; input: SamplePageRequest }
  | { action: 'get-reinclusion-root'; input: SourceReinclusionRequest }
  | {
      action: 'reinclude-source'
      input: SourceReinclusionRequest
      file: DiscoveredAudioFile
    }

export type SampleReply =
  | { action: 'list-catalog-samples'; result: SamplePage<CatalogSample> }
  | { action: 'get-catalog-sample'; result: CatalogSample }
  | {
      action: 'get-sample' | 'update-sample' | 'reinclude-source'
      result: Sample
    }
  | { action: 'review-sample-removal'; result: SampleRemovalReview }
  | { action: 'list-sample-references'; result: SamplePage<SampleReference> }
  | { action: 'remove-sample'; result: { id: string } }
  | { action: 'list-excluded-sources'; result: SamplePage<ExcludedSource> }
  | { action: 'get-reinclusion-root'; result: SourceRoot }

export function isSampleRequest(value: unknown): value is SampleRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  try {
    switch (value.action) {
      case 'list-catalog-samples':
        requireLibraryListRequest(input)
        return true
      case 'get-catalog-sample':
        return isEntityId(value.id)
      case 'get-sample':
      case 'review-sample-removal':
        return isEntityId(value.id)
      case 'update-sample':
        if (!isRecord(input) || !isEntityId(input.id)) {
          return false
        }
        requireSampleDisplayName(input.displayName)
        requireSampleNotes(input.notes)
        return true
      case 'list-excluded-sources':
        requireSamplePage(input)
        return true
      case 'list-sample-references':
        requireSamplePage(input)
        return (
          isRecord(input) &&
          isEntityId(input.id) &&
          typeof input.kind === 'string' &&
          ['collection', 'category', 'genre', 'author', 'root'].includes(
            input.kind,
          )
        )
      case 'remove-sample':
        return isRecord(input) && isEntityId(input.id) && isToken(input.token)
      case 'get-reinclusion-root':
      case 'reinclude-source':
        return (
          isRecord(input) &&
          isEntityId(input.sourceRootId) &&
          typeof input.canonicalPath === 'string' &&
          input.canonicalPath.length > 0 &&
          (value.action === 'get-reinclusion-root' ||
            (isDiscoveredAudioFile(value.file) &&
              value.file.path === input.canonicalPath))
        )
      default:
        return false
    }
  } catch {
    return false
  }
}

function isSample(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  try {
    return (
      isEntityId(value.id) &&
      value.displayName === requireSampleDisplayName(value.displayName) &&
      value.notes === requireSampleNotes(value.notes) &&
      typeof value.favorite === 'boolean' &&
      (value.packId === null || isEntityId(value.packId)) &&
      (value.originAssignment === 'automatic' ||
        value.originAssignment === 'manual')
    )
  } catch {
    return false
  }
}

export function isSampleReply(value: unknown): value is SampleReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'list-catalog-samples':
      return isPage(result, isCatalogSample)
    case 'get-catalog-sample':
      return isCatalogSample(result)
    case 'get-sample':
    case 'update-sample':
    case 'reinclude-source':
      return isSample(result)
    case 'remove-sample':
      return isRecord(result) && isEntityId(result.id)
    case 'list-sample-references':
      return isPage(
        result,
        (item) =>
          isRecord(item) &&
          isEntityId(item.id) &&
          typeof item.name === 'string' &&
          (item.position === null || isCount(item.position)),
      )
    case 'list-excluded-sources':
      return isPage(
        result,
        (item) =>
          isRecord(item) &&
          typeof item.canonicalPath === 'string' &&
          item.canonicalPath.length > 0,
      )
    case 'get-reinclusion-root':
      return (
        isRecord(result) &&
        isEntityId(result.id) &&
        typeof result.canonicalPath === 'string' &&
        result.registered === true &&
        (result.lastScanAt === null || typeof result.lastScanAt === 'string') &&
        (result.lastScanOutcome === null ||
          result.lastScanOutcome === 'completed' ||
          result.lastScanOutcome === 'failed') &&
        (result.lastScanErrorCode === null ||
          typeof result.lastScanErrorCode === 'string')
      )
    case 'review-sample-removal': {
      if (
        !isRecord(result) ||
        !isRecord(result.source) ||
        !isRecord(result.entity)
      ) {
        return false
      }
      const source = result.source
      return (
        isSample(result.entity) &&
        source.sampleId === result.entity.id &&
        typeof source.canonicalPath === 'string' &&
        isCount(source.revision) &&
        source.revision > 0 &&
        (source.observedSizeBytes === null ||
          isCount(source.observedSizeBytes)) &&
        (source.observedMtimeMs === null ||
          (typeof source.observedMtimeMs === 'number' &&
            Number.isFinite(source.observedMtimeMs))) &&
        typeof source.lastCheckedAt === 'string' &&
        ((source.availability === 'available' &&
          source.lastErrorCode === null) ||
          ((source.availability === 'missing' ||
            source.availability === 'inaccessible') &&
            typeof source.lastErrorCode === 'string' &&
            source.lastErrorCode.length > 0)) &&
        isCount(result.collectionCount) &&
        isCount(result.categoryCount) &&
        isCount(result.genreCount) &&
        isCount(result.authorCount) &&
        isCount(result.rootCount) &&
        isToken(result.token)
      )
    }
    default:
      return false
  }
}
