import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { useCollectionDetail } from '@renderer/features/collections/hooks/useCollectionDetail'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import './collection-detail.css'

export function CollectionDetail(): React.JSX.Element {
  const { id = '' } = useParams()
  const { collection, loading, error, unavailable, refresh } =
    useCollectionDetail(id)
  const { onReady } = useCatalogViewContext()
  useEffect(() => {
    if (!loading) {
      onReady()
    }
  }, [loading, onReady])
  return (
    <section aria-labelledby="collection-title" aria-busy={loading}>
      <nav aria-label="Breadcrumb">
        <Link to="/collections">Collections</Link>
      </nav>
      <h1 id="collection-title" tabIndex={-1}>
        {collection?.name ??
          (unavailable ? 'Collection unavailable' : 'Collection')}
      </h1>
      {loading && <p role="status">Loading Collection…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {collection && (
        <>
          <p>Collection ID: {collection.id}</p>
          {collection.description && (
            <p className="collection-description">{collection.description}</p>
          )}
          <p>
            {collection.sampleCount}{' '}
            {collection.sampleCount === 1 ? 'Sample' : 'Samples'}
          </p>
          {collection.sampleCount === 0 ? (
            <p>
              This Collection is empty. Adding Samples will be available in a
              later update.
            </p>
          ) : (
            <p>
              Viewing and managing Collection Samples will be available in a
              later update.
            </p>
          )}
          <Button disabled={loading} onClick={refresh}>
            Refresh Collection
          </Button>
        </>
      )}
    </section>
  )
}
