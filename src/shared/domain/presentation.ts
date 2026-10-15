import { DomainValidationError } from './validation.ts'

export function requireDescription(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string' || /[^\P{Cc}\n\r]/u.test(value)) {
    throw new DomainValidationError(
      'Descriptions must not contain control characters.',
    )
  }
  const description = value.normalize('NFC')
  if (Array.from(description).length > 5000) {
    throw new DomainValidationError(
      'Descriptions must contain at most 5000 Unicode characters.',
    )
  }
  return description.trim() ? description : null
}
