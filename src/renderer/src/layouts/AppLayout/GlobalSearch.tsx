import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { Combobox } from '@renderer/components/ui/Combobox'
import { useSampleSuggestions } from '@renderer/features/library/hooks/useSampleSuggestions'
import { locateSampleState } from '@renderer/features/library/locateSample'
import { effectiveCatalogSearch } from '@shared/features/library/search'

/**
 * Header global search. This slice suggests Samples only, reusing the catalog
 * list request; grouped multi-entity results remain planned in the search guide.
 */
export function GlobalSearch({
  revision,
}: {
  revision: number
}): React.JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { suggestions, loading, error, retry } = useSampleSuggestions(
    query,
    revision,
  )
  const text = effectiveCatalogSearch(query)
  const options = suggestions.map(({ id, name }) => ({
    value: id,
    label: name,
  }))

  function locate(sampleId: string | null): void {
    const sample = suggestions.find(({ id }) => id === sampleId)
    if (!sample) {
      return
    }
    // The field holds the query for the next search, not the located Sample.
    setQuery('')
    void navigate('/samples', { state: locateSampleState(sample) })
  }

  return (
    <Combobox
      className="app-shell-global-search"
      aria-label="Search library"
      placeholder="Search samples"
      listLabel="Sample suggestions"
      query={query}
      onQueryChange={setQuery}
      value={null}
      onValueChange={locate}
      options={options}
      loading={loading}
      emptyMessage={
        error
          ? ''
          : text === ''
            ? 'Type at least 2 characters to search.'
            : 'No samples match this search.'
      }
      loadingMessage="Searching samples…"
      footer={
        error ? (
          <div className="app-shell-global-search-error">
            <p role="alert">{error}</p>
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : undefined
      }
    />
  )
}
