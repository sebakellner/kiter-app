import { useEffect, useState } from 'react'
import type { PackDetail } from '@shared/ipc/packs'
import { IpcError, unwrapIpcResult } from '@shared/ipc/result'

// A Pack that no longer exists is a settled answer, not a failed read, so the
// detail separates absence from a read that can be retried.
function isMissing(reason: unknown): boolean {
  return (
    reason instanceof IpcError &&
    (reason.code === 'NOT_FOUND' || reason.code === 'INVALID_INPUT')
  )
}

export function usePackDetail(id: string): {
  detail: PackDetail | null
  loading: boolean
  error: string | null
  unavailable: boolean
  refresh: () => void
} {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{
    id: string
    version: number
    detail: PackDetail | null
    error: string | null
    unavailable: boolean
  } | null>(null)
  useEffect(() => {
    let active = true
    async function run(): Promise<void> {
      try {
        const detail = unwrapIpcResult(await window.api.packs.detail({ id }))
        if (active) {
          setState({ id, version, detail, error: null, unavailable: false })
        }
      } catch (reason) {
        if (active) {
          const missing = isMissing(reason)
          setState((current) => ({
            id,
            version,
            // A failed refresh keeps the last valid header of the same Pack.
            detail: missing ? null : current?.id === id ? current.detail : null,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to load the Pack.',
            unavailable: missing,
          }))
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [id, version])
  const current = state?.id === id ? state : null
  return {
    detail: current?.detail ?? null,
    loading: !current || current.version !== version,
    error: current?.version === version ? current.error : null,
    unavailable: current?.unavailable ?? false,
    refresh: () => setVersion((current) => current + 1),
  }
}
