import { Button } from '@renderer/components/ui/Button'
import { useLibrarySession } from '../hooks/useLibrarySession'
import { useCatalog } from '../hooks/useCatalog'
import { SampleList } from './SampleList'
import { useSampleInspector } from './SampleInspector'
import { useCallback, useLayoutEffect } from 'react'
import type { CatalogViewContext } from '@renderer/routes/navigationContext'
import { SampleFilters } from './SampleFilters/SampleFilters'
import { effectiveCatalogSearch } from '@shared/features/library/search'

export function CatalogList({
  favoritesOnly = false,
  context,
  update,
  onReady,
}: {
  favoritesOnly?: boolean
} & CatalogViewContext): React.JSX.Element {
  const { revision, updateFavorite, preview } = useLibrarySession()
  const { setSample, openSample, open } = useSampleInspector()
  const { page, loading, error, load, refresh } = useCatalog(
    favoritesOnly,
    revision,
    context.offset,
    context.instruments.map(({ id }) => id),
    context.genres.map(({ id }) => id),
    context.sampleTypes,
    context.search,
  )
  const select = useCallback(
    (selectedId: string | null) => update({ selectedId }),
    [update],
  )

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
