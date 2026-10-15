import type {
  Pack,
  PackUpdateRequest,
  PackPageRequest,
  PackPage,
  PackSample,
  PackImportCandidate,
  PackImportReview,
  PackImportRequest,
  SampleOrigin,
  SampleOriginRequest,
  PackRemovalReview,
  PackRemovalRequest,
} from '../../../shared/domain/pack.ts'
import { requirePackPage } from '../../../shared/domain/pack.ts'
import { requireDescription } from '../../../shared/domain/presentation.ts'
import {
  isEntityId,
  isRecord,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import {
  isToken,
  isNonnegativeInteger as isCount,
  isPage,
} from './validation.ts'

export type PackRequest =
  | { action: 'get-pack-source-root'; root: string }
  | { action: 'update-pack'; input: PackUpdateRequest }
  | {
      action: 'get-pack' | 'review-pack-removal' | 'get-sample-origin'
      id: string
    }
  | { action: 'list-packs'; input: PackPageRequest }
  | {
      action: 'list-pack-samples' | 'list-pack-import-candidates'
      id: string
      input: PackPageRequest
    }
  | { action: 'review-pack-import'; id: string }
  | { action: 'import-pack'; input: PackImportRequest }
  | { action: 'set-sample-origin'; input: SampleOriginRequest }
  | { action: 'remove-pack'; input: PackRemovalRequest }

export type PackReply =
  | { action: 'get-pack-source-root'; result: { id: string } }
  | { action: 'update-pack' | 'get-pack' | 'import-pack'; result: Pack }
  | { action: 'list-packs'; result: PackPage<Pack> }
  | { action: 'list-pack-samples'; result: PackPage<PackSample> }
  | {
      action: 'list-pack-import-candidates'
      result: PackPage<PackImportCandidate>
    }
  | { action: 'review-pack-import'; result: PackImportReview }
  | { action: 'get-sample-origin' | 'set-sample-origin'; result: SampleOrigin }
  | { action: 'review-pack-removal'; result: PackRemovalReview }
  | { action: 'remove-pack'; result: { id: string } }

const isNullableId = (value: unknown): boolean =>
  value === null || isEntityId(value)

export function isPackRequest(value: unknown): value is PackRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  try {
    switch (value.action) {
      case 'get-pack-source-root':
        return typeof value.root === 'string' && value.root.length > 0
      case 'update-pack':
      case 'import-pack':
        if (!isRecord(input)) {
          return false
        }
        requirePresentationName(input.name)
        requireDescription(input.description)
        if (value.action === 'update-pack') {
          return isEntityId(input.id)
        }
        return (
          isEntityId(input.sourceRootId) &&
          isToken(input.token) &&
          Array.isArray(input.decisions) &&
          input.decisions.every(
            (decision) =>
              isRecord(decision) &&
              isEntityId(decision.sampleId) &&
              (decision.resolution === 'keep' ||
                decision.resolution === 'assign'),
          ) &&
          new Set(input.decisions.map((decision) => decision.sampleId)).size ===
            input.decisions.length
        )
      case 'get-pack':
      case 'review-pack-removal':
      case 'review-pack-import':
      case 'get-sample-origin':
        return isEntityId(value.id)
      case 'list-packs':
      case 'list-pack-samples':
      case 'list-pack-import-candidates':
        requirePackPage(input)
        return value.action === 'list-packs' || isEntityId(value.id)
      case 'set-sample-origin':
        return (
          isRecord(input) &&
          isEntityId(input.sampleId) &&
          isNullableId(input.packId)
        )
      case 'remove-pack':
        return isRecord(input) && isEntityId(input.id) && isToken(input.token)
      default:
        return false
    }
  } catch {
    return false
  }
}

function isPack(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  try {
    return (
      isEntityId(value.id) &&
      isEntityId(value.sourceRootId) &&
      value.name === requirePresentationName(value.name) &&
      value.description === requireDescription(value.description) &&
      isNullableId(value.coverAssetId)
    )
  } catch {
    return false
  }
}

function isOrigin(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEntityId(value.sampleId) &&
    isNullableId(value.packId) &&
    (value.originAssignment === 'automatic' ||
      value.originAssignment === 'manual')
  )
}

function isSample(value: unknown): boolean {
  return (
    isOrigin(value) &&
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.path === 'string'
  )
}

export function isPackReply(value: unknown): value is PackReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'get-pack-source-root':
      return isRecord(result) && isEntityId(result.id)
    case 'get-pack':
    case 'update-pack':
    case 'import-pack':
      return isPack(result)
    case 'list-packs':
      return isPage(result, isPack)
    case 'list-pack-samples':
      return isPage(result, isSample)
    case 'list-pack-import-candidates':
      return isPage(
        result,
        (item) =>
          isSample(item) &&
          isRecord(item) &&
          typeof item.conflict === 'boolean',
      )
    case 'get-sample-origin':
    case 'set-sample-origin':
      return isOrigin(result)
    case 'remove-pack':
      return isRecord(result) && isEntityId(result.id)
    case 'review-pack-import':
      return (
        isRecord(result) &&
        isEntityId(result.sourceRootId) &&
        (result.pack === null ||
          (isPack(result.pack) &&
            isRecord(result.pack) &&
            result.pack.sourceRootId === result.sourceRootId)) &&
        isCount(result.sampleCount) &&
        isCount(result.conflictCount) &&
        result.conflictCount <= result.sampleCount &&
        isToken(result.token)
      )
    case 'review-pack-removal':
      return (
        isRecord(result) &&
        isPack(result.entity) &&
        isCount(result.sampleCount) &&
        isCount(result.authorCount) &&
        isCount(result.categoryCount) &&
        isToken(result.token)
      )
    default:
      return false
  }
}
