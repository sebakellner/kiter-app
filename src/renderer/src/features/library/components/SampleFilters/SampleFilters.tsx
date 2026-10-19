import { useRef } from 'react'
import type { Category } from '@shared/domain/classification'
import type { Genre } from '@shared/domain/recognition'
import { Button } from '@renderer/components/ui/Button'
import { ClassificationFilter } from './ClassificationFilter'
import './sample-filters.css'

export function SampleFilters({
  categories,
  genres,
  onChange,
}: {
  categories: Category[]
  genres: Genre[]
  onChange: (filters: { categories: Category[]; genres: Genre[] }) => void
}): React.JSX.Element {
  const categoryInput = useRef<HTMLInputElement>(null)
  const genreInput = useRef<HTMLInputElement>(null)
  return (
    <section className="sample-filters" aria-label="Sample filters">
      <div className="sample-filters-controls">
        <ClassificationFilter
          kind="categories"
          input={categoryInput}
          value={categories}
          onChange={(value) => onChange({ categories: value, genres })}
        />
        <ClassificationFilter
          kind="genres"
          input={genreInput}
          value={genres}
          onChange={(value) => onChange({ categories, genres: value })}
        />
      </div>
      {(categories.length > 0 || genres.length > 0) && (
        <div
          className="sample-filters-chips"
          aria-label="Active sample filters"
        >
          {categories.map((category) => (
            <Button
              key={category.id}
              aria-label={`Remove category filter: ${category.name}`}
              onClick={() => {
                onChange({
                  categories: categories.filter(({ id }) => id !== category.id),
                  genres,
                })
                categoryInput.current?.focus()
              }}
            >
              {category.name} ×
            </Button>
          ))}
          {genres.map((genre) => (
            <Button
              key={genre.id}
              aria-label={`Remove genre filter: ${genre.name}`}
              onClick={() => {
                onChange({
                  categories,
                  genres: genres.filter(({ id }) => id !== genre.id),
                })
                genreInput.current?.focus()
              }}
            >
              {genre.name} ×
            </Button>
          ))}
          <Button
            onClick={() => {
              onChange({ categories: [], genres: [] })
              categoryInput.current?.focus()
            }}
          >
            Clear all
          </Button>
        </div>
      )}
    </section>
  )
}
