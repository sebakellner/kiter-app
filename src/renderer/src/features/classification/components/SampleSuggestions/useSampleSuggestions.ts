import { useEffect, useRef, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type {
  ClassificationPreparationItem,
  ClassificationPreparationPage,
} from '@shared/ipc/classification'

export type SuggestionGroup = {
  item: ClassificationPreparationItem
  evidence: ClassificationPreparationItem[]
}

function groupItems(items: ClassificationPreparationItem[]): SuggestionGroup[] {
  const groups = new Map<string, SuggestionGroup>()
  for (const item of items) {
    const key = JSON.stringify([
      item.kind === 'assigned' || item.alreadyAssigned ? 'assigned' : item.kind,
      item.dimension,
      item.key,
    ])
    const existing = groups.get(key)
    if (existing) {
      existing.evidence.push(item)
    } else {
      groups.set(key, { item, evidence: [item] })
    }
  }
  return [...groups.values()]
}

async function read(sampleId: string): Promise<ClassificationPreparationPage> {
  const first = unwrapIpcResult(
    await window.api.classification.prepareSample({ sampleId, limit: 100 }),
  )
  if (first.total > 2000) {
    throw new Error('This Sample exceeds the suggestion evidence limit.')
  }
  const items = [...first.items]
  for (let offset = items.length; offset < first.total;) {
    const page = unwrapIpcResult(
      await window.api.classification.prepareSample({
        sampleId,
        limit: 100,
        offset,
        token: first.token,
      }),
    )
    if (
      page.token !== first.token ||
      page.total !== first.total ||
      page.items.length === 0
    ) {
      throw new Error('Suggestions changed. Refresh to try again.')
    }
    items.push(...page.items)
    offset += page.items.length
  }
  return { ...first, items }
}

export function useSampleSuggestions(
  sampleId: string,
  onChanged?: () => void,
): {
  groups: SuggestionGroup[]
  loading: boolean
  pending: boolean
  error: string | null
  notice: string | null
  refresh: () => void
  apply: (keys: string[]) => Promise<void>
} {
  const [version, setVersion] = useState(0)
  const [completion, setCompletion] = useState<{
    version: number
    page: ClassificationPreparationPage
  } | null>(null)
  const [failure, setFailure] = useState<{
    version: number
    message: string
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const active = useRef(true)
  const loading =
    completion?.version !== version && failure?.version !== version
  const error = failure?.version === version ? failure.message : null
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    let current = true
    void read(sampleId)
      .then((page) => {
        if (current) {
          setCompletion({ version, page })
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setFailure({
            version,
            message:
              reason instanceof Error
                ? reason.message
                : 'Unable to load suggestions.',
          })
        }
      })
    return () => {
      current = false
    }
  }, [sampleId, version])

  async function apply(keys: string[]): Promise<void> {
    if (pending || loading || error || !completion) {
      return
    }
    setPending(true)
    setNotice(null)
    try {
      unwrapIpcResult(
        await window.api.classification.applySample({
          sampleId,
          token: completion.page.token,
          keys,
        }),
      )
      onChanged?.()
      if (active.current) {
        setNotice('Classifications saved.')
        setVersion((value) => value + 1)
      }
    } catch (reason) {
      if (active.current) {
        setFailure({
          version,
          message:
            reason instanceof Error
              ? reason.message
              : 'Unable to apply suggestions. Refresh to check the saved classifications.',
        })
      }
    } finally {
      if (active.current) {
        setPending(false)
      }
    }
  }
  return {
    groups: groupItems(completion?.page.items ?? []),
    loading,
    pending,
    error,
    notice,
    refresh: () => setVersion((value) => value + 1),
    apply,
  }
}
