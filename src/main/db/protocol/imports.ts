import {
  importCatalogRequestSchema,
  importCatalogSnapshotSchema,
  type ImportCatalogRequest,
  type ImportCatalogSnapshot,
} from '../../../shared/features/imports/schemas.ts'
import { isRecord } from '../../../shared/domain/validation.ts'

export type ImportPreparationRequest = {
  action: 'read-import-catalog'
  input: ImportCatalogRequest
}
export type ImportPreparationReply = {
  action: 'read-import-catalog'
  result: ImportCatalogSnapshot
}

export function isImportPreparationRequest(
  value: unknown,
): value is ImportPreparationRequest {
  return (
    isRecord(value) &&
    value.action === 'read-import-catalog' &&
    importCatalogRequestSchema.safeParse(value.input).success
  )
}

export function isImportPreparationReply(
  value: unknown,
): value is ImportPreparationReply {
  return (
    isRecord(value) &&
    value.action === 'read-import-catalog' &&
    importCatalogSnapshotSchema.safeParse(value.result).success
  )
}
