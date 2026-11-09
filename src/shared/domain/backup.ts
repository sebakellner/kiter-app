import { isRecord } from './validation.ts'

// A backup kind states why the copy exists, never whether it is valid. Validity
// is established only by verifying the copy itself.
export type BackupKind = 'pre-migration' | 'pre-restoration' | 'manual'

export interface BackupSummary {
  location: string
  createdAt: string
  kind: BackupKind
  schemaVersion: number
  catalogBytes: number
  imageBytes: number
  imageCount: number
  totalBytes: number
}

const kinds: readonly BackupKind[] = [
  'pre-migration',
  'pre-restoration',
  'manual',
]

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isBackupKind(value: unknown): value is BackupKind {
  return kinds.some((kind) => kind === value)
}

export function isBackupSummary(value: unknown): value is BackupSummary {
  return (
    isRecord(value) &&
    typeof value.location === 'string' &&
    value.location.length > 0 &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isBackupKind(value.kind) &&
    typeof value.schemaVersion === 'number' &&
    Number.isSafeInteger(value.schemaVersion) &&
    value.schemaVersion >= 1 &&
    isByteCount(value.catalogBytes) &&
    isByteCount(value.imageBytes) &&
    isByteCount(value.imageCount) &&
    isByteCount(value.totalBytes) &&
    value.totalBytes === value.catalogBytes + value.imageBytes &&
    // A copy without a catalog is not a backup.
    value.catalogBytes > 0
  )
}
