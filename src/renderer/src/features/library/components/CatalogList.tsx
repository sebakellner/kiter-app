import { Button } from '@renderer/components/ui/Button'
import { useLibrarySession } from '../hooks/useLibrarySession'
import { useCatalog } from '../hooks/useCatalog'
import { SampleList } from './SampleList'
import { useSampleInspector } from './SampleInspector'
import { useCallback, useLayoutEffect } from 'react'
import type { CatalogViewContext } from '@renderer/routes/navigationContext'
import { CategoryFilter } from './CategoryFilter/CategoryFilter'

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
    context.categories.map(({ id }) => id),
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
      <CategoryFilter
        value={context.categories}
        onChange={(categories) =>
          update({ categories, offset: 0, scrollTop: 0 })
        }
      />
      <Button onClick={refresh} disabled={loading}>
        Refresh
      </Button>
      {loading && <p role="status">Loading samples...</p>}
      {error && (
        <p role="alert">
          {error} <Button onClick={refresh}>Retry</Button>
        </p>
      )}
      <div aria-busy={loading} data-testid="catalog-results">
        {page && (
          <>
            <p>
              {page.total}{' '}
              {favoritesOnly ? 'favorite samples' : 'samples in your library'}
            </p>
            {page.total === 0 ? (
              <p>
                {context.categories.length > 0
                  ? 'No samples match these categories. Remove a category filter or clear all to see more samples.'
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
            <nav aria-label="Sample pages">
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
