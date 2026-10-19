import { Button } from '@renderer/components/ui/Button'
import { useLibrarySession } from '../hooks/useLibrarySession'
import { useCatalog } from '../hooks/useCatalog'
import { SampleList } from './SampleList'
import { useSampleInspector } from './SampleInspector'
import { useCallback, useLayoutEffect, useState } from 'react'
import type { CatalogViewContext } from '@renderer/routes/navigationContext'
import { SampleFilters } from './SampleFilters/SampleFilters'
import { effectiveCatalogSearch } from '@shared/features/library/search'
import type { ListSample } from './SampleList/useSampleList'
import { PendingMembershipGuard } from '@renderer/features/collections/components/PendingMembershipGuard'
import { AddToCollection } from '@renderer/features/collections/components/AddToCollection/AddToCollection'
import { useRemoveCollectionSample } from '@renderer/features/collections/hooks/useRemoveCollectionSample'

export function CatalogList({
  favoritesOnly = false,
  collectionId,
  membershipRevision = 0,
  onMembershipChanged,
  context,
  update,
  onReady,
}: {
  favoritesOnly?: boolean
  collectionId?: string
  membershipRevision?: number
  onMembershipChanged?: () => void
} & CatalogViewContext): React.JSX.Element {
  const { revision, updateFavorite, preview } = useLibrarySession()
  const { setSample, openSample, open } = useSampleInspector()
  const [adding, setAdding] = useState<ListSample | null>(null)
  const { page, loading, error, load, refresh } = useCatalog(
    favoritesOnly,
    revision + membershipRevision,
    context.offset,
    context.instruments.map(({ id }) => id),
    context.genres.map(({ id }) => id),
    context.sampleTypes,
    context.search,
    collectionId,
  )
  const select = useCallback(
    (selectedId: string | null) => update({ selectedId }),
    [update],
  )

  const removal = useRemoveCollectionSample(collectionId, () => {
    refresh()
    onMembershipChanged?.()
  })

  useLayoutEffect(() => {
    if (page && !loading && !error) {
      const selectedId = page.items.some(
        (item) => item.id === context.selectedId,
      )
        ? context.selectedId
        : null
      if (context.offset !== page.offset || selectedId !== context.selectedId) {
        update({ offset: page.offset, selectedId })
      }
      onReady()
    } else if (!loading && error) {
      onReady()
    }
  }, [
    page,
    loading,
    error,
    context.offset,
    context.selectedId,
    update,
    onReady,
  ])
  return (
    <>
      {adding && (
        <AddToCollection
          key={adding.id}
          sample={{ id: adding.id, name: adding.relativePath }}
          onClose={() => {
            setAdding(null)
            if (collectionId) {
              refresh()
              onMembershipChanged?.()
            }
          }}
        />
      )}
      {removal.pending && (
        <>
          <PendingMembershipGuard />
          <p role="status">Removing Sample from Collection…</p>
        </>
      )}
      {removal.error && (
        <p role="alert">
          {removal.error}{' '}
          <Button onClick={() => void removal.retry()}>Retry removal</Button>
        </p>
      )}
      {removal.notice && <p role="status">{removal.notice}</p>}
      <SampleFilters
        instruments={context.instruments}
        genres={context.genres}
        sampleTypes={context.sampleTypes}
        search={context.search}
        onSearchChange={(search) =>
          update(
            effectiveCatalogSearch(search) ===
              effectiveCatalogSearch(context.search)
              ? { search }
              : { search, offset: 0, scrollTop: 0 },
          )
        }
        onChange={(filters) => update({ ...filters, offset: 0, scrollTop: 0 })}
      />
      {context.search.trim() && !effectiveCatalogSearch(context.search) && (
        <p role="status">Type at least 2 characters to search.</p>
      )}
      <Button variant="ghost" onClick={refresh} disabled={loading}>
        Refresh
      </Button>
      {loading && <p role="status">Loading samples...</p>}
      {error && (
        <p role="alert">
          {error} <Button onClick={refresh}>Retry</Button>
        </p>
      )}
      <div
        aria-busy={loading}
        data-testid="catalog-results"
        data-total={page?.total}
      >
        {page && (
          <>
            <p>
              {page.total} {favoritesOnly ? 'favorite samples' : 'results'}
            </p>
            {page.total === 0 ? (
              <p>
                {effectiveCatalogSearch(context.search)
                  ? 'No samples match this search. Clear the search or change your filters.'
                  : context.instruments.length > 0 ||
                      context.genres.length > 0 ||
                      context.sampleTypes.length > 0
                    ? 'No samples match these filters. Remove a filter or clear all to see more samples.'
                    : favoritesOnly
                      ? 'No favorites yet. Mark samples as favorites in Samples.'
                      : collectionId
                        ? 'This Collection is empty. Add Samples from the Sample menu in Samples or Favorites.'
                        : 'Your library is empty. Open a folder to add audio samples. Original files stay in place.'}
              </p>
            ) : (
              <SampleList
                samples={page.items}
                onFavoriteChanged={updateFavorite}
                preview={preview}
                onSelectionChanged={setSample}
                onInspect={openSample}
                inspectorOpen={open}
                selection={{ id: context.selectedId, onChange: select }}
                onRemoveFromCollection={
                  collectionId
                    ? (sample) => void removal.remove(sample)
                    : undefined
                }
                membershipPending={removal.pending}
                onAddToCollection={setAdding}
              />
            )}
            <nav className="sample-pagination" aria-label="Sample pages">
              <Button
                disabled={loading || page.offset === 0}
                onClick={() => load(Math.max(0, page.offset - page.limit))}
              >
                Previous page
              </Button>
              <span>
                {page.total === 0 ? 0 : page.offset + 1}–
                {Math.min(page.offset + page.items.length, page.total)} of{' '}
                {page.total}
              </span>
              <Button
                disabled={loading || page.offset + page.limit >= page.total}
                onClick={() => load(page.offset + page.limit)}
              >
                Next page
              </Button>
            </nav>
          </>
        )}
      </div>
    </>
  )
}
