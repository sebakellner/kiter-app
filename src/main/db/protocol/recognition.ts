import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import {
  isClassificationTarget,
  requireClassificationPage,
  requireClassificationName,
} from '../../../shared/domain/classification.ts'
import type {
  ClassificationPageRequest,
  ClassificationTarget,
  ClassificationAssignmentRequest,
  ClassificationRemovalRequest,
  ClassificationRemovalReview,
} from '../../../shared/domain/classification.ts'
import type { Page } from '../../../shared/domain/pagination.ts'
import type {
  AliasWriteRequest,
  Genre,
  RecognitionAlias,
  VocabularyEntry,
} from '../../../shared/domain/recognition.ts'
import { isPage, isToken } from './validation.ts'
import {
  requireClassificationApplyRequest,
  isClassificationApplyResult,
} from '../../../shared/ipc/classification.ts'
import type { ClassificationApplyRequest } from '../../../shared/ipc/classification.ts'
import { requirePage } from '../../../shared/domain/pagination.ts'
import {
  requireAliasUpdateRequest,
  isAliasUpdatePage,
  isAliasUpdateResult,
} from '../../../shared/ipc/aliasUpdates.ts'
import type {
  AliasUpdate,
  AliasUpdateRequest,
} from '../../../shared/ipc/aliasUpdates.ts'
import type { PageRequest } from '../../../shared/domain/pagination.ts'
import {
  requireClassificationPreparationRequest,
  isClassificationPreparationPage,
} from '../../../shared/ipc/classification.ts'
import type {
  ClassificationPreparationRequest,
  ClassificationPreparationPage,
} from '../../../shared/ipc/classification.ts'

export type RecognitionRequest =
  | { action: 'apply-sample-classification'; input: ClassificationApplyRequest }
  | { action: 'list-alias-updates'; input: PageRequest }
  | { action: 'incorporate-alias'; input: AliasUpdateRequest }
  | {
      action: 'prepare-sample-classification'
      input: ClassificationPreparationRequest
    }
  | { action: 'create-genre'; input: { name: string } }
  | { action: 'rename-genre'; input: { id: string; name: string } }
  | { action: 'get-genre' | 'review-genre-removal'; id: string }
  | {
      action:
        | 'list-genres'
        | 'list-recognition-vocabulary'
        | 'list-recognition-aliases'
      input: ClassificationPageRequest
    }
  | {
      action: 'list-target-genres'
      target: ClassificationTarget
      input: ClassificationPageRequest
    }
  | { action: 'set-genre-assignment'; input: ClassificationAssignmentRequest }
  | { action: 'remove-genre'; input: ClassificationRemovalRequest }
  | { action: 'write-recognition-alias'; input: AliasWriteRequest }
  | { action: 'remove-recognition-alias'; id: string }

export type RecognitionReply =
  | { action: 'apply-sample-classification'; result: { sampleId: string } }
  | { action: 'list-alias-updates'; result: Page<AliasUpdate> }
  | { action: 'incorporate-alias'; result: { key: string } }
  | {
      action: 'prepare-sample-classification'
      result: ClassificationPreparationPage
    }
  | { action: 'create-genre' | 'rename-genre' | 'get-genre'; result: Genre }
  | { action: 'list-genres' | 'list-target-genres'; result: Page<Genre> }
  | { action: 'review-genre-removal'; result: ClassificationRemovalReview }
  | {
      action: 'remove-genre' | 'remove-recognition-alias'
      result: { id: string }
    }
  | { action: 'set-genre-assignment'; result: { assigned: boolean } }
  | { action: 'write-recognition-alias'; result: RecognitionAlias }
  | { action: 'list-recognition-vocabulary'; result: Page<VocabularyEntry> }
  | { action: 'list-recognition-aliases'; result: Page<RecognitionAlias> }

export function isRecognitionRequest(
  value: unknown,
): value is RecognitionRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  try {
    switch (value.action) {
      case 'apply-sample-classification':
        requireClassificationApplyRequest(input)
        return true
      case 'list-alias-updates':
        requirePage(input)
        return true
      case 'incorporate-alias':
        requireAliasUpdateRequest(input)
        return true
      case 'prepare-sample-classification':
        requireClassificationPreparationRequest(input)
        return true
      case 'create-genre':
      case 'rename-genre':
        if (!isRecord(input)) {
          return false
        }
        requireClassificationName(input.name)
        return value.action === 'create-genre' || isEntityId(input.id)
      case 'get-genre':
      case 'review-genre-removal':
      case 'remove-recognition-alias':
        return isEntityId(value.id)
      case 'list-genres':
      case 'list-recognition-vocabulary':
      case 'list-recognition-aliases':
        requireClassificationPage(input)
        return true
      case 'list-target-genres':
        requireClassificationPage(input)
        return isClassificationTarget(value.target)
      case 'set-genre-assignment':
        return (
          isRecord(input) &&
          isEntityId(input.id) &&
          isClassificationTarget(input.target) &&
          typeof input.assigned === 'boolean'
        )
      case 'remove-genre':
        return isRecord(input) && isEntityId(input.id) && isToken(input.token)
      case 'write-recognition-alias':
        if (!isRecord(input)) {
          return false
        }
        requireClassificationName(input.term)
        return (
          typeof input.targetKey === 'string' &&
          input.targetKey.length > 0 &&
          input.targetKey.length <= 160 &&
          (input.id === undefined || isEntityId(input.id))
        )
      default:
        return false
    }
  } catch {
    return false
  }
}

function isGenre(value: unknown): value is Genre {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  try {
    return requireClassificationName(value.name) === value.name
  } catch {
    return false
  }
}

function isAlias(value: unknown): value is RecognitionAlias {
  if (!isRecord(value)) {
    return false
  }
  try {
    return (
      isEntityId(value.id) &&
      typeof value.targetKey === 'string' &&
      requireClassificationName(value.term) === value.term &&
      (value.suppliedKey === null || typeof value.suppliedKey === 'string')
    )
  } catch {
    return false
  }
}

function isVocabulary(value: unknown): value is VocabularyEntry {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.name === 'string' &&
    ['category', 'genre', 'sample-type'].includes(String(value.dimension)) &&
    ['active', 'offered', 'deleted'].includes(String(value.state)) &&
    (value.entityId === null || isEntityId(value.entityId))
  )
}

export function isRecognitionReply(value: unknown): value is RecognitionReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'apply-sample-classification':
      return isClassificationApplyResult(result)
    case 'list-alias-updates':
      return isAliasUpdatePage(result)
    case 'incorporate-alias':
      return isAliasUpdateResult(result)
    case 'prepare-sample-classification':
      return isClassificationPreparationPage(result)
    case 'create-genre':
    case 'rename-genre':
    case 'get-genre':
      return isGenre(result)
    case 'list-genres':
    case 'list-target-genres':
      return isPage(result, isGenre)
    case 'list-recognition-vocabulary':
      return isPage(result, isVocabulary)
    case 'list-recognition-aliases':
      return isPage(result, isAlias)
    case 'write-recognition-alias':
      return isAlias(result)
    case 'remove-genre':
    case 'remove-recognition-alias':
      return isRecord(result) && isEntityId(result.id)
    case 'set-genre-assignment':
      return isRecord(result) && typeof result.assigned === 'boolean'
    case 'review-genre-removal':
      return (
        isRecord(result) &&
        isGenre(result.entity) &&
        isToken(result.token) &&
        Number.isSafeInteger(result.sampleCount) &&
        Number(result.sampleCount) >= 0 &&
        Number.isSafeInteger(result.packCount) &&
        Number(result.packCount) >= 0 &&
        result.linkedProfile === null
      )
    default:
      return false
  }
}
