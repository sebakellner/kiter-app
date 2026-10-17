import { CatalogList } from '@renderer/features/library/components/CatalogList'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { useSamplesViewState } from './useSamplesViewState'

export function Samples(): React.JSX.Element {
  const { dir, loading, error } = useLibrarySession()
  const { favoritesOnly, setFavoritesOnly } = useSamplesViewState()

  return (
    <section aria-labelledby="samples-title">
      <h1 id="samples-title">Samples</h1>
      <p>Browse samples from all folders added to your library.</p>

      {dir && <p data-testid="library-directory">Folder: {dir}</p>}
      {loading && <p role="status">Opening folder and loading samples...</p>}
      {error && (
        <p role="alert" className="sample-error" data-testid="library-error">
          {error}
        </p>
      )}

      <label>
        <input
          type="checkbox"
          data-testid="favorites-filter"
          checked={favoritesOnly}
          onChange={(event) => setFavoritesOnly(event.target.checked)}
        />
        Favorites only
      </label>
      <CatalogList key={String(favoritesOnly)} favoritesOnly={favoritesOnly} />
    </section>
  )
}
