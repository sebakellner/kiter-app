import type { PackDetail } from '@shared/ipc/packs'
import './PackDetailHeader.css'

type GroupProps = {
  title: string
  singular: string
  emptyText: string
  total: number
  names: string[]
}

// Instruments, Authors and Genres arrive as bounded pages that echo their own
// total, so a group always states how much of the total it actually holds.
function BoundedGroup({
  title,
  singular,
  emptyText,
  total,
  names,
}: GroupProps): React.JSX.Element {
  const headingId = `pack-detail-group-${title.toLowerCase()}`
  return (
    <section className="pack-detail-group" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {total === 0 ? (
        <p className="pack-detail-group-note">{emptyText}</p>
      ) : (
        <>
          <p className="pack-detail-group-note">
            Showing {names.length} of {total} {total === 1 ? singular : title}.
          </p>
          <ul className="pack-detail-group-items">
            {names.map((name, index) => (
              <li key={`${index}:${name}`}>{name}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function PackDetailHeader({
  detail,
}: {
  detail: PackDetail
}): React.JSX.Element {
  const { pack, instruments, authors, genres } = detail
  return (
    <header className="pack-detail-header">
      {/* Pack covers are stored as managed image identities, and no channel
          exposes those bytes to the renderer yet, so the cover is a neutral
          placeholder rather than a broken image. */}
      <div
        className="pack-detail-cover"
        role="img"
        aria-label="Pack cover placeholder"
      >
        <span aria-hidden="true">♪</span>
      </div>
      <div className="pack-detail-identity">
        <h1 id="pack-title" tabIndex={-1}>
          {pack.name}
        </h1>
        <p className="pack-detail-source">{pack.sourceRootPath}</p>
        {pack.description ? (
          <p className="pack-detail-description">{pack.description}</p>
        ) : (
          <p className="pack-detail-description pack-detail-muted">
            No description.
          </p>
        )}
      </div>
      <div className="pack-detail-groups">
        <BoundedGroup
          title="Instruments"
          singular="Instrument"
          emptyText="No Instruments assigned."
          total={instruments.total}
          names={instruments.items.map((instrument) => instrument.name)}
        />
        <BoundedGroup
          title="Authors"
          singular="Author"
          emptyText="No Authors credited."
          total={authors.total}
          names={authors.items.map((author) => author.name)}
        />
        <BoundedGroup
          title="Genres"
          singular="Genre"
          emptyText="No Genres assigned."
          total={genres.total}
          names={genres.items.map((genre) => genre.name)}
        />
      </div>
    </header>
  )
}
