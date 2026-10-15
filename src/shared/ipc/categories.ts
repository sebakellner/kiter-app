import {
  requireClassificationName,
  requireClassificationPage,
} from '../domain/classification.ts'
import type {
  Category,
  ClassificationPage,
  ClassificationPageRequest,
} from '../domain/classification.ts'
import { requirePage } from '../domain/pagination.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requireEntityId,
} from '../domain/validation.ts'
import type { IpcResult } from './result.ts'

export const CATEGORY_CHANNELS = {
  list: 'categories:list',
  create: 'categories:create',
  rename: 'categories:rename',
} as const

export type CategoryListRequest = ClassificationPageRequest
export type CategoryPage = ClassificationPage<Category>

export interface CategoryCreateRequest {
  name: string
}

export interface CategoryRenameRequest extends CategoryCreateRequest {
  id: string
}

export interface CategoriesApi {
  list: (request?: CategoryListRequest) => Promise<IpcResult<CategoryPage>>
  create: (request: CategoryCreateRequest) => Promise<IpcResult<Category>>
  rename: (request: CategoryRenameRequest) => Promise<IpcResult<Category>>
}

export function requireCategoryListRequest(
  value: unknown,
): CategoryListRequest {
  return requireClassificationPage(value)
}

export function requireCategoryCreateRequest(
  value: unknown,
): CategoryCreateRequest {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Category request.')
  }
  return { name: requireClassificationName(value.name) }
}

export function requireCategoryRenameRequest(
  value: unknown,
): CategoryRenameRequest {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Category request.')
  }
  return {
    id: requireEntityId(value.id),
    name: requireClassificationName(value.name),
  }
}

export function isCategory(value: unknown): value is Category {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  try {
    return value.name === requireClassificationName(value.name)
  } catch {
    return false
  }
}

export function isCategoryPage(value: unknown): value is CategoryPage {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requirePage(value)
    return (
      value.limit === limit &&
      value.offset === offset &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.every(isCategory) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset)
    )
  } catch {
    return false
  }
}
