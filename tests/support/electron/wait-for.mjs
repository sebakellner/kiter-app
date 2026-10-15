import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

export async function waitFor(check, label, timeout = 10000) {
  const deadline = performance.now() + timeout
  while (performance.now() < deadline) {
    if (await check()) {
      return
    }
    await delay(25)
  }
  throw new Error(`Timed out: ${label}`)
}
