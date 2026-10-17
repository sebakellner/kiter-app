export function Favorites(): React.JSX.Element {
  return (
    <section aria-labelledby="favorites-title">
      <h1 id="favorites-title">Favorites</h1>
      <p>Your favorite samples across all registered folders.</p>
      <CatalogList favoritesOnly />
    </section>
  )
}
import { CatalogList } from '@renderer/features/library/components/CatalogList'
