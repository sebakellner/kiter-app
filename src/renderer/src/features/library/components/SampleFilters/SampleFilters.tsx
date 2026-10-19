import { useRef } from 'react'
import type { Instrument } from '@shared/domain/classification'
import type { Genre } from '@shared/domain/recognition'
import { Button } from '@renderer/components/ui/Button'
import { Select } from '@renderer/components/ui/Select'
import { Input } from '@renderer/components/ui/Input'
import { MAX_CATALOG_SEARCH_LENGTH } from '@shared/features/library/search'
import type { SampleTypeFilter } from '@shared/features/library/schemas'
import { ClassificationFilter } from './ClassificationFilter'
import './sample-filters.css'

const sampleTypeLabels = {
  loop: 'Loops',
  'one-shot': 'One-Shots',
  unknown: 'Unknown',
}
const sampleTypeOptions: SampleTypeFilter = ['loop', 'one-shot', 'unknown']

export function SampleFilters({
  instruments,
  genres,
  sampleTypes,
  search,
  onSearchChange,
  onChange,
}: {
  instruments: Instrument[]
  genres: Genre[]
  sampleTypes: SampleTypeFilter
  search: string
  onSearchChange: (value: string) => void
  onChange: (filters: {
    instruments: Instrument[]
    genres: Genre[]
    sampleTypes: SampleTypeFilter
  }) => void
}): React.JSX.Element {
  const instrumentInput = useRef<HTMLInputElement>(null)
  const genreInput = useRef<HTMLInputElement>(null)
  const typeInput = useRef<HTMLSelectElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  return (
    <section className="sample-filters" aria-label="Sample filters">
      <div className="sample-filters-controls">
        <ClassificationFilter
          kind="instruments"
          input={instrumentInput}
          value={instruments}
          onChange={(value) =>
            onChange({ instruments: value, genres, sampleTypes })
          }
        />
        <ClassificationFilter
          kind="genres"
          input={genreInput}
          value={genres}
          onChange={(value) =>
            onChange({ instruments, genres: value, sampleTypes })
          }
        />
        <Select
          aria-label="Sample type"
          ref={typeInput}
          value={sampleTypes[0] ?? 'all'}
          onChange={(event) => {
            const type = sampleTypeOptions.find(
              (value) => value === event.currentTarget.value,
            )
            onChange({ instruments, genres, sampleTypes: type ? [type] : [] })
          }}
        >
          <option value="all">Sample type</option>
          <option value="one-shot">One-Shots</option>
          <option value="loop">Loops</option>
          <option value="unknown">Unknown</option>
        </Select>
        <div className="sample-filters-search">
          <Input
            ref={searchInput}
            type="search"
            aria-label="Search samples"
            placeholder="Search samples"
            maxLength={MAX_CATALOG_SEARCH_LENGTH}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {search.length > 0 && (
            <Button
              onClick={() => {
                onSearchChange('')
                searchInput.current?.focus()
              }}
            >
              Clear search
            </Button>
          )}
        </div>
      </div>
      {(instruments.length > 0 ||
        genres.length > 0 ||
        sampleTypes.length > 0) && (
        <div
          className="sample-filters-chips"
          aria-label="Active sample filters"
        >
          {instruments.map((instrument) => (
            <Button
              key={instrument.id}
              aria-label={`Remove instrument filter: ${instrument.name}`}
              onClick={() => {
                onChange({
                  instruments: instruments.filter(
                    ({ id }) => id !== instrument.id,
                  ),
                  genres,
                  sampleTypes,
                })
                instrumentInput.current?.focus()
              }}
            >
              {instrument.name} ×
            </Button>
          ))}
          {genres.map((genre) => (
            <Button
              key={genre.id}
              aria-label={`Remove genre filter: ${genre.name}`}
              onClick={() => {
                onChange({
                  instruments,
                  genres: genres.filter(({ id }) => id !== genre.id),
                  sampleTypes,
                })
                genreInput.current?.focus()
              }}
            >
              {genre.name} ×
            </Button>
          ))}
          {sampleTypes.map((type) => (
            <Button
              key={type}
              aria-label={`Remove Sample type filter: ${sampleTypeLabels[type]}`}
              onClick={() => {
                onChange({
                  instruments,
                  genres,
                  sampleTypes: sampleTypes.filter((value) => value !== type),
                })
                typeInput.current?.focus()
              }}
            >
              {sampleTypeLabels[type]} ×
            </Button>
          ))}
          <Button
            onClick={() => {
              onChange({ instruments: [], genres: [], sampleTypes: [] })
              instrumentInput.current?.focus()
            }}
          >
            Clear all
          </Button>
        </div>
      )}
    </section>
  )
}
