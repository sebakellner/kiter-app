import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { useCollectionDetail } from '@renderer/features/collections/hooks/useCollectionDetail'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import './collection-detail.css'
import { CatalogList } from '@renderer/features/library/components/CatalogList'
import { CollectionForm } from '@renderer/features/collections/components/CollectionForm/CollectionForm'
import { DeleteCollection } from '@renderer/features/collections/components/DeleteCollection/DeleteCollection'

export function CollectionDetail(): React.JSX.Element {
  const { id = '' } = useParams()
  const { key } = useLocation()
  // Route identities own their overlays and requests, never another detail's state.
  return <Detail key={`${id}:${key}`} id={id} historyKey={key} />
}

function Detail({
  id,
  historyKey,
}: {
  id: string
  historyKey: string
}): React.JSX.Element {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [membershipRevision, setMembershipRevision] = useState(0)
  const { collection, loading, error, unavailable, refresh } =
    useCollectionDetail(id)
  const view = useCatalogViewContext()
  const { onReady } = view
  useEffect(() => {
    if (!loading && !collection) {
      onReady()
    }
  }, [loading, collection, onReady])
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
          <Button
            disabled={loading || editing || deleting}
            onClick={() => setEditing(true)}
          >
            Edit Collection
          </Button>
          <Button
            disabled={loading || editing || deleting}
            onClick={() => setDeleting(true)}
          >
            Delete Collection
          </Button>
          {notice && <p role="status">{notice}</p>}
          <Button
            disabled={loading}
            onClick={() => {
              refresh()
              setMembershipRevision((current) => current + 1)
            }}
          >
            Refresh Collection
          </Button>
          <CatalogList
            key={`${id}:${historyKey}`}
            {...view}
            collectionId={id}
            membershipRevision={membershipRevision}
            onMembershipChanged={refresh}
          />
          {editing && (
            <CollectionForm
              collection={collection}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                setNotice('Collection saved.')
                refresh()
              }}
            />
          )}
          {deleting && (
            <DeleteCollection
              id={id}
              onClose={() => setDeleting(false)}
              onDeleted={() => {
                void navigate('/collections', {
                  state: { collectionDeleted: true },
                })
              }}
            />
          )}
        </>
      )}
    </section>
  )
}
