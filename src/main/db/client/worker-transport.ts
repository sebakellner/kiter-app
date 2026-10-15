import { Worker } from 'node:worker_threads'
import type { DbReply, DbRequest } from '../protocol/messages.ts'
import { isDbReply } from '../protocol/messages.ts'
import { DbError } from '../errors.ts'

type WithoutRequestId<T> = T extends { requestId: number }
  ? Omit<T, 'requestId'>
  : never
export type DbCommand = WithoutRequestId<DbRequest>

interface WorkerLocation {
  workerPath: string | URL
  migrationsFolder: string
}

type PendingRequest = {
  action: DbRequest['action']
  resolve: (reply: DbReply) => void
  reject: (error: Error) => void
}

export class WorkerTransport {
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

  private constructor(filename: string, location: WorkerLocation) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.worker = new Worker(location.workerPath, {
      workerData: { filename, migrationsFolder: location.migrationsFolder },
    })
    this.workerExited = new Promise((resolve) =>
      this.worker.once('exit', () => resolve()),
    )
    this.worker.on('message', (reply: unknown) => this.handleReply(reply))
    this.worker.on('error', () => this.handleWorkerError())
    this.worker.on('exit', (exitCode) => this.handleWorkerExit(exitCode))
  }

  static async open(
    filename: string,
    location: WorkerLocation,
  ): Promise<WorkerTransport> {
    const transport = new WorkerTransport(filename, location)
    try {
      await transport.ready
      return transport
    } catch (error) {
      await transport.worker.terminate()
      throw error
    }
  }

  assertOpen(): void {
    if (this.closing) {
      throw new DbError('CLOSING', 'Database is shutting down')
    }
  }

  request(command: DbCommand): Promise<DbReply> {
    this.assertOpen()
    return this.sendRequest({ ...command, requestId: this.nextRequestId++ })
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
      this.fail('Unexpected database response', 'PROTOCOL_ERROR')
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
        new DbError('PROTOCOL_ERROR', 'Unexpected database response'),
      )
      this.fail('Unexpected database response', 'PROTOCOL_ERROR')
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

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }
    this.closing = true
    this.closePromise = this.closeWorker()
    return this.closePromise
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
