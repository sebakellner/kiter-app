import type { ClientRequest } from './core.ts'
import type {
  ImportCatalogRequest,
  ImportCatalogSnapshot,
} from '../../../shared/features/imports/schemas.ts'
import type {
  ImportClassificationContextRequest,
  ImportClassificationContext,
} from '../../../shared/features/classification/import-context-schemas.ts'
import type {
  ApplyClassificationRejectionsRequest,
  ClassificationRejectionApplyResult,
  ClassificationRejectionMemoryRequest,
  ClassificationRejectionMemorySnapshot,
} from '../../../shared/features/classification/rejection-schemas.ts'
import type {
  StandaloneClassificationContextRequest,
  StandaloneClassificationContext,
} from '../../../shared/features/classification/standalone-context-schemas.ts'
import type {
  StandaloneExecutionTargetRequest,
  StandaloneExecutionTargetResult,
} from '../../../shared/features/classification/execution-schemas.ts'
import type {
  PackOrganizationCatalogRequest,
  PackOrganizationCatalogPage,
} from '../../../shared/features/imports/pack-organization-schemas.ts'

export interface ImportsCommands {
  readImportPackOrganizationCatalog(
    input: PackOrganizationCatalogRequest,
  ): Promise<PackOrganizationCatalogPage>
  readImportClassificationContext(
    input: ImportClassificationContextRequest,
  ): Promise<ImportClassificationContext>
  readImportCatalog(input: ImportCatalogRequest): Promise<ImportCatalogSnapshot>
  readClassificationRejections(
    input: ClassificationRejectionMemoryRequest,
  ): Promise<ClassificationRejectionMemorySnapshot>
  applyClassificationRejections(
    input: ApplyClassificationRejectionsRequest,
  ): Promise<ClassificationRejectionApplyResult>
  readStandaloneClassificationContext(
    input: StandaloneClassificationContextRequest,
  ): Promise<StandaloneClassificationContext>
  executeStandaloneClassificationTarget(
    input: StandaloneExecutionTargetRequest,
  ): Promise<StandaloneExecutionTargetResult>
}

export function importsCommands(request: ClientRequest): ImportsCommands {
  return {
    async readImportPackOrganizationCatalog(
      input: PackOrganizationCatalogRequest,
    ): Promise<PackOrganizationCatalogPage> {
      return request({
        action: 'read-import-pack-organization-catalog',
        input,
      })
    },

    async readImportClassificationContext(
      input: ImportClassificationContextRequest,
    ): Promise<ImportClassificationContext> {
      return request({
        action: 'read-import-classification-context',
        input,
      })
    },

    async readImportCatalog(
      input: ImportCatalogRequest,
    ): Promise<ImportCatalogSnapshot> {
      return request({ action: 'read-import-catalog', input })
    },

    async readClassificationRejections(
      input: ClassificationRejectionMemoryRequest,
    ): Promise<ClassificationRejectionMemorySnapshot> {
      return request({ action: 'read-classification-rejections', input })
    },

    async applyClassificationRejections(
      input: ApplyClassificationRejectionsRequest,
    ): Promise<ClassificationRejectionApplyResult> {
      return request({ action: 'apply-classification-rejections', input })
    },

    async readStandaloneClassificationContext(
      input: StandaloneClassificationContextRequest,
    ): Promise<StandaloneClassificationContext> {
      return request({
        action: 'read-standalone-classification-context',
        input,
      })
    },

    async executeStandaloneClassificationTarget(
      input: StandaloneExecutionTargetRequest,
    ): Promise<StandaloneExecutionTargetResult> {
      return request({
        action: 'execute-standalone-classification-target',
        input,
      })
    },
  }
}
