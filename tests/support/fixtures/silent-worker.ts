import { parentPort } from 'node:worker_threads'

const port = parentPort
if (!port) {
  throw new Error('The silent worker must run in a worker thread')
}

// Reports readiness, then accepts every command without ever answering, so a
// test can observe what the transport does when the database stops responding.
port.postMessage({ action: 'ready' })
port.on('message', () => {})
