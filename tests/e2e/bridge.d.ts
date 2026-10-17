import type { Api } from '../../src/shared/ipc'

declare global {
  interface Window {
    api: Api
  }
}
