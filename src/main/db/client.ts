import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { LibrarySample, FavoriteState } from '../../shared/ipc'
import type { DiscoveredAudioFile } from '../../shared/domain/source'
import type { LocalProfile, UserPreferences } from '../../shared/domain/profile'
import { requirePreviewVolume } from '../../shared/domain/profile'
import { requireEntityId } from '../../shared/domain/validation'
import type { DbReply, DbRequest } from './protocol'
import { isDbReply } from './protocol'
import { DbError } from './errors'
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
import type { ClassificationRequest } from './classificationProtocol'
import { isClassificationRequest } from './classificationProtocol'
import { DomainValidationError } from '../../shared/domain/validation'

const DB_CLOSING_MESSAGE = 'Database is shutting down'
const UNEXPECTED_REPLY_MESSAGE = 'Unexpected database response'

type PendingRequest = {
  action: DbRequest['action']
  resolve: (reply: DbReply) => void
  reject: (error: Error) => void
}

export class DbClient {
  private readonly worker: Worker
  private readonly workerExited: Promise<void>
  private nextRequestId = 1
  private failure: Error | null = null
  private closing = false
  private closePromise: Promise<void> | null = null
  private readonly pendingRequests = new Map<number, PendingRequest>()
  private readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void

  private constructor(filename: string) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.worker = new Worker(join(__dirname, 'dbWorker.js'), {
      workerData: { filename, migrationsFolder: join(__dirname, 'migrations') },
    })
    this.workerExited = new Promise((resolve) =>
      this.worker.once('exit', () => resolve()),
    )
    this.worker.on('message', (reply: unknown) => this.handleReply(reply))
    this.worker.on('error', () => this.handleWorkerError())
    this.worker.on('exit', (exitCode) => this.handleWorkerExit(exitCode))
  }

  static async open(filename: string): Promise<DbClient> {
    const database = new DbClient(filename)
    try {
      await database.ready
      return database
    } catch (error) {
      await database.worker.terminate()
      throw error
    }
  }

  private handleReply(value: unknown): void {
    if (!isDbReply(value)) {
      this.fail('Invalid database response.', 'PROTOCOL_ERROR')
      return
    }
    const reply = value
    if (reply.action === 'ready') {
      this.resolveReady()
      return
    }
    if (reply.action === 'fatal') {
      this.fail(reply.failure.message, reply.failure.code)
      return
    }
    const pendingRequest = this.pendingRequests.get(reply.requestId)
    if (!pendingRequest) {
      this.fail(UNEXPECTED_REPLY_MESSAGE, 'PROTOCOL_ERROR')
      return
    }
    this.pendingRequests.delete(reply.requestId)
    if (reply.action === 'error') {
      pendingRequest.reject(
        new DbError(reply.failure.code, reply.failure.message),
      )
      return
    }
    if (reply.action !== pendingRequest.action) {
      pendingRequest.reject(
        new DbError('PROTOCOL_ERROR', UNEXPECTED_REPLY_MESSAGE),
      )
      this.fail(UNEXPECTED_REPLY_MESSAGE, 'PROTOCOL_ERROR')
      return
    }
    pendingRequest.resolve(reply)
  }

  private handleWorkerError(): void {
    this.fail(
      'Unable to open the local catalog. Existing data has not been reset.',
    )
  }

  private handleWorkerExit(exitCode: number): void {
    const isExpectedExit =
      this.closing && exitCode === 0 && this.pendingRequests.size === 0
    if (!isExpectedExit) {
      this.fail(
        'The local catalog stopped unexpectedly. Restart Kiter to retry.',
      )
    }
  }

  private fail(message: string, code: DbError['code'] = 'WORKER_FAILED'): void {
    if (this.failure) {
      return
    }
    console.error('Database worker failed:', code)
    this.failure = new DbError(code, message)
    this.rejectReady(this.failure)
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(this.failure)
    }
    this.pendingRequests.clear()
  }

  private sendRequest(request: DbRequest): Promise<DbReply> {
    if (this.failure) {
      return Promise.reject(this.failure)
    }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.requestId, {
        action: request.action,
        resolve,
        reject,
      })
      try {
        this.worker.postMessage(request)
      } catch (error) {
        this.pendingRequests.delete(request.requestId)
        reject(error)
      }
    })
  }

  async importFolder(
    root: string,
    files: DiscoveredAudioFile[],
  ): Promise<LibrarySample[]> {
    if (this.closing) {
      throw new DbError('CLOSING', DB_CLOSING_MESSAGE)
    }
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
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
    if (this.closing) {
      throw new DbError('CLOSING', DB_CLOSING_MESSAGE)
    }
    requireEntityId(id)
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
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
    if (this.closing) {
      throw new DbError('CLOSING', DB_CLOSING_MESSAGE)
    }
    if (!isClassificationRequest(request)) {
      throw new DomainValidationError('Invalid classification request.')
    }
    return this.sendRequest({ ...request, requestId: this.nextRequestId++ })
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

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }
    this.closing = true
    this.closePromise = this.closeWorker()
    return this.closePromise
  }

  async getLocalProfile(): Promise<LocalProfile> {
    if (this.closing) {
      throw new DbError('CLOSING', DB_CLOSING_MESSAGE)
    }
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
      action: 'profile',
    })
    if (reply.action !== 'profile') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  async setPreviewVolume(volume: number): Promise<UserPreferences> {
    if (this.closing) {
      throw new DbError('CLOSING', DB_CLOSING_MESSAGE)
    }
    requirePreviewVolume(volume)
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
      action: 'volume',
      volume,
    })
    if (reply.action !== 'volume') {
      throw new Error(UNEXPECTED_REPLY_MESSAGE)
    }
    return reply.result
  }

  private async closeWorker(): Promise<void> {
    try {
      const reply = await this.sendRequest({
        requestId: this.nextRequestId++,
        action: 'close',
      })
      if (reply.action !== 'close') {
        throw new Error('Unexpected catalog shutdown response')
      }
      await this.workerExited
    } catch (error) {
      await this.worker.terminate()
      throw error
    }
  }
}
