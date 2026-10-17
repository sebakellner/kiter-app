import { Button } from '@renderer/components/ui/Button'
import { useLibrarySession } from '../hooks/useLibrarySession'
import { useCatalog } from '../hooks/useCatalog'
import { SampleList } from './SampleList'

export function CatalogList({
  favoritesOnly = false,
}: {
  favoritesOnly?: boolean
}): React.JSX.Element {
  const { revision, updateFavorite, preview } = useLibrarySession()
  const { page, loading, error, load, refresh } = useCatalog(
    favoritesOnly,
    revision,
  )
  return (
    <>
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
                {favoritesOnly
                  ? 'No favorites yet. Mark samples as favorites in Samples.'
                  : 'Your library is empty. Open a folder to add audio samples. Original files stay in place.'}
              </p>
            ) : (
              <SampleList
                samples={page.items}
                onFavoriteChanged={updateFavorite}
                preview={preview}
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
