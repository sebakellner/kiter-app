import assert from 'node:assert/strict'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import type { WorkerOptions } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { isDbReply } from '../../../src/main/db/protocol/messages.ts'
import type {
  DbReply,
  DbRequest,
} from '../../../src/main/db/protocol/messages.ts'

export function startWorker(
  filename: string,
  migrationsFolder = fileURLToPath(
    new URL('../../../drizzle', import.meta.url),
  ),
  options: Pick<WorkerOptions, 'stderr'> = {},
): Worker {
  return new Worker(
    new URL('../../../src/main/db/worker/entry.ts', import.meta.url),
    {
      workerData: { filename, migrationsFolder },
      ...options,
    },
  )
}

// Sequential protocol scenarios use this helper. Concurrent correlation is
// exercised through WorkerTransport, which owns request routing.
export async function exchange(
  worker: Worker,
  request: DbRequest,
): Promise<DbReply> {
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 10000)
  const response = once(worker, 'message', { signal: controller.signal })
  try {
    worker.postMessage(request)
    const [reply] = await response
    assert.ok(isDbReply(reply))
    if ('requestId' in reply) {
      assert.equal(reply.requestId, request.requestId)
    }
    return reply
  } finally {
    clearTimeout(deadline)
    controller.abort()
  }
}
