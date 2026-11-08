import { Worker } from 'node:worker_threads'
import type { DbCommand, DbReply, DbRequest } from '../protocol/messages.ts'
import { isDbReply } from '../protocol/messages.ts'
import { DbError } from '../errors.ts'

export type { DbCommand }

interface WorkerLocation {
  workerPath: string | URL
  migrationsFolder: string
  backupDirectory?: string
  imagesDirectory?: string
  restoreFrom?: string
  requestTimeoutMs?: number
}

// A last-resort liveness guard, never a responsiveness budget: a large import or
// a migration backup can legitimately run for minutes, and a false timeout is
// worse than a slow answer.
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60_000

const UNRESPONSIVE_MESSAGE =
  'The local catalog stopped responding. Restart Kiter to retry.'

type PendingRequest = {
  action: DbRequest['action']
  resolve: (reply: DbReply) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class WorkerTransport {
  private readonly worker: Worker
  private readonly workerExited: Promise<void>
  private nextRequestId = 1
  private failure: Error | null = null
  private closing = false
  private closePromise: Promise<void> | null = null
  private readonly pendingRequests = new Map<number, PendingRequest>()
  private readonly requestTimeoutMs: number
  private readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void

  private constructor(filename: string, location: WorkerLocation) {
    this.requestTimeoutMs =
      location.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.worker = new Worker(location.workerPath, {
      workerData: {
        filename,
        migrationsFolder: location.migrationsFolder,
        backupDirectory: location.backupDirectory,
        imagesDirectory: location.imagesDirectory,
        restoreFrom: location.restoreFrom,
      },
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
    const pendingRequest = this.settle(reply.requestId)
    if (!pendingRequest) {
      this.fail('Unexpected database response', 'PROTOCOL_ERROR')
      return
    }
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

  private settle(requestId: number): PendingRequest | undefined {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (!pendingRequest) {
      return undefined
    }
    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(requestId)
    return pendingRequest
  }

  // One unanswered command means the worker is wedged, so nothing queued behind
  // it will be answered either.
  private handleTimeout(requestId: number): void {
    if (!this.pendingRequests.has(requestId)) {
      return
    }
    this.fail(UNRESPONSIVE_MESSAGE)
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
      clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(this.failure)
    }
    this.pendingRequests.clear()
  }

  private sendRequest(request: DbRequest): Promise<DbReply> {
    if (this.failure) {
      return Promise.reject(this.failure)
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => this.handleTimeout(request.requestId),
        this.requestTimeoutMs,
      )
      // A pending request must not keep the process alive on its own.
      timeout.unref()
      this.pendingRequests.set(request.requestId, {
        action: request.action,
        resolve,
        reject,
        timeout,
      })
      try {
        this.worker.postMessage(request)
      } catch (error) {
        this.settle(request.requestId)
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
