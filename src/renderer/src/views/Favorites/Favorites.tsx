import { CatalogList } from '@renderer/features/library/components/CatalogList'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import { useLocation } from 'react-router-dom'

export function Favorites(): React.JSX.Element {
  const view = useCatalogViewContext()
  const { key } = useLocation()
  return (
    <section aria-labelledby="favorites-title">
      <h1 id="favorites-title">Favorites</h1>
      <p>Your favorite samples across all registered folders.</p>
      <CatalogList key={key} favoritesOnly {...view} />
    </section>
  )
}
