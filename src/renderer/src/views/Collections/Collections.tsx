import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { useCollections } from '@renderer/features/collections/useCollections'
import { CreateCollection } from '@renderer/features/collections/CreateCollection/CreateCollection'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import '@renderer/features/collections/collections.css'

export function Collections(): React.JSX.Element {
  const { key } = useLocation()
  // Each history entry starts from its restored context, not another entry's request.
  return <CollectionList key={key} />
}

function CollectionList(): React.JSX.Element {
  const { context, update, onReady } = useCatalogViewContext()
  const { page, loading, error, load, refresh } = useCollections(context.offset)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) {
      return
    }
    if (page && !error) {
      update({
        offset: page.offset,
        selectedId: page.items.some(({ id }) => id === context.selectedId)
          ? context.selectedId
          : null,
      })
    }
    onReady()
  }, [loading, page, error, context.selectedId, update, onReady])

  return (
    <section aria-labelledby="collections-title" aria-busy={loading}>
      <h1 id="collections-title" tabIndex={-1}>
        Collections
      </h1>
      <Button onClick={() => setCreating(true)}>Create Collection</Button>
      <Button disabled={loading} onClick={refresh}>
        Refresh Collections
      </Button>
      {loading && <p role="status">Loading Collections…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {page && (
        <>
          {!page.total && (
            <p>
              No Collections yet. Create one to start organizing Samples without
              copying audio.
            </p>
          )}
          {page.items.length > 0 && (
            <div
              role="grid"
              aria-label="Collections"
              className="collections-grid"
            >
              {page.items.map((collection, index) => (
                <Card
                  role="row"
                  key={collection.id}
                  aria-selected={context.selectedId === collection.id}
                  aria-label={`${collection.name}, Collection ${collection.id}`}
                  tabIndex={
                    context.selectedId === collection.id ||
                    (!context.selectedId && index === 0)
                      ? 0
                      : -1
                  }
                  onClick={(event) => {
                    if (
                      !(event.target instanceof Element) ||
                      !event.target.closest('a, button')
                    ) {
                      update({ selectedId: collection.id })
                      event.currentTarget.focus()
                    }
                  }}
                  onDoubleClick={(event) => {
                    if (
                      !(event.target instanceof Element) ||
                      !event.target.closest('a, button')
                    ) {
                      void navigate(`/collections/${collection.id}`)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) {
                      return
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void navigate(`/collections/${collection.id}`)
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const next = Math.max(
                        0,
                        Math.min(
                          page.items.length - 1,
                          index + (event.key === 'ArrowDown' ? 1 : -1),
                        ),
                      )
                      update({ selectedId: page.items[next].id })
                      event.currentTarget.parentElement
                        ?.querySelectorAll<HTMLElement>('[role="row"]')
                        [next]?.focus()
                    }
                  }}
                >
                  <div role="gridcell">
                    <div
                      className="collection-cover-placeholder"
                      aria-hidden="true"
                    >
                      No cover
                    </div>
                    <h2>{collection.name}</h2>
                    <p>
                      {collection.sampleCount}{' '}
                      {collection.sampleCount === 1 ? 'Sample' : 'Samples'}
                    </p>
                    <small>Collection ID: {collection.id}</small>
                    <Button
                      as={Link}
                      to={`/collections/${collection.id}`}
                      aria-label={`Open ${collection.name}`}
                    >
                      Open
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <p role="status">
            {page.total} {page.total === 1 ? 'Collection' : 'Collections'}
          </p>
          <nav aria-label="Collection pages">
            <Button
              disabled={loading || page.offset === 0}
              onClick={() => load(Math.max(0, page.offset - page.limit))}
            >
              Previous page
            </Button>
            <Button
              disabled={loading || page.offset + page.limit >= page.total}
              onClick={() => load(page.offset + page.limit)}
            >
              Next page
            </Button>
          </nav>
        </>
      )}
      {creating && (
        <CreateCollection
          onClose={() => setCreating(false)}
          onCreated={(collection) => {
            setCreating(false)
            void navigate(`/collections/${collection.id}`)
          }}
        />
      )}
    </section>
  )
}
