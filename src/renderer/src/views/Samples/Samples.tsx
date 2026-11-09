import { CatalogList } from '@renderer/features/library/components/CatalogList'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { locateSamplePatch } from '@renderer/features/library/locateSample'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Checkbox } from '@renderer/components/ui/Checkbox'
import { useNavigationStore } from '@renderer/stores/useNavigationStore'

export function Samples(): React.JSX.Element {
  const { dir, loading, error } = useLibrarySession()
  const view = useCatalogViewContext()
  const { key, state } = useLocation()
  const { favoritesOnly } = view.context
  const { update } = view
  // Header suggestions and other locators open Samples with a Sample intent.
  useLayoutEffect(() => {
    const patch = locateSamplePatch(state)
    if (patch && useNavigationStore.getState().consumeLocateIntent(key)) {
      update(patch)
    }
  }, [key, state, update])

  return (
    <section aria-labelledby="samples-title">
      <h1 id="samples-title">Samples</h1>

      {dir && <p data-testid="library-directory">Folder: {dir}</p>}
      {loading && <p role="status">Opening folder and loading samples...</p>}
      {error && (
        <p role="alert" className="sample-error" data-testid="library-error">
          {error}
        </p>
      )}

      <label>
        <Checkbox
          data-testid="favorites-filter"
          checked={favoritesOnly}
          onChange={(event) =>
            view.update({
              favoritesOnly: event.target.checked,
              offset: 0,
              selectedId: null,
              scrollTop: 0,
            })
          }
        />
        Favorites only
      </label>
      <CatalogList key={key} favoritesOnly={favoritesOnly} {...view} />
    </section>
  )
}
