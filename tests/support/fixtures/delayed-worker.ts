import { parentPort } from 'node:worker_threads'

const port = parentPort
if (!port) {
  throw new Error('The delayed worker must run in a worker thread')
}

const profileId = '11111111-1111-4111-8111-111111111111'
const preferences = { profileId, previewVolume: 0 }
const delays: Record<string, number> = { profile: 200, volume: 100 }

function replyFor(request: { requestId: number; action: string }): unknown {
  const result =
    request.action === 'profile'
      ? {
          profile: {
            id: profileId,
            name: 'Local profile',
            avatarAssetId: null,
            authorId: null,
          },
          preferences,
        }
      : preferences
  return { requestId: request.requestId, action: request.action, result }
}

// Commands are answered strictly in order, one after another, so a test can see
// what the transport does with a command that waits behind a slow one.
let queue: Promise<void> = Promise.resolve()

port.on('message', (message: unknown) => {
  const request = message as { requestId: number; action: string }
  if (request.action === 'close') {
    port.postMessage({ requestId: request.requestId, action: 'close' })
    port.close()
    return
  }
  const reply = replyFor(request)
  const delay = delays[request.action] ?? 0
  queue = queue.then(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          port.postMessage(reply)
          resolve()
        }, delay)
      }),
  )
})

port.postMessage({ action: 'ready' })
