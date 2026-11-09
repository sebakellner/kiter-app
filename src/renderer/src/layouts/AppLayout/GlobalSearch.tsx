import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { Combobox } from '@renderer/components/ui/Combobox'
import type { ComboboxGroup } from '@renderer/components/ui/Combobox'
import { useSearchSuggestions } from '@renderer/features/library/hooks/useSearchSuggestions'
import { locateSampleState } from '@renderer/features/library/locateSample'
import { locateGenreState } from '@renderer/features/library/locateGenre'
import { effectiveCatalogSearch } from '@shared/features/library/search'
import type { SearchSuggestion, SuggestionKind } from '@shared/ipc/search'

const GROUP_LABELS: Record<SuggestionKind, string> = {
  sample: 'Samples',
  pack: 'Packs',
  collection: 'Collections',
  instrument: 'Instruments',
  author: 'Authors',
  genre: 'Genres',
}

/** One flat option list keeps keyboard navigation continuous across groups. */
function optionValue(suggestion: SearchSuggestion): string {
  return `${suggestion.kind}:${suggestion.id}`
}

/**
 * Header global search. One bounded request returns suggestions grouped by
 * entity kind; selecting one opens its destination without playing audio.
 */
export function GlobalSearch({
  revision,
}: {
  revision: number
}): React.JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { groups, loading, error, retry } = useSearchSuggestions(
    query,
    revision,
  )
  const text = effectiveCatalogSearch(query)
  const suggestions = groups.flatMap(({ items }) => items)
  const options: ComboboxGroup[] = groups.map((group) => ({
    label: GROUP_LABELS[group.kind],
    options: group.items.map((item) => ({
      value: optionValue(item),
      label: item.name,
    })),
  }))

  function open(value: string | null): void {
    const suggestion = suggestions.find((item) => optionValue(item) === value)
    if (!suggestion) {
      return
    }
    // The field holds the query for the next search, not the opened entity.
    setQuery('')
    switch (suggestion.kind) {
      case 'sample':
        void navigate('/samples', { state: locateSampleState(suggestion) })
        return
      case 'genre':
        // Genres have no detail route: Samples opens filtered by the Genre.
        void navigate('/samples', { state: locateGenreState(suggestion) })
        return
      case 'pack':
        void navigate(`/packs/${suggestion.id}`)
        return
      case 'collection':
        void navigate(`/collections/${suggestion.id}`)
        return
      case 'instrument':
        // Instruments and Authors have list destinations only.
        void navigate('/instruments')
        return
      case 'author':
        void navigate('/authors')
    }
  }

  return (
    <Combobox
      className="app-shell-global-search"
      aria-label="Search library"
      placeholder="Search your library"
      listLabel="Library suggestions"
      query={query}
      onQueryChange={setQuery}
      value={null}
      onValueChange={open}
      groups={options}
      loading={loading}
      emptyMessage={
        error
          ? ''
          : text === ''
            ? 'Type at least 2 characters to search.'
            : 'No matches in your library.'
      }
      loadingMessage="Searching the library…"
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
