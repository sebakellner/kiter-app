import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { AudioFile, CatalogSample, FavoriteState } from '../../../shared/ipc'
import type { CatalogReply, CatalogRequest } from './catalogMessages'

export class Catalog {
  private readonly worker: Worker
  private readonly stopped: Promise<void>
  private sequence = 0
  private failure: Error | null = null
  private closing = false
  private readonly pending = new Map<
    number,
    {
      resolve: (reply: CatalogReply) => void
      reject: (error: Error) => void
    }
  >()

  constructor(filename: string) {
    this.worker = new Worker(join(__dirname, 'catalogWorker.js'), { workerData: filename })
    this.stopped = new Promise((resolve) => this.worker.once('exit', () => resolve()))
    this.worker.on('message', (reply: CatalogReply) => {
      const pending = this.pending.get(reply.requestId)
      if (!pending) return
      this.pending.delete(reply.requestId)
      if (reply.action === 'error') pending.reject(new Error(reply.message))
      else pending.resolve(reply)
    })
    this.worker.on('error', () => {
      this.fail('Unable to open the local catalog. Existing data has not been reset.')
    })
    this.worker.on('exit', (code) => {
      if (!this.closing || code !== 0 || this.pending.size > 0) {
        this.fail('The local catalog stopped unexpectedly. Restart Kiter to retry.')
      }
    })
  }

  private fail(message: string): void {
    if (this.failure) return
    console.error(message)
    this.failure = new Error(message)
    for (const pending of this.pending.values()) pending.reject(this.failure)
    this.pending.clear()
  }

  private send(request: CatalogRequest): Promise<CatalogReply> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, { resolve, reject })
      try {
        this.worker.postMessage(request)
      } catch (error) {
        this.pending.delete(request.requestId)
        reject(error)
      }
    })
  }

  async importFolder(root: string, files: AudioFile[]): Promise<CatalogSample[]> {
    if (this.closing) throw new Error('Catalog is shutting down')
    const reply = await this.send({ requestId: ++this.sequence, action: 'import', root, files })
    if (reply.action !== 'import') throw new Error('Unexpected catalog response')
    return reply.result
  }

  async setFavorite(id: string, favorite: boolean): Promise<FavoriteState> {
    if (this.closing) throw new Error('Catalog is shutting down')
    const reply = await this.send({ requestId: ++this.sequence, action: 'favorite', id, favorite })
    if (reply.action !== 'favorite') throw new Error('Unexpected catalog response')
    return reply.result
  }

  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    try {
      const reply = await this.send({ requestId: ++this.sequence, action: 'close' })
      if (reply.action !== 'close') throw new Error('Unexpected catalog shutdown response')
      await this.stopped
    } catch (error) {
      await this.worker.terminate()
      throw error
    }
  }
}
