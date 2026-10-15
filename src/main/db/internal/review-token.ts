import { createHash } from 'node:crypto'
import type { Hash } from 'node:crypto'
import { DomainValidationError } from '../../../shared/domain/validation.ts'

export function requireReviewToken(
  value: unknown,
  message = 'A removal review token is required.',
): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DomainValidationError(message)
  }
}

// Callers own the snapshot fields and the deterministic order of later updates.
export function createReviewHash(kind: string, ...snapshot: unknown[]): Hash {
  return createHash('sha256').update(JSON.stringify([kind, ...snapshot]))
}
