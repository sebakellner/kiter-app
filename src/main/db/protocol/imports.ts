import {
  importCatalogRequestSchema,
  importCatalogSnapshotSchema,
  type ImportCatalogRequest,
  type ImportCatalogSnapshot,
} from '../../../shared/features/imports/schemas.ts'
import { isRecord } from '../../../shared/domain/validation.ts'
import {
  packOrganizationCatalogRequestSchema,
  packOrganizationCatalogPageSchema,
  type PackOrganizationCatalogRequest,
  type PackOrganizationCatalogPage,
} from '../../../shared/features/imports/pack-organization-schemas.ts'
import {
  importClassificationContextRequestSchema,
  importClassificationContextSchema,
  type ImportClassificationContextRequest,
  type ImportClassificationContext,
} from '../../../shared/features/classification/import-context-schemas.ts'

export type ImportPreparationRequest =
  | {
      action: 'read-import-pack-organization-catalog'
      input: PackOrganizationCatalogRequest
    }
  | {
      action: 'read-import-catalog'
      input: ImportCatalogRequest
    }
  | {
      action: 'read-import-classification-context'
      input: ImportClassificationContextRequest
    }
export type ImportPreparationReply =
  | {
      action: 'read-import-pack-organization-catalog'
      result: PackOrganizationCatalogPage
    }
  | {
      action: 'read-import-catalog'
      result: ImportCatalogSnapshot
    }
  | {
      action: 'read-import-classification-context'
      result: ImportClassificationContext
    }

export function isImportPreparationRequest(
  value: unknown,
): value is ImportPreparationRequest {
  return (
    isRecord(value) &&
    ((value.action === 'read-import-pack-organization-catalog' &&
      packOrganizationCatalogRequestSchema.safeParse(value.input).success) ||
      (value.action === 'read-import-catalog' &&
        importCatalogRequestSchema.safeParse(value.input).success) ||
      (value.action === 'read-import-classification-context' &&
        importClassificationContextRequestSchema.safeParse(value.input)
          .success))
  )
}

export function isImportPreparationReply(
  value: unknown,
): value is ImportPreparationReply {
  return (
    isRecord(value) &&
    ((value.action === 'read-import-pack-organization-catalog' &&
      packOrganizationCatalogPageSchema.safeParse(value.result).success) ||
      (value.action === 'read-import-catalog' &&
        importCatalogSnapshotSchema.safeParse(value.result).success) ||
      (value.action === 'read-import-classification-context' &&
        importClassificationContextSchema.safeParse(value.result).success))
  )
}
