import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requireName,
  requirePresentationName,
} from './validation.ts'
import { requirePage } from './pagination.ts'
import type { Page, PageRequest } from './pagination.ts'

export interface Category {
  id: string
  name: string
}

export interface Author {
  id: string
  name: string
}

export function normalizeName(value: unknown): string {
  return requireName(value).normalize('NFC').toLowerCase()
}

export function requireClassificationName(value: unknown): string {
  return requirePresentationName(value)
}

export interface ClassificationPageRequest extends PageRequest {
  search?: string
}

export type ClassificationPage<T> = Page<T>

export interface ClassificationTarget {
  kind: 'sample' | 'pack'
  id: string
}

export interface ClassificationUse {
  id: string
  name: string
}

export interface ClassificationUsesRequest {
  id: string
  kind: 'sample' | 'pack'
  limit?: number
  offset?: number
}

export interface ClassificationRemovalReview {
  entity: Author | Category
  sampleCount: number
  packCount: number
  linkedProfile: { id: string; name: string } | null
  token: string
}

export interface ClassificationRemovalRequest {
  id: string
  token: string
}

export interface ClassificationAssignmentRequest {
  id: string
  target: ClassificationTarget
  assigned: boolean
}

export function requireClassificationPage(value: unknown): {
  search: string
  limit: number
  offset: number
} {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid page request.')
  }
  const { limit, offset } = requirePage(value)
  const { search = '' } = value
  if (
    typeof search !== 'string' ||
    /[\p{Cc}\p{Zl}\p{Zp}]/u.test(search) ||
    Array.from(search.trim().normalize('NFC')).length > 120
  ) {
    throw new DomainValidationError('Invalid page request.')
  }
  return { limit, offset, search: search.trim().normalize('NFC').toLowerCase() }
}

export function isClassificationTarget(
  value: unknown,
): value is ClassificationTarget {
  return (
    isRecord(value) &&
    (value.kind === 'sample' || value.kind === 'pack') &&
    isEntityId(value.id)
  )
}
