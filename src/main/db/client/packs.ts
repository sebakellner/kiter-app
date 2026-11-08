import type { ClientRequest } from './core.ts'
import type {
  Pack,
  PackUpdateRequest,
  PackPageRequest,
  PackPage,
  PackSample,
  PackImportCandidate,
  PackImportReview,
  PackImportRequest,
  SampleOrigin,
  SampleOriginRequest,
  PackRemovalReview,
  PackRemovalRequest,
} from '../../../shared/domain/pack.ts'
import type { PackListItem } from '../../../shared/ipc/packs.ts'

export interface PacksCommands {
  getPack(id: string): Promise<Pack>
  getPackSummary(id: string): Promise<PackListItem>
  getPackSourceRoot(root: string): Promise<{ id: string }>
  updatePack(input: PackUpdateRequest): Promise<Pack>
  listPacks(input?: PackPageRequest): Promise<PackPage<PackListItem>>
  listPackSamples(
    id: string,
    input?: PackPageRequest,
  ): Promise<PackPage<PackSample>>
  reviewPackImport(id: string): Promise<PackImportReview>
  listPackImportCandidates(
    id: string,
    input?: PackPageRequest,
  ): Promise<PackPage<PackImportCandidate>>
  importPack(input: PackImportRequest): Promise<Pack>
  getSampleOrigin(id: string): Promise<SampleOrigin>
  setSampleOrigin(input: SampleOriginRequest): Promise<SampleOrigin>
  reviewPackRemoval(id: string): Promise<PackRemovalReview>
  removePack(input: PackRemovalRequest): Promise<{ id: string }>
}

export function packsCommands(request: ClientRequest): PacksCommands {
  return {
    async getPack(id: string): Promise<Pack> {
      return request({ action: 'get-pack', id })
    },

    async getPackSummary(id: string): Promise<PackListItem> {
      return request({ action: 'get-pack-summary', id })
    },

    async getPackSourceRoot(root: string): Promise<{ id: string }> {
      return request({ action: 'get-pack-source-root', root })
    },

    async updatePack(input: PackUpdateRequest): Promise<Pack> {
      return request({ action: 'update-pack', input })
    },

    async listPacks(
      input: PackPageRequest = {},
    ): Promise<PackPage<PackListItem>> {
      return request({ action: 'list-packs', input })
    },

    async listPackSamples(
      id: string,
      input: PackPageRequest = {},
    ): Promise<PackPage<PackSample>> {
      return request({ action: 'list-pack-samples', id, input })
    },

    async reviewPackImport(id: string): Promise<PackImportReview> {
      return request({ action: 'review-pack-import', id })
    },

    async listPackImportCandidates(
      id: string,
      input: PackPageRequest = {},
    ): Promise<PackPage<PackImportCandidate>> {
      return request({ action: 'list-pack-import-candidates', id, input })
    },

    async importPack(input: PackImportRequest): Promise<Pack> {
      return request({ action: 'import-pack', input })
    },

    async getSampleOrigin(id: string): Promise<SampleOrigin> {
      return request({ action: 'get-sample-origin', id })
    },

    async setSampleOrigin(input: SampleOriginRequest): Promise<SampleOrigin> {
      return request({ action: 'set-sample-origin', input })
    },

    async reviewPackRemoval(id: string): Promise<PackRemovalReview> {
      return request({ action: 'review-pack-removal', id })
    },

    async removePack(input: PackRemovalRequest): Promise<{ id: string }> {
      return request({ action: 'remove-pack', input })
    },
  }
}
