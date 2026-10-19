import { useEffect, useRef, useState } from 'react'
import type { Category } from '@shared/domain/classification'
import type { CategoryPage } from '@shared/ipc/categories'
import { unwrapIpcResult } from '@shared/ipc/result'
import { Combobox } from '@renderer/components/ui/Combobox'
import { Button } from '@renderer/components/ui/Button'
import './category-filter.css'

export function CategoryFilter({
  value,
  onChange,
}: {
  value: Category[]
  onChange: (value: Category[]) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{
    key: string
    page: CategoryPage
  } | null>(null)
  const [failure, setFailure] = useState<{
    key: string
    message: string
  } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const key = JSON.stringify([query, offset, version])
  const loading = result?.key !== key && failure?.key !== key
  const error = failure?.key === key ? failure.message : null

  useEffect(() => {
    let active = true
    void window.api.categories
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
                : 'Unable to load categories.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [query, offset, version, key])

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

  function remove(id?: string): void {
    onChange(id ? value.filter((category) => category.id !== id) : [])
    input.current?.focus()
  }

  return (
    <section className="category-filter" aria-label="Sample filters">
      <label>
        Categories
        <Combobox
          ref={input}
          onFocus={() => setVersion((current) => current + 1)}
          aria-label="Categories"
          listLabel="Available filter categories"
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
              ? 'Categories could not be loaded.'
              : query
                ? 'No matching categories.'
                : 'No categories in your library yet.'
          }
        />
      </label>
      {error && (
        <p role="alert">
          {error}{' '}
          <Button onClick={() => setVersion((current) => current + 1)}>
            Retry categories
          </Button>
        </p>
      )}
      {result && (result.page.total > 50 || offset > 0) && (
        <nav aria-label="Filter category pages">
          <Button
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous categories
          </Button>
          <Button
            disabled={loading || offset + 50 >= result.page.total}
            onClick={() => setOffset(offset + 50)}
          >
            Next categories
          </Button>
        </nav>
      )}
      {value.length > 0 && (
        <div
          className="category-filter-chips"
          aria-label="Active category filters"
        >
          {value.map((category) => (
            <Button
              key={category.id}
              aria-label={`Remove category filter: ${category.name}`}
              onClick={() => remove(category.id)}
            >
              {category.name} ×
            </Button>
          ))}
          <Button onClick={() => remove()}>Clear all</Button>
        </div>
      )}
    </section>
  )
}
