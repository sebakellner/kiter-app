import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { AudioFile, CatalogSample, FavoriteState } from '../../../shared/ipc'
import type { CatalogReply, CatalogRequest } from './catalogMessages'

const CATALOG_CLOSING_MESSAGE = 'Catalog is shutting down'
const UNEXPECTED_REPLY_MESSAGE = 'Unexpected catalog response'

type PendingRequest = {
  resolve: (reply: CatalogReply) => void
  reject: (error: Error) => void
}

export class Catalog {
  private readonly worker: Worker
  private readonly workerExited: Promise<void>
  private nextRequestId = 1
  private failure: Error | null = null
  private closing = false
  private readonly pendingRequests = new Map<number, PendingRequest>()

  constructor(filename: string) {
    this.worker = new Worker(join(__dirname, 'catalogWorker.js'), { workerData: filename })
    this.workerExited = new Promise((resolve) => this.worker.once('exit', () => resolve()))
    this.worker.on('message', (reply: CatalogReply) => this.handleReply(reply))
    this.worker.on('error', () => this.handleWorkerError())
    this.worker.on('exit', (exitCode) => this.handleWorkerExit(exitCode))
  }

  private handleReply(reply: CatalogReply): void {
    const pendingRequest = this.pendingRequests.get(reply.requestId)
    if (!pendingRequest) return
    this.pendingRequests.delete(reply.requestId)
    if (reply.action === 'error') {
      pendingRequest.reject(new Error(reply.message))
      return
    }
    pendingRequest.resolve(reply)
  }

  private handleWorkerError(): void {
    this.fail('Unable to open the local catalog. Existing data has not been reset.')
  }

  private handleWorkerExit(exitCode: number): void {
    const isExpectedExit = this.closing && exitCode === 0 && this.pendingRequests.size === 0
    if (!isExpectedExit) {
      this.fail('The local catalog stopped unexpectedly. Restart Kiter to retry.')
    }
  }

  private fail(message: string): void {
    if (this.failure) return
    console.error(message)
    this.failure = new Error(message)
    for (const pendingRequest of this.pendingRequests.values()) pendingRequest.reject(this.failure)
    this.pendingRequests.clear()
  }

  private sendRequest(request: CatalogRequest): Promise<CatalogReply> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.requestId, { resolve, reject })
      try {
        this.worker.postMessage(request)
      } catch (error) {
        this.pendingRequests.delete(request.requestId)
        reject(error)
      }
    })
  }

  async importFolder(root: string, files: AudioFile[]): Promise<CatalogSample[]> {
    if (this.closing) throw new Error(CATALOG_CLOSING_MESSAGE)
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
      action: 'import',
      root,
      files
    })
    if (reply.action !== 'import') throw new Error(UNEXPECTED_REPLY_MESSAGE)
    return reply.result
  }

  async setFavorite(id: string, favorite: boolean): Promise<FavoriteState> {
    if (this.closing) throw new Error(CATALOG_CLOSING_MESSAGE)
    const reply = await this.sendRequest({
      requestId: this.nextRequestId++,
      action: 'favorite',
      id,
      favorite
    })
    if (reply.action !== 'favorite') throw new Error(UNEXPECTED_REPLY_MESSAGE)
    return reply.result
  }

  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    try {
      const reply = await this.sendRequest({ requestId: this.nextRequestId++, action: 'close' })
      if (reply.action !== 'close') throw new Error('Unexpected catalog shutdown response')
      await this.workerExited
    } catch (error) {
      await this.worker.terminate()
      throw error
    }
  }
}
