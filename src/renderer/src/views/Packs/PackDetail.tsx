import { Link, useParams } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { PackDetailHeader } from '@renderer/features/packs/components/PackDetailHeader'
import { PackSampleList } from '@renderer/features/packs/components/PackSampleList'
import { usePackDetail } from '@renderer/features/packs/hooks/usePackDetail'
import './pack-detail.css'

export function PackDetail(): React.JSX.Element {
  const { id = '' } = useParams()
  // Route identities own their requests; one Pack's answer never renders as
  // another Pack's header.
  return <Detail key={id} id={id} />
}

function Detail({ id }: { id: string }): React.JSX.Element {
  const { detail, loading, error, unavailable, refresh } = usePackDetail(id)
  return (
    <section aria-labelledby="pack-title" aria-busy={loading}>
      <nav aria-label="Breadcrumb">
        <Link to="/packs">Packs</Link>
      </nav>
      {detail ? (
        <PackDetailHeader detail={detail} />
      ) : (
        <h1 id="pack-title" tabIndex={-1}>
          {unavailable ? 'Pack unavailable' : 'Pack'}
        </h1>
      )}
      {loading && <p role="status">Loading Pack…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {!unavailable && (
        <section
          className="pack-detail-samples"
          aria-labelledby="pack-samples-title"
        >
          <h2 id="pack-samples-title">Samples</h2>
          <PackSampleList key={id} id={id} />
        </section>
      )}
    </section>
  )
}
