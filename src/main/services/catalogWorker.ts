import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { CatalogStore } from './catalogStore'
import type { CatalogReply, CatalogRequest } from './catalogMessages'

const port = parentPort
if (!port) throw new Error('Catalog must run in a worker')
const data: unknown = workerData
if (typeof data !== 'string') throw new Error('Invalid catalog location')
mkdirSync(dirname(data), { recursive: true })
const store = new CatalogStore(data)

port.on('message', (request: CatalogRequest) => {
  let reply: CatalogReply
  try {
    switch (request.action) {
      case 'import':
        reply = {
          requestId: request.requestId,
          action: 'import',
          result: store.importFolder(request.root, request.files)
        }
        break
      case 'favorite':
        reply = {
          requestId: request.requestId,
          action: 'favorite',
          result: store.setFavorite(request.id, request.favorite)
        }
        break
      case 'close':
        store.close()
        port.postMessage({ requestId: request.requestId, action: 'close' } satisfies CatalogReply)
        port.close()
        return
    }
  } catch {
    console.error('Catalog operation failed:', request.action)
    reply = {
      requestId: request.requestId,
      action: 'error',
      message: 'Unable to update the local catalog. Check storage access and available disk space.'
    }
  }
  port.postMessage(reply)
})
