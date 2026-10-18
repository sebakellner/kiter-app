import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { useSampleSuggestions } from './useSampleSuggestions'

export function SampleSuggestions({
  sampleId,
}: {
  sampleId: string
}): React.JSX.Element {
  const { groups, loading, pending, error, notice, refresh, apply } =
    useSampleSuggestions(sampleId)
  const assigned = groups.filter(
    ({ item }) => item.kind === 'assigned' || item.alreadyAssigned,
  )
  const suggestions = groups.filter(
    ({ item }) => item.kind === 'proposal' && !item.alreadyAssigned,
  )
  const ambiguous = groups.filter(({ item }) => item.kind === 'ambiguity')
  const disabled = loading || pending || error !== null
  return (
    <section aria-label="Classification suggestions">
      <h3>Classification</h3>
      {loading && <p role="status">Loading suggestions...</p>}
      {pending && <p role="status">Saving classifications...</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <Button disabled={pending} onClick={refresh}>
            Refresh suggestions
          </Button>
        </p>
      )}
      {(['category', 'genre', 'sample-type'] as const).map((dimension) => {
        const saved = assigned.filter(
          ({ item }) => item.dimension === dimension,
        )
        const proposed = suggestions.filter(
          ({ item }) => item.dimension === dimension,
        )
        if (saved.length === 0 && proposed.length === 0) {
          return null
        }
        return (
          <section key={dimension} aria-label={dimension}>
            <h4>
              {
                {
                  category: 'Categories',
                  genre: 'Genres',
                  'sample-type': 'Sample type',
                }[dimension]
              }
            </h4>
            {saved.map(({ item }) => (
              <Badge key={item.key}>{item.name}</Badge>
            ))}
            {proposed.length > 0 && (
              <>
                <p>Suggested</p>
                <ul>
                  {proposed.map(({ item }) => (
                    <li key={item.key}>
                      <Badge>{item.name}</Badge>{' '}
                      {item.needsCreation && (
                        <small>Creates {item.name} when applied. </small>
                      )}
                      <Button
                        disabled={disabled}
                        aria-label={`Apply ${item.name}`}
                        onClick={() => void apply([item.key])}
                      >
                        +
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      })}
      {suggestions.length > 1 && (
        <Button
          disabled={disabled || suggestions.length > 100}
          onClick={() => void apply(suggestions.map(({ item }) => item.key))}
        >
          Apply all ({suggestions.length})
        </Button>
      )}
      {!loading && !error && groups.length === 0 && (
        <p>
          No classification clues found in eligible cataloged locations or
          origin Pack Genres.
        </p>
      )}
      {ambiguous.length > 0 && (
        <p>Some clues are ambiguous and will not be applied automatically.</p>
      )}
      {(suggestions.length > 0 || ambiguous.length > 0) && (
        <details>
          <summary>Why these suggestions?</summary>
          <ul aria-label="Classification evidence">
            {[...suggestions, ...ambiguous].map(({ item, evidence }) => (
              <li key={`${item.kind}:${item.key}`}>
                <strong>{item.name}</strong>
                {item.kind === 'ambiguity' && (
                  <p>
                    Ambiguous: {item.reason}. No assignment proposed for this
                    match.
                  </p>
                )}
                <ul>
                  {evidence.map((row, index) => (
                    <li key={index}>
                      <p>{row.evidence}</p>
                      <p>
                        Matched clue: {row.clue} ({row.rule})
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
