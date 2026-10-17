import { join } from 'node:path'
import { WorkerTransport } from './client/worker-transport'
import type { LibrarySample, FavoriteState } from '../../shared/ipc'
import type {
  CatalogSample,
  LibraryListRequest,
} from '../../shared/ipc/library'
import type { Page } from '../../shared/domain/pagination'
import type { DiscoveredAudioFile } from '../../shared/domain/source'
import type {
  LocalProfile,
  ProfileUpdateRequest,
  UserProfile,
  UserPreferences,
} from '../../shared/domain/profile'
import {
  requirePreviewVolume,
  requireProfileUpdate,
} from '../../shared/domain/profile'
import { requireEntityId } from '../../shared/domain/validation'
import type { DbReply } from './protocol/messages'
import type {
  Author,
  Category,
  ClassificationAssignmentRequest,
  ClassificationPage,
  ClassificationPageRequest,
  ClassificationRemovalRequest,
  ClassificationRemovalReview,
  ClassificationTarget,
  ClassificationUse,
  ClassificationUsesRequest,
} from '../../shared/domain/classification'
import type { ClassificationRequest } from './protocol/classification'
import { isClassificationRequest } from './protocol/classification'
import { DomainValidationError } from '../../shared/domain/validation'
import type {
  Collection,
  CollectionCreateRequest,
  CollectionUpdateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionMembership,
  CollectionMembershipRequest,
  CollectionReorderRequest,
  CollectionRemovalReview,
  CollectionRemovalRequest,
} from '../../shared/domain/collection'
import type { CollectionRequest } from './protocol/collections'
import { isCollectionRequest } from './protocol/collections'
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
} from '../../shared/domain/pack'
import type { PackRequest } from './protocol/packs'
import { isPackRequest } from './protocol/packs'
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
} from '../../shared/domain/sample'
import type { SourceRoot } from '../../shared/domain/source'
import type { SampleRequest } from './protocol/samples'
import { isSampleRequest } from './protocol/samples'
import type { AssetRequest } from './protocol/assets'
import { isAssetRequest } from './protocol/assets'
import type {
  ImageAsset,
  ImagePublicationRequest,
  ImageReferenceRequest,
} from '../../shared/domain/imageAsset'

const UNEXPECTED_REPLY_MESSAGE = 'Unexpected database response'

export class DbClient {
  async listCatalogSamples(
    input: LibraryListRequest = {},
  ): Promise<Page<CatalogSample>> {
    const reply = await this.sampleRequest({
      action: 'list-catalog-samples',
      input,
    })
    if (reply.action !== 'list-catalog-samples') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getCatalogSample(id: string): Promise<CatalogSample> {
    const reply = await this.sampleRequest({ action: 'get-catalog-sample', id })
    if (reply.action !== 'get-catalog-sample') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }
  private readonly transport: WorkerTransport

  private constructor(transport: WorkerTransport) {
    this.transport = transport
  }

  static async open(
    filename: string,
    options: {
      backupDirectory?: string
      imagesDirectory?: string
      restoreFrom?: string
    } = {},
  ): Promise<DbClient> {
    return new DbClient(
      await WorkerTransport.open(filename, {
        workerPath: join(__dirname, 'dbWorker.js'),
        migrationsFolder: join(__dirname, 'migrations'),
        ...options,
      }),
    )
  }

  private async packRequest(request: PackRequest): Promise<DbReply> {
    this.transport.assertOpen()
    if (!isPackRequest(request)) {
      throw new DomainValidationError('Invalid Pack request.')
    }
    return this.transport.request(request)
  }

  async getPack(id: string): Promise<Pack> {
    const reply = await this.packRequest({ action: 'get-pack', id })
    if (reply.action !== 'get-pack') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  private async assetRequest(request: AssetRequest): Promise<DbReply> {
    this.transport.assertOpen()
    if (!isAssetRequest(request)) {
      throw new DomainValidationError('Invalid profile or image request.')
    }
    return this.transport.request(request)
  }

  async publishImage(input: ImagePublicationRequest): Promise<ImageAsset> {
    const reply = await this.assetRequest({ action: 'publish-image', input })
    if (reply.action !== 'publish-image') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setImageReference(
    input: ImageReferenceRequest,
  ): Promise<{ assetId: string | null }> {
    const reply = await this.assetRequest({
      action: 'set-image-reference',
      input,
    })
    if (reply.action !== 'set-image-reference') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getImage(id: string): Promise<ImageAsset | null> {
    const reply = await this.assetRequest({ action: 'get-image', id })
    if (reply.action !== 'get-image') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listImages(after: string | null = null): Promise<ImageAsset[]> {
    const reply = await this.assetRequest({ action: 'list-images', after })
    if (reply.action !== 'list-images') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async claimImageCleanup(id: string): Promise<ImageAsset | null> {
    const reply = await this.assetRequest({ action: 'claim-image-cleanup', id })
    if (reply.action !== 'claim-image-cleanup') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async finishImageCleanup(id: string): Promise<{ id: string }> {
    const reply = await this.assetRequest({
      action: 'finish-image-cleanup',
      id,
    })
    if (reply.action !== 'finish-image-cleanup') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getPackSourceRoot(root: string): Promise<{ id: string }> {
    const reply = await this.packRequest({
      action: 'get-pack-source-root',
      root,
    })
    if (reply.action !== 'get-pack-source-root') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async updatePack(input: PackUpdateRequest): Promise<Pack> {
    const reply = await this.packRequest({ action: 'update-pack', input })
    if (reply.action !== 'update-pack') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listPacks(input: PackPageRequest = {}): Promise<PackPage<Pack>> {
    const reply = await this.packRequest({ action: 'list-packs', input })
    if (reply.action !== 'list-packs') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listPackSamples(
    id: string,
    input: PackPageRequest = {},
  ): Promise<PackPage<PackSample>> {
    const reply = await this.packRequest({
      action: 'list-pack-samples',
      id,
      input,
    })
    if (reply.action !== 'list-pack-samples') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewPackImport(id: string): Promise<PackImportReview> {
    const reply = await this.packRequest({ action: 'review-pack-import', id })
    if (reply.action !== 'review-pack-import') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listPackImportCandidates(
    id: string,
    input: PackPageRequest = {},
  ): Promise<PackPage<PackImportCandidate>> {
    const reply = await this.packRequest({
      action: 'list-pack-import-candidates',
      id,
      input,
    })
    if (reply.action !== 'list-pack-import-candidates') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async importPack(input: PackImportRequest): Promise<Pack> {
    const reply = await this.packRequest({ action: 'import-pack', input })
    if (reply.action !== 'import-pack') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getSampleOrigin(id: string): Promise<SampleOrigin> {
    const reply = await this.packRequest({ action: 'get-sample-origin', id })
    if (reply.action !== 'get-sample-origin') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setSampleOrigin(input: SampleOriginRequest): Promise<SampleOrigin> {
    const reply = await this.packRequest({ action: 'set-sample-origin', input })
    if (reply.action !== 'set-sample-origin') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewPackRemoval(id: string): Promise<PackRemovalReview> {
    const reply = await this.packRequest({ action: 'review-pack-removal', id })
    if (reply.action !== 'review-pack-removal') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async removePack(input: PackRemovalRequest): Promise<{ id: string }> {
    const reply = await this.packRequest({ action: 'remove-pack', input })
    if (reply.action !== 'remove-pack') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async importFolder(
    root: string,
    files: DiscoveredAudioFile[],
  ): Promise<LibrarySample[]> {
    const reply = await this.transport.request({
      action: 'import',
      root,
      files,
    })
    if (reply.action !== 'import') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setFavorite(id: string, favorite: boolean): Promise<FavoriteState> {
    this.transport.assertOpen()
    requireEntityId(id)
    const reply = await this.transport.request({
      action: 'favorite',
      id,
      favorite,
    })
    if (reply.action !== 'favorite') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  private async classificationRequest(
    request: ClassificationRequest,
  ): Promise<DbReply> {
    this.transport.assertOpen()
    if (!isClassificationRequest(request)) {
      throw new DomainValidationError('Invalid classification request.')
    }
    return this.transport.request(request)
  }

  async createAuthor(input: { name: string }): Promise<Author> {
    const reply = await this.classificationRequest({
      action: 'create-author',
      input,
    })
    if (reply.action !== 'create-author') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async createCategory(input: { name: string }): Promise<Category> {
    const reply = await this.classificationRequest({
      action: 'create-category',
      input,
    })
    if (reply.action !== 'create-category') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async renameAuthor(input: { id: string; name: string }): Promise<Author> {
    const reply = await this.classificationRequest({
      action: 'rename-author',
      input,
    })
    if (reply.action !== 'rename-author') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async renameCategory(input: { id: string; name: string }): Promise<Category> {
    const reply = await this.classificationRequest({
      action: 'rename-category',
      input,
    })
    if (reply.action !== 'rename-category') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getAuthor(id: string): Promise<Author> {
    const reply = await this.classificationRequest({ action: 'get-author', id })
    if (reply.action !== 'get-author') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getCategory(id: string): Promise<Category> {
    const reply = await this.classificationRequest({
      action: 'get-category',
      id,
    })
    if (reply.action !== 'get-category') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listAuthors(
    input: ClassificationPageRequest = {},
  ): Promise<ClassificationPage<Author>> {
    const reply = await this.classificationRequest({
      action: 'list-authors',
      input,
    })
    if (reply.action !== 'list-authors') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listCategories(
    input: ClassificationPageRequest = {},
  ): Promise<ClassificationPage<Category>> {
    const reply = await this.classificationRequest({
      action: 'list-categories',
      input,
    })
    if (reply.action !== 'list-categories') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setAuthorAssignment(
    input: ClassificationAssignmentRequest,
  ): Promise<{ assigned: boolean }> {
    const reply = await this.classificationRequest({
      action: 'set-author-assignment',
      input,
    })
    if (reply.action !== 'set-author-assignment') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setCategoryAssignment(
    input: ClassificationAssignmentRequest,
  ): Promise<{ assigned: boolean }> {
    const reply = await this.classificationRequest({
      action: 'set-category-assignment',
      input,
    })
    if (reply.action !== 'set-category-assignment') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listTargetAuthors(
    target: ClassificationTarget,
    input: ClassificationPageRequest = {},
  ): Promise<ClassificationPage<Author>> {
    const reply = await this.classificationRequest({
      action: 'list-target-authors',
      target,
      input,
    })
    if (reply.action !== 'list-target-authors') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listTargetCategories(
    target: ClassificationTarget,
    input: ClassificationPageRequest = {},
  ): Promise<ClassificationPage<Category>> {
    const reply = await this.classificationRequest({
      action: 'list-target-categories',
      target,
      input,
    })
    if (reply.action !== 'list-target-categories') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listAuthorUses(
    input: ClassificationUsesRequest,
  ): Promise<ClassificationPage<ClassificationUse>> {
    const reply = await this.classificationRequest({
      action: 'list-author-uses',
      input,
    })
    if (reply.action !== 'list-author-uses') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listCategoryUses(
    input: ClassificationUsesRequest,
  ): Promise<ClassificationPage<ClassificationUse>> {
    const reply = await this.classificationRequest({
      action: 'list-category-uses',
      input,
    })
    if (reply.action !== 'list-category-uses') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewAuthorRemoval(id: string): Promise<ClassificationRemovalReview> {
    const reply = await this.classificationRequest({
      action: 'review-author-removal',
      id,
    })
    if (reply.action !== 'review-author-removal') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewCategoryRemoval(
    id: string,
  ): Promise<ClassificationRemovalReview> {
    const reply = await this.classificationRequest({
      action: 'review-category-removal',
      id,
    })
    if (reply.action !== 'review-category-removal') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async removeAuthor(
    input: ClassificationRemovalRequest,
  ): Promise<{ id: string }> {
    const reply = await this.classificationRequest({
      action: 'remove-author',
      input,
    })
    if (reply.action !== 'remove-author') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async removeCategory(
    input: ClassificationRemovalRequest,
  ): Promise<{ id: string }> {
    const reply = await this.classificationRequest({
      action: 'remove-category',
      input,
    })
    if (reply.action !== 'remove-category') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  private async collectionRequest(
    request: CollectionRequest,
  ): Promise<DbReply> {
    this.transport.assertOpen()
    if (!isCollectionRequest(request)) {
      throw new DomainValidationError('Invalid Collection request.')
    }
    return this.transport.request(request)
  }

  async createCollection(input: CollectionCreateRequest): Promise<Collection> {
    const reply = await this.collectionRequest({
      action: 'create-collection',
      input,
    })
    if (reply.action !== 'create-collection') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async updateCollection(input: CollectionUpdateRequest): Promise<Collection> {
    const reply = await this.collectionRequest({
      action: 'update-collection',
      input,
    })
    if (reply.action !== 'update-collection') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getCollection(id: string): Promise<Collection> {
    const reply = await this.collectionRequest({ action: 'get-collection', id })
    if (reply.action !== 'get-collection') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listCollections(
    input: CollectionPageRequest = {},
  ): Promise<CollectionPage<Collection>> {
    const reply = await this.collectionRequest({
      action: 'list-collections',
      input,
    })
    if (reply.action !== 'list-collections') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listCollectionSamples(
    id: string,
    input: CollectionPageRequest = {},
  ): Promise<CollectionPage<CollectionMembership>> {
    const reply = await this.collectionRequest({
      action: 'list-collection-samples',
      id,
      input,
    })
    if (reply.action !== 'list-collection-samples') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setCollectionMembership(
    input: CollectionMembershipRequest,
  ): Promise<{ assigned: boolean }> {
    const reply = await this.collectionRequest({
      action: 'set-collection-membership',
      input,
    })
    if (reply.action !== 'set-collection-membership') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reorderCollection(
    input: CollectionReorderRequest,
  ): Promise<{ id: string }> {
    const reply = await this.collectionRequest({
      action: 'reorder-collection',
      input,
    })
    if (reply.action !== 'reorder-collection') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewCollectionRemoval(id: string): Promise<CollectionRemovalReview> {
    const reply = await this.collectionRequest({
      action: 'review-collection-removal',
      id,
    })
    if (reply.action !== 'review-collection-removal') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async removeCollection(
    input: CollectionRemovalRequest,
  ): Promise<{ id: string }> {
    const reply = await this.collectionRequest({
      action: 'remove-collection',
      input,
    })
    if (reply.action !== 'remove-collection') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  private async sampleRequest(request: SampleRequest): Promise<DbReply> {
    this.transport.assertOpen()
    if (!isSampleRequest(request)) {
      throw new DomainValidationError('Invalid Sample request.')
    }
    return this.transport.request(request)
  }

  async getSample(id: string): Promise<Sample> {
    const reply = await this.sampleRequest({ action: 'get-sample', id })
    if (reply.action !== 'get-sample') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async updateSample(input: SampleUpdateRequest): Promise<Sample> {
    const reply = await this.sampleRequest({ action: 'update-sample', input })
    if (reply.action !== 'update-sample') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listSampleReferences(
    input: SampleReferencesRequest,
  ): Promise<SamplePage<SampleReference>> {
    const reply = await this.sampleRequest({
      action: 'list-sample-references',
      input,
    })
    if (reply.action !== 'list-sample-references') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async reviewSampleRemoval(id: string): Promise<SampleRemovalReview> {
    const reply = await this.sampleRequest({
      action: 'review-sample-removal',
      id,
    })
    if (reply.action !== 'review-sample-removal') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async removeSample(input: SampleRemovalRequest): Promise<{ id: string }> {
    const reply = await this.sampleRequest({ action: 'remove-sample', input })
    if (reply.action !== 'remove-sample') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async listExcludedSources(
    input: SamplePageRequest = {},
  ): Promise<SamplePage<ExcludedSource>> {
    const reply = await this.sampleRequest({
      action: 'list-excluded-sources',
      input,
    })
    if (reply.action !== 'list-excluded-sources') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async getReinclusionRoot(
    input: SourceReinclusionRequest,
  ): Promise<SourceRoot> {
    const reply = await this.sampleRequest({
      action: 'get-reinclusion-root',
      input,
    })
    if (reply.action !== 'get-reinclusion-root') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  // Main's library service verifies the filesystem before submitting an observation.
  async reincludeSource(
    input: SourceReinclusionRequest,
    file: DiscoveredAudioFile,
  ): Promise<Sample> {
    const reply = await this.sampleRequest({
      action: 'reinclude-source',
      input,
      file,
    })
    if (reply.action !== 'reinclude-source') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async close(): Promise<void> {
    return this.transport.close()
  }

  async getLocalProfile(): Promise<LocalProfile> {
    const reply = await this.transport.request({
      action: 'profile',
    })
    if (reply.action !== 'profile') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async updateLocalProfile(input: ProfileUpdateRequest): Promise<UserProfile> {
    this.transport.assertOpen()
    const reply = await this.transport.request({
      action: 'update-profile',
      input: requireProfileUpdate(input),
    })
    if (reply.action !== 'update-profile') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setPreviewVolume(volume: number): Promise<UserPreferences> {
    this.transport.assertOpen()
    requirePreviewVolume(volume)
    const reply = await this.transport.request({
      action: 'volume',
      volume,
    })
    if (reply.action !== 'volume') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }
}
