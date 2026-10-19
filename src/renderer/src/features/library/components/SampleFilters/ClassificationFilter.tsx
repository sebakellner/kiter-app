import { useEffect, useState } from 'react'
import type { Category } from '@shared/domain/classification'
import type { Page } from '@shared/domain/pagination'
import { unwrapIpcResult } from '@shared/ipc/result'
import { Combobox } from '@renderer/components/ui/Combobox'
import { Button } from '@renderer/components/ui/Button'

export function ClassificationFilter({
  kind,
  input,
  value,
  onChange,
}: {
  kind: 'categories' | 'genres'
  input: React.RefObject<HTMLInputElement | null>
  value: Category[]
  onChange: (value: Category[]) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{
    key: string
    page: Page<Category>
  } | null>(null)
  const [failure, setFailure] = useState<{
    key: string
    message: string
  } | null>(null)
  const label = kind === 'categories' ? 'Categories' : 'Genres'
  const key = JSON.stringify([query, offset, version])
  const loading = result?.key !== key && failure?.key !== key
  const error = failure?.key === key ? failure.message : null

  useEffect(() => {
    let active = true
    void window.api[kind]
      .list({ search: query, offset, limit: 50 })
      .then(unwrapIpcResult)
      .then((page) => {
        if (active) {
          setResult({ key, page })
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setFailure({
            key,
            message:
              reason instanceof Error
                ? reason.message
                : `Unable to load ${kind}.`,
          })
        }
      })
    return () => {
      active = false
    }
  }, [query, offset, version, key, kind])

  function change(ids: string[]): void {
    const available = new Map(
      [...value, ...(result?.page.items ?? [])].map((category) => [
        category.id,
        category,
      ]),
    )
    onChange(
      ids.flatMap((id) => {
        const category = available.get(id)
        return category ? [category] : []
      }),
    )
  }

  return (
    <div>
      <Combobox
        ref={input}
        onFocus={() => setVersion((current) => current + 1)}
        aria-label={label}
        placeholder={label}
        listLabel={`Available filter ${kind}`}
        multiple
        options={
          error
            ? []
            : (result?.page.items ?? []).map((category) => ({
                value: category.id,
                label: category.name,
                disabled:
                  value.length >= 100 &&
                  !value.some(({ id }) => id === category.id),
              }))
        }
        value={value.map(({ id }) => id)}
        onValueChange={change}
        query={query}
        onQueryChange={(text) => {
          setQuery(text)
          setOffset(0)
        }}
        loading={loading}
        emptyMessage={
          error
            ? `${label} could not be loaded.`
            : query
              ? `No matching ${kind}.`
              : `No ${kind} in your library yet.`
        }
      />
      {error && (
        <p role="alert">
          {error}{' '}
          <Button onClick={() => setVersion((current) => current + 1)}>
            Retry {kind}
          </Button>
        </p>
      )}
      {result && (result.page.total > 50 || offset > 0) && (
        <nav aria-label={`Filter ${kind} pages`}>
          <Button
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous {kind}
          </Button>
          <Button
            disabled={loading || offset + 50 >= result.page.total}
            onClick={() => setOffset(offset + 50)}
          >
            Next {kind}
          </Button>
        </nav>
      )}
    </div>
  )
}
