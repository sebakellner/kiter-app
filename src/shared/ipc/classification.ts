import type { RecognitionDimension } from '../domain/recognition.ts'
import type { AliasUpdatesApi } from './aliasUpdates.ts'
import type { IpcResult } from './result.ts'
import { requirePage } from '../domain/pagination.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requireEntityId,
} from '../domain/validation.ts'

export const CLASSIFICATION_CHANNELS = {
  prepareSample: 'classification:prepare-sample',
  listAliasUpdates: 'classification:list-alias-updates',
  incorporateAlias: 'classification:incorporate-alias',
} as const

export type ClassificationPreparationRequest = {
  sampleId: string
  limit?: number
  offset?: number
  token?: string
}

// Each row is one evidence occurrence, so a single proposal cannot create an
// unbounded IPC payload. Repeated target keys belong to the same proposal.
export type ClassificationPreparationItem = {
  kind: 'proposal' | 'ambiguity'
  dimension: RecognitionDimension
  key: string
  name: string
  entityId: string | null
  alreadyAssigned: boolean
  needsCreation: boolean
  evidence: string
  clue: string
  rule: 'name' | 'alias' | 'pack-genre'
  reason:
    'conflicting-targets' | 'overlapping-phrases' | 'contradictory-type' | null
}

export type ClassificationPreparationPage = {
  sampleId: string
  sampleName: string
  token: string
  proposalCount: number
  ambiguityCount: number
  items: ClassificationPreparationItem[]
  total: number
  limit: number
  offset: number
}

export interface ClassificationApi extends AliasUpdatesApi {
  prepareSample: (
    request: ClassificationPreparationRequest,
  ) => Promise<IpcResult<ClassificationPreparationPage>>
}

export function requireClassificationPreparationRequest(
  value: unknown,
): ClassificationPreparationRequest {
  if (!isRecord(value)) {
    throw new DomainValidationError(
      'Invalid classification preparation request.',
    )
  }
  const { limit, offset } = requirePage(value)
  if (
    (value.token !== undefined &&
      (typeof value.token !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value.token))) ||
    (offset > 0 && value.token === undefined)
  ) {
    throw new DomainValidationError(
      'A current preparation token is required for subsequent pages.',
    )
  }
  return {
    sampleId: requireEntityId(value.sampleId),
    limit,
    offset,
    ...(typeof value.token === 'string' ? { token: value.token } : {}),
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isItem(value: unknown): value is ClassificationPreparationItem {
  return (
    isRecord(value) &&
    (value.kind === 'proposal' || value.kind === 'ambiguity') &&
    (value.dimension === 'category' ||
      value.dimension === 'genre' ||
      value.dimension === 'sample-type') &&
    typeof value.key === 'string' &&
    value.key.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    (value.entityId === null || isEntityId(value.entityId)) &&
    typeof value.alreadyAssigned === 'boolean' &&
    typeof value.needsCreation === 'boolean' &&
    typeof value.evidence === 'string' &&
    value.evidence.length > 0 &&
    typeof value.clue === 'string' &&
    (value.rule === 'name' ||
      value.rule === 'alias' ||
      value.rule === 'pack-genre') &&
    (value.kind === 'proposal'
      ? value.reason === null
      : value.reason === 'conflicting-targets' ||
        value.reason === 'overlapping-phrases' ||
        value.reason === 'contradictory-type')
  )
}

export function isClassificationPreparationPage(
  value: unknown,
): value is ClassificationPreparationPage {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requirePage(value)
    return (
      isEntityId(value.sampleId) &&
      typeof value.sampleName === 'string' &&
      value.sampleName.length > 0 &&
      typeof value.token === 'string' &&
      /^[a-f0-9]{64}$/u.test(value.token) &&
      isCount(value.proposalCount) &&
      isCount(value.ambiguityCount) &&
      isCount(value.total) &&
      value.limit === limit &&
      value.offset === offset &&
      Array.isArray(value.items) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset) &&
      value.items.every(isItem)
    )
  } catch {
    return false
  }
}
