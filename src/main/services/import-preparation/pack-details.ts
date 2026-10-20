import path from 'node:path'
import {
  DomainValidationError,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import type { PreparationPackDetails } from './types.ts'

export function suggestPackDetails(location: string): PreparationPackDetails {
  const name = path.basename(location)
  try {
    return { name: requirePresentationName(name), description: null }
  } catch (error) {
    if (!(error instanceof DomainValidationError)) {
      throw error
    }
    // Preserve the suggestion for explicit correction, never truncate it or
    // prevent entering Pack mode (the editor requires that mode).
    return { name, description: null, nameIssue: 'INVALID_NAME' }
  }
}
