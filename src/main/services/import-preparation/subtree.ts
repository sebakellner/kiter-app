import path from 'node:path'
import { DomainValidationError } from '../../../shared/domain/validation.ts'

export function requireSubtreeScope(
  value: string,
  paths: path.PlatformPath = path,
): string {
  // Windows accepts both separator spellings. POSIX backslashes are literal
  // filename characters and must never be reinterpreted as another folder.
  const components = value.split(paths.sep === '\\' ? /[\\/]/u : '/')
  if (
    value.includes('\0') ||
    paths.parse(value).root ||
    components.some((part) => part === '.' || part === '..')
  ) {
    throw new DomainValidationError('Select a relative snapshot folder scope.')
  }
  return components.filter(Boolean).join(paths.sep)
}
