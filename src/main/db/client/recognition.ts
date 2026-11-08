import type { ClientRequest } from './core.ts'
import type {
  SampleTypeRequest,
  SampleTypeSaveRequest,
  SampleTypeSnapshot,
} from '../../../shared/ipc/sampleType.ts'
import type {
  SampleGenresRequest,
  SampleGenresSaveRequest,
  SampleGenresSnapshot,
} from '../../../shared/ipc/genres.ts'
import type { Page, PageRequest } from '../../../shared/domain/pagination.ts'
import type {
  ClassificationAssignmentRequest,
  ClassificationPageRequest,
  ClassificationRemovalRequest,
  ClassificationRemovalReview,
  ClassificationTarget,
} from '../../../shared/domain/classification.ts'
import type { ClassificationApplyRequest } from '../../../shared/ipc/classification.ts'
import type {
  AliasUpdate,
  AliasUpdateRequest,
} from '../../../shared/ipc/aliasUpdates.ts'
import type {
  ClassificationPreparationRequest,
  ClassificationPreparationPage,
} from '../../../shared/ipc/classification.ts'
import type {
  AliasWriteRequest,
  Genre,
  RecognitionAlias,
  VocabularyEntry,
} from '../../../shared/domain/recognition.ts'

export interface RecognitionCommands {
  readSampleType(input: SampleTypeRequest): Promise<SampleTypeSnapshot>
  saveSampleType(input: SampleTypeSaveRequest): Promise<SampleTypeSnapshot>
  readSampleGenres(input: SampleGenresRequest): Promise<SampleGenresSnapshot>
  saveSampleGenres(
    input: SampleGenresSaveRequest,
  ): Promise<SampleGenresSnapshot>
  applySampleClassification(
    input: ClassificationApplyRequest,
  ): Promise<{ sampleId: string }>
  listAliasUpdates(input?: PageRequest): Promise<Page<AliasUpdate>>
  incorporateAlias(input: AliasUpdateRequest): Promise<{ key: string }>
  prepareSampleClassification(
    input: ClassificationPreparationRequest,
  ): Promise<ClassificationPreparationPage>
  createGenre(input: { name: string }): Promise<Genre>
  renameGenre(input: { id: string; name: string }): Promise<Genre>
  getGenre(id: string): Promise<Genre>
  listGenres(input?: ClassificationPageRequest): Promise<Page<Genre>>
  listTargetGenres(
    target: ClassificationTarget,
    input?: ClassificationPageRequest,
  ): Promise<Page<Genre>>
  setGenreAssignment(
    input: ClassificationAssignmentRequest,
  ): Promise<{ assigned: boolean }>
  reviewGenreRemoval(id: string): Promise<ClassificationRemovalReview>
  removeGenre(input: ClassificationRemovalRequest): Promise<{ id: string }>
  listRecognitionVocabulary(
    input?: ClassificationPageRequest,
  ): Promise<Page<VocabularyEntry>>
  listRecognitionAliases(
    input?: ClassificationPageRequest,
  ): Promise<Page<RecognitionAlias>>
  writeRecognitionAlias(input: AliasWriteRequest): Promise<RecognitionAlias>
  removeRecognitionAlias(id: string): Promise<{ id: string }>
}

export function recognitionCommands(
  request: ClientRequest,
): RecognitionCommands {
  return {
    async readSampleType(
      input: SampleTypeRequest,
    ): Promise<SampleTypeSnapshot> {
      return request({ action: 'read-sample-type', input })
    },

    async saveSampleType(
      input: SampleTypeSaveRequest,
    ): Promise<SampleTypeSnapshot> {
      return request({ action: 'save-sample-type', input })
    },

    async readSampleGenres(
      input: SampleGenresRequest,
    ): Promise<SampleGenresSnapshot> {
      return request({ action: 'read-sample-genres', input })
    },

    async saveSampleGenres(
      input: SampleGenresSaveRequest,
    ): Promise<SampleGenresSnapshot> {
      return request({ action: 'save-sample-genres', input })
    },

    async applySampleClassification(
      input: ClassificationApplyRequest,
    ): Promise<{ sampleId: string }> {
      return request({ action: 'apply-sample-classification', input })
    },

    async listAliasUpdates(
      input: PageRequest = {},
    ): Promise<Page<AliasUpdate>> {
      return request({ action: 'list-alias-updates', input })
    },

    async incorporateAlias(
      input: AliasUpdateRequest,
    ): Promise<{ key: string }> {
      return request({ action: 'incorporate-alias', input })
    },

    async prepareSampleClassification(
      input: ClassificationPreparationRequest,
    ): Promise<ClassificationPreparationPage> {
      return request({ action: 'prepare-sample-classification', input })
    },

    async createGenre(input: { name: string }): Promise<Genre> {
      return request({ action: 'create-genre', input })
    },

    async renameGenre(input: { id: string; name: string }): Promise<Genre> {
      return request({ action: 'rename-genre', input })
    },

    async getGenre(id: string): Promise<Genre> {
      return request({ action: 'get-genre', id })
    },

    async listGenres(
      input: ClassificationPageRequest = {},
    ): Promise<Page<Genre>> {
      return request({ action: 'list-genres', input })
    },

    async listTargetGenres(
      target: ClassificationTarget,
      input: ClassificationPageRequest = {},
    ): Promise<Page<Genre>> {
      return request({ action: 'list-target-genres', target, input })
    },

    async setGenreAssignment(
      input: ClassificationAssignmentRequest,
    ): Promise<{ assigned: boolean }> {
      return request({ action: 'set-genre-assignment', input })
    },

    async reviewGenreRemoval(id: string): Promise<ClassificationRemovalReview> {
      return request({ action: 'review-genre-removal', id })
    },

    async removeGenre(
      input: ClassificationRemovalRequest,
    ): Promise<{ id: string }> {
      return request({ action: 'remove-genre', input })
    },

    async listRecognitionVocabulary(
      input: ClassificationPageRequest = {},
    ): Promise<Page<VocabularyEntry>> {
      return request({ action: 'list-recognition-vocabulary', input })
    },

    async listRecognitionAliases(
      input: ClassificationPageRequest = {},
    ): Promise<Page<RecognitionAlias>> {
      return request({ action: 'list-recognition-aliases', input })
    },

    async writeRecognitionAlias(
      input: AliasWriteRequest,
    ): Promise<RecognitionAlias> {
      return request({ action: 'write-recognition-alias', input })
    },

    async removeRecognitionAlias(id: string): Promise<{ id: string }> {
      return request({ action: 'remove-recognition-alias', id })
    },
  }
}
