export class DomainValidationError extends Error {
  readonly code = 'INVALID_INPUT'

  constructor(message: string) {
    super(message)
    this.name = 'DomainValidationError'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEntityId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

export function requireEntityId(value: unknown): string {
  if (!isEntityId(value)) {
    throw new DomainValidationError('Invalid entity identifier')
  }
  return value
}

export function requireName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DomainValidationError('A nonempty name is required')
  }
  return value.trim()
}

export function requirePresentationName(value: unknown): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new DomainValidationError(
      'Names must not contain line breaks or control characters.',
    )
  }
  const name = requireName(value).normalize('NFC')
  if (Array.from(name).length > 120) {
    throw new DomainValidationError(
      'Names must contain between 1 and 120 Unicode characters.',
    )
  }
  return name
}
