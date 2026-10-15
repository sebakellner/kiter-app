import type {
  Author,
  Category,
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

export type ClassificationRequest =
  | { action: 'create-author' | 'create-category'; input: { name: string } }
  | {
      action: 'rename-author' | 'rename-category'
      input: { id: string; name: string }
    }
  | {
      action:
        | 'get-author'
        | 'get-category'
        | 'review-author-removal'
        | 'review-category-removal'
      id: string
    }
  | {
      action: 'list-authors' | 'list-categories'
      input: ClassificationPageRequest
    }
  | {
      action: 'set-author-assignment' | 'set-category-assignment'
      input: ClassificationAssignmentRequest
    }
  | {
      action: 'list-target-authors' | 'list-target-categories'
      target: ClassificationTarget
      input: ClassificationPageRequest
    }
  | {
      action: 'list-author-uses' | 'list-category-uses'
      input: ClassificationUsesRequest
    }
  | {
      action: 'remove-author' | 'remove-category'
      input: ClassificationRemovalRequest
    }

export type ClassificationReply =
  | { action: 'create-author' | 'rename-author' | 'get-author'; result: Author }
  | {
      action: 'create-category' | 'rename-category' | 'get-category'
      result: Category
    }
  | {
      action: 'list-authors' | 'list-target-authors'
      result: ClassificationPage<Author>
    }
  | {
      action: 'list-categories' | 'list-target-categories'
      result: ClassificationPage<Category>
    }
  | {
      action: 'list-author-uses' | 'list-category-uses'
      result: ClassificationPage<ClassificationUse>
    }
  | {
      action: 'review-author-removal' | 'review-category-removal'
      result: ClassificationRemovalReview
    }
  | { action: 'remove-author' | 'remove-category'; result: { id: string } }
  | {
      action: 'set-author-assignment' | 'set-category-assignment'
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
    case 'create-author':
    case 'create-category':
      return isRecord(input) && isName(input.name)
    case 'rename-author':
    case 'rename-category':
      return isRecord(input) && isEntityId(input.id) && isName(input.name)
    case 'get-author':
    case 'get-category':
    case 'review-author-removal':
    case 'review-category-removal':
      return isEntityId(value.id)
    case 'list-authors':
    case 'list-categories':
      return isPageRequest(input)
    case 'list-target-authors':
    case 'list-target-categories':
      return isClassificationTarget(value.target) && isPageRequest(input)
    case 'set-author-assignment':
    case 'set-category-assignment':
      return (
        isRecord(input) &&
        isEntityId(input.id) &&
        isClassificationTarget(input.target) &&
        typeof input.assigned === 'boolean'
      )
    case 'list-author-uses':
    case 'list-category-uses':
      return (
        isRecord(input) &&
        isEntityId(input.id) &&
        (input.kind === 'sample' || input.kind === 'pack') &&
        isPageRequest(input)
      )
    case 'remove-author':
    case 'remove-category':
      return isRecord(input) && isEntityId(input.id) && isToken(input.token)
    default:
      return false
  }
}

function isEntity(value: unknown): value is Author | Category {
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
    case 'create-author':
    case 'create-category':
    case 'rename-author':
    case 'rename-category':
    case 'get-author':
    case 'get-category':
      return isEntity(result)
    case 'list-authors':
    case 'list-categories':
    case 'list-target-authors':
    case 'list-target-categories':
      return isPage(result, isEntity)
    case 'list-author-uses':
    case 'list-category-uses':
      return isPage(result, isUse)
    case 'set-author-assignment':
    case 'set-category-assignment':
      return isRecord(result) && typeof result.assigned === 'boolean'
    case 'remove-author':
    case 'remove-category':
      return isRecord(result) && isEntityId(result.id)
    case 'review-author-removal':
    case 'review-category-removal':
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
