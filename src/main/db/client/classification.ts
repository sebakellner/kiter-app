import type { ClientRequest } from './core.ts'
import type {
  SampleInstrumentsRequest,
  SampleInstrumentsSaveRequest,
  SampleInstrumentsSnapshot,
} from '../../../shared/ipc/sampleInstruments.ts'
import type {
  Author,
  Instrument,
  ClassificationAssignmentRequest,
  ClassificationPage,
  ClassificationPageRequest,
  ClassificationRemovalRequest,
  ClassificationRemovalReview,
  ClassificationTarget,
  ClassificationUse,
  ClassificationUsesRequest,
} from '../../../shared/domain/classification.ts'

export interface ClassificationCommands {
  readSampleInstruments(
    input: SampleInstrumentsRequest,
  ): Promise<SampleInstrumentsSnapshot>
  saveSampleInstruments(
    input: SampleInstrumentsSaveRequest,
  ): Promise<SampleInstrumentsSnapshot>
  createAuthor(input: { name: string }): Promise<Author>
  createInstrument(input: { name: string }): Promise<Instrument>
  renameAuthor(input: { id: string; name: string }): Promise<Author>
  renameInstrument(input: { id: string; name: string }): Promise<Instrument>
  getAuthor(id: string): Promise<Author>
  getInstrument(id: string): Promise<Instrument>
  listAuthors(
    input?: ClassificationPageRequest,
  ): Promise<ClassificationPage<Author>>
  listInstruments(
    input?: ClassificationPageRequest,
  ): Promise<ClassificationPage<Instrument>>
  setAuthorAssignment(
    input: ClassificationAssignmentRequest,
  ): Promise<{ assigned: boolean }>
  setInstrumentAssignment(
    input: ClassificationAssignmentRequest,
  ): Promise<{ assigned: boolean }>
  listTargetAuthors(
    target: ClassificationTarget,
    input?: ClassificationPageRequest,
  ): Promise<ClassificationPage<Author>>
  listTargetInstruments(
    target: ClassificationTarget,
    input?: ClassificationPageRequest,
  ): Promise<ClassificationPage<Instrument>>
  listAuthorUses(
    input: ClassificationUsesRequest,
  ): Promise<ClassificationPage<ClassificationUse>>
  listInstrumentUses(
    input: ClassificationUsesRequest,
  ): Promise<ClassificationPage<ClassificationUse>>
  reviewAuthorRemoval(id: string): Promise<ClassificationRemovalReview>
  reviewInstrumentRemoval(id: string): Promise<ClassificationRemovalReview>
  removeAuthor(input: ClassificationRemovalRequest): Promise<{ id: string }>
  removeInstrument(input: ClassificationRemovalRequest): Promise<{ id: string }>
}

export function classificationCommands(
  request: ClientRequest,
): ClassificationCommands {
  return {
    async readSampleInstruments(
      input: SampleInstrumentsRequest,
    ): Promise<SampleInstrumentsSnapshot> {
      return request({ action: 'read-sample-instruments', input })
    },

    async saveSampleInstruments(
      input: SampleInstrumentsSaveRequest,
    ): Promise<SampleInstrumentsSnapshot> {
      return request({ action: 'save-sample-instruments', input })
    },

    async createAuthor(input: { name: string }): Promise<Author> {
      return request({ action: 'create-author', input })
    },

    async createInstrument(input: { name: string }): Promise<Instrument> {
      return request({ action: 'create-instrument', input })
    },

    async renameAuthor(input: { id: string; name: string }): Promise<Author> {
      return request({ action: 'rename-author', input })
    },

    async renameInstrument(input: {
      id: string
      name: string
    }): Promise<Instrument> {
      return request({ action: 'rename-instrument', input })
    },

    async getAuthor(id: string): Promise<Author> {
      return request({ action: 'get-author', id })
    },

    async getInstrument(id: string): Promise<Instrument> {
      return request({ action: 'get-instrument', id })
    },

    async listAuthors(
      input: ClassificationPageRequest = {},
    ): Promise<ClassificationPage<Author>> {
      return request({ action: 'list-authors', input })
    },

    async listInstruments(
      input: ClassificationPageRequest = {},
    ): Promise<ClassificationPage<Instrument>> {
      return request({ action: 'list-instruments', input })
    },

    async setAuthorAssignment(
      input: ClassificationAssignmentRequest,
    ): Promise<{ assigned: boolean }> {
      return request({ action: 'set-author-assignment', input })
    },

    async setInstrumentAssignment(
      input: ClassificationAssignmentRequest,
    ): Promise<{ assigned: boolean }> {
      return request({ action: 'set-instrument-assignment', input })
    },

    async listTargetAuthors(
      target: ClassificationTarget,
      input: ClassificationPageRequest = {},
    ): Promise<ClassificationPage<Author>> {
      return request({ action: 'list-target-authors', target, input })
    },

    async listTargetInstruments(
      target: ClassificationTarget,
      input: ClassificationPageRequest = {},
    ): Promise<ClassificationPage<Instrument>> {
      return request({ action: 'list-target-instruments', target, input })
    },

    async listAuthorUses(
      input: ClassificationUsesRequest,
    ): Promise<ClassificationPage<ClassificationUse>> {
      return request({ action: 'list-author-uses', input })
    },

    async listInstrumentUses(
      input: ClassificationUsesRequest,
    ): Promise<ClassificationPage<ClassificationUse>> {
      return request({ action: 'list-instrument-uses', input })
    },

    async reviewAuthorRemoval(
      id: string,
    ): Promise<ClassificationRemovalReview> {
      return request({ action: 'review-author-removal', id })
    },

    async reviewInstrumentRemoval(
      id: string,
    ): Promise<ClassificationRemovalReview> {
      return request({ action: 'review-instrument-removal', id })
    },

    async removeAuthor(
      input: ClassificationRemovalRequest,
    ): Promise<{ id: string }> {
      return request({ action: 'remove-author', input })
    },

    async removeInstrument(
      input: ClassificationRemovalRequest,
    ): Promise<{ id: string }> {
      return request({ action: 'remove-instrument', input })
    },
  }
}
