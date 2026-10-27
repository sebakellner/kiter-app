import type {
  Author,
  Instrument,
  ClassificationAssignmentRequest,
  ClassificationPage,
  ClassificationPageRequest,
  ClassificationRemovalRequest,
  ClassificationRemovalReview,
  ClassificationTarget,
  ClassificationUse,
  ClassificationUsesRequest,
} from '../../../shared/domain/classification.ts'
import {
  isClassificationTarget,
  requireClassificationName,
  requireClassificationPage,
} from '../../../shared/domain/classification.ts'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import { isToken, isPage } from './validation.ts'
import type {
  SampleInstrumentsRequest,
  SampleInstrumentsSaveRequest,
  SampleInstrumentsSnapshot,
} from '../../../shared/ipc/sampleInstruments.ts'
import {
  requireSampleInstrumentsRequest,
  requireSampleInstrumentsSaveRequest,
  isSampleInstrumentsSnapshot,
} from '../../../shared/ipc/sampleInstruments.ts'
import {
  applyClassificationRejectionsRequestSchema,
  classificationRejectionMemoryRequestSchema,
  classificationRejectionMemorySnapshotSchema,
} from '../../../shared/features/classification/rejection-schemas.ts'
import type {
  ApplyClassificationRejectionsRequest,
  ClassificationRejectionApplyResult,
  ClassificationRejectionMemoryRequest,
  ClassificationRejectionMemorySnapshot,
} from '../../../shared/features/classification/rejection-schemas.ts'
import {
  standaloneClassificationContextRequestSchema,
  standaloneClassificationContextSchema,
} from '../../../shared/features/classification/standalone-context-schemas.ts'
import type {
  StandaloneClassificationContextRequest,
  StandaloneClassificationContext,
} from '../../../shared/features/classification/standalone-context-schemas.ts'

export type ClassificationRequest =
  | { action: 'read-sample-instruments'; input: SampleInstrumentsRequest }
  | { action: 'save-sample-instruments'; input: SampleInstrumentsSaveRequest }
  | { action: 'create-author' | 'create-instrument'; input: { name: string } }
  | {
      action: 'rename-author' | 'rename-instrument'
      input: { id: string; name: string }
    }
  | {
      action:
        | 'get-author'
        | 'get-instrument'
        | 'review-author-removal'
        | 'review-instrument-removal'
      id: string
    }
  | {
      action: 'list-authors' | 'list-instruments'
      input: ClassificationPageRequest
    }
  | {
      action: 'set-author-assignment' | 'set-instrument-assignment'
      input: ClassificationAssignmentRequest
    }
  | {
      action: 'list-target-authors' | 'list-target-instruments'
      target: ClassificationTarget
      input: ClassificationPageRequest
    }
  | {
      action: 'list-author-uses' | 'list-instrument-uses'
      input: ClassificationUsesRequest
    }
  | {
      action: 'read-classification-rejections'
      input: ClassificationRejectionMemoryRequest
    }
  | {
      action: 'apply-classification-rejections'
      input: ApplyClassificationRejectionsRequest
    }
  | {
      action: 'read-standalone-classification-context'
      input: StandaloneClassificationContextRequest
    }
  | {
      action: 'remove-author' | 'remove-instrument'
      input: ClassificationRemovalRequest
    }

export type ClassificationReply =
  | {
      action: 'read-sample-instruments' | 'save-sample-instruments'
      result: SampleInstrumentsSnapshot
    }
  | { action: 'create-author' | 'rename-author' | 'get-author'; result: Author }
  | {
      action: 'create-instrument' | 'rename-instrument' | 'get-instrument'
      result: Instrument
    }
  | {
      action: 'list-authors' | 'list-target-authors'
      result: ClassificationPage<Author>
    }
  | {
      action: 'list-instruments' | 'list-target-instruments'
      result: ClassificationPage<Instrument>
    }
  | {
      action: 'list-author-uses' | 'list-instrument-uses'
      result: ClassificationPage<ClassificationUse>
    }
  | {
      action: 'review-author-removal' | 'review-instrument-removal'
      result: ClassificationRemovalReview
    }
  | {
      action: 'read-classification-rejections'
      result: ClassificationRejectionMemorySnapshot
    }
  | {
      action: 'apply-classification-rejections'
      result: ClassificationRejectionApplyResult
    }
  | {
      action: 'read-standalone-classification-context'
      result: StandaloneClassificationContext
    }
  | { action: 'remove-author' | 'remove-instrument'; result: { id: string } }
  | {
      action: 'set-author-assignment' | 'set-instrument-assignment'
      result: { assigned: boolean }
    }

function isPageRequest(value: unknown): value is ClassificationPageRequest {
  try {
    requireClassificationPage(value)
    return true
  } catch {
    return false
  }
}

function isName(value: unknown): value is string {
  try {
    requireClassificationName(value)
    return true
  } catch {
    return false
  }
}

export function isClassificationRequest(
  value: unknown,
): value is ClassificationRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  switch (value.action) {
    case 'read-sample-instruments':
    case 'save-sample-instruments':
      try {
        if (value.action === 'read-sample-instruments') {
          requireSampleInstrumentsRequest(input)
        } else {
          requireSampleInstrumentsSaveRequest(input)
        }
        return true
      } catch {
        return false
      }
    case 'create-author':
    case 'create-instrument':
      return isRecord(input) && isName(input.name)
    case 'rename-author':
    case 'rename-instrument':
      return isRecord(input) && isEntityId(input.id) && isName(input.name)
    case 'get-author':
    case 'get-instrument':
    case 'review-author-removal':
    case 'review-instrument-removal':
      return isEntityId(value.id)
    case 'list-authors':
    case 'list-instruments':
      return isPageRequest(input)
    case 'list-target-authors':
    case 'list-target-instruments':
      return isClassificationTarget(value.target) && isPageRequest(input)
    case 'set-author-assignment':
    case 'set-instrument-assignment':
      return (
        isRecord(input) &&
        isEntityId(input.id) &&
        isClassificationTarget(input.target) &&
        typeof input.assigned === 'boolean'
      )
    case 'list-author-uses':
    case 'list-instrument-uses':
      return (
        isRecord(input) &&
        isEntityId(input.id) &&
        (input.kind === 'sample' || input.kind === 'pack') &&
        isPageRequest(input)
      )
    case 'remove-author':
    case 'remove-instrument':
      return isRecord(input) && isEntityId(input.id) && isToken(input.token)
    case 'read-classification-rejections':
      return classificationRejectionMemoryRequestSchema.safeParse(input).success
    case 'apply-classification-rejections':
      return applyClassificationRejectionsRequestSchema.safeParse(input).success
    case 'read-standalone-classification-context':
      return standaloneClassificationContextRequestSchema.safeParse(input)
        .success
    default:
      return false
  }
}

function isEntity(value: unknown): value is Author | Instrument {
  return (
    isRecord(value) &&
    isEntityId(value.id) &&
    isName(value.name) &&
    value.name === requireClassificationName(value.name)
  )
}

function isUse(value: unknown): value is ClassificationUse {
  return (
    isRecord(value) &&
    isEntityId(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0
  )
}

export function isClassificationReply(
  value: unknown,
): value is ClassificationReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'read-sample-instruments':
    case 'save-sample-instruments':
      return isSampleInstrumentsSnapshot(result)
    case 'create-author':
    case 'create-instrument':
    case 'rename-author':
    case 'rename-instrument':
    case 'get-author':
    case 'get-instrument':
      return isEntity(result)
    case 'list-authors':
    case 'list-instruments':
    case 'list-target-authors':
    case 'list-target-instruments':
      return isPage(result, isEntity)
    case 'list-author-uses':
    case 'list-instrument-uses':
      return isPage(result, isUse)
    case 'set-author-assignment':
    case 'set-instrument-assignment':
      return isRecord(result) && typeof result.assigned === 'boolean'
    case 'remove-author':
    case 'remove-instrument':
      return isRecord(result) && isEntityId(result.id)
    case 'read-classification-rejections':
      return classificationRejectionMemorySnapshotSchema.safeParse(result)
        .success
    case 'read-standalone-classification-context':
      return standaloneClassificationContextSchema.safeParse(result).success
    case 'apply-classification-rejections':
      return (
        isRecord(result) &&
        typeof result.applied === 'number' &&
        Number.isSafeInteger(result.applied) &&
        result.applied >= 0 &&
        typeof result.forgotten === 'number' &&
        Number.isSafeInteger(result.forgotten) &&
        result.forgotten >= 0
      )
    case 'review-author-removal':
    case 'review-instrument-removal':
      return (
        isRecord(result) &&
        isEntity(result.entity) &&
        isToken(result.token) &&
        typeof result.sampleCount === 'number' &&
        Number.isSafeInteger(result.sampleCount) &&
        result.sampleCount >= 0 &&
        typeof result.packCount === 'number' &&
        Number.isSafeInteger(result.packCount) &&
        result.packCount >= 0 &&
        (result.linkedProfile === null ||
          (value.action === 'review-author-removal' &&
            isUse(result.linkedProfile)))
      )
    default:
      return false
  }
}
