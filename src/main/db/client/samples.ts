import type { ClientRequest } from './core.ts'
import type {
  CatalogSample,
  CatalogPage,
  LibraryListRequest,
} from '../../../shared/ipc/library.ts'
import type {
  DiscoveredAudioFile,
  SourceRoot,
} from '../../../shared/domain/source.ts'
import type {
  Sample,
  SampleUpdateRequest,
  SamplePage,
  SamplePageRequest,
  SampleReference,
  SampleReferencesRequest,
  SampleRemovalReview,
  SampleRemovalRequest,
  ExcludedSource,
  SourceReinclusionRequest,
} from '../../../shared/domain/sample.ts'

export interface SamplesCommands {
  listCatalogSamples(input?: LibraryListRequest): Promise<CatalogPage>
  getCatalogSample(id: string): Promise<CatalogSample>
  getSample(id: string): Promise<Sample>
  updateSample(input: SampleUpdateRequest): Promise<Sample>
  listSampleReferences(
    input: SampleReferencesRequest,
  ): Promise<SamplePage<SampleReference>>
  reviewSampleRemoval(id: string): Promise<SampleRemovalReview>
  removeSample(input: SampleRemovalRequest): Promise<{ id: string }>
  listExcludedSources(
    input?: SamplePageRequest,
  ): Promise<SamplePage<ExcludedSource>>
  getReinclusionRoot(input: SourceReinclusionRequest): Promise<SourceRoot>
  reincludeSource(
    input: SourceReinclusionRequest,
    file: DiscoveredAudioFile,
  ): Promise<Sample>
}

export function samplesCommands(request: ClientRequest): SamplesCommands {
  return {
    async listCatalogSamples(
      input: LibraryListRequest = {},
    ): Promise<CatalogPage> {
      return request({ action: 'list-catalog-samples', input })
    },

    async getCatalogSample(id: string): Promise<CatalogSample> {
      return request({ action: 'get-catalog-sample', id })
    },

    async getSample(id: string): Promise<Sample> {
      return request({ action: 'get-sample', id })
    },

    async updateSample(input: SampleUpdateRequest): Promise<Sample> {
      return request({ action: 'update-sample', input })
    },

    async listSampleReferences(
      input: SampleReferencesRequest,
    ): Promise<SamplePage<SampleReference>> {
      return request({ action: 'list-sample-references', input })
    },

    async reviewSampleRemoval(id: string): Promise<SampleRemovalReview> {
      return request({ action: 'review-sample-removal', id })
    },

    async removeSample(input: SampleRemovalRequest): Promise<{ id: string }> {
      return request({ action: 'remove-sample', input })
    },

    async listExcludedSources(
      input: SamplePageRequest = {},
    ): Promise<SamplePage<ExcludedSource>> {
      return request({ action: 'list-excluded-sources', input })
    },

    async getReinclusionRoot(
      input: SourceReinclusionRequest,
    ): Promise<SourceRoot> {
      return request({ action: 'get-reinclusion-root', input })
    },

    // Main's library service verifies the filesystem before submitting an observation.
    async reincludeSource(
      input: SourceReinclusionRequest,
      file: DiscoveredAudioFile,
    ): Promise<Sample> {
      return request({ action: 'reinclude-source', input, file })
    },
  }
}
