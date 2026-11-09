import { useId, useRef, useState } from 'react'
import type { ComponentPropsWithRef, JSX, ReactNode } from 'react'
import { Popover } from '../Popover'
import { Input } from '../Input'
import './Combobox.css'

export type ComboboxOption = {
  value: string
  label: string
  disabled?: boolean
}

/** A labelled section of the listbox; groups keep the caller's order. */
export type ComboboxGroup = {
  label: string
  options: ComboboxOption[]
}

type Section = {
  label: string | null
  options: ComboboxOption[]
}

/** Flat positions keep keyboard navigation continuous across sections. */
function withOffsets(sections: Section[]): Array<Section & { start: number }> {
  const offsets: number[] = []
  let total = 0
  for (const section of sections) {
    offsets.push(total)
    total += section.options.length
  }
  return sections.map((section, index) => ({
    ...section,
    start: offsets[index],
  }))
}

type SelectionProps =
  | {
      multiple: true
      value: string[]
      onValueChange: (value: string[]) => void
    }
  | {
      multiple?: false
      value: string | null
      onValueChange: (value: string | null) => void
    }

type OptionsProps =
  | {
      /** Flat list. Use `groups` instead to render labelled sections. */
      options: ComboboxOption[]
      groups?: undefined
    }
  | {
      /** Labelled sections. Keyboard navigation moves across their options. */
      groups: ComboboxGroup[]
      options?: undefined
    }

export type ComboboxProps = SelectionProps &
  OptionsProps & {
    listLabel: string
    query: string
    onQueryChange: (query: string) => void
    loading?: boolean
    emptyMessage?: string
    loadingMessage?: string
    footer?: ReactNode
  } & Omit<
    ComponentPropsWithRef<'input'>,
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'type'
    | 'multiple'
    | 'role'
    | 'aria-expanded'
    | 'aria-controls'
    | 'aria-activedescendant'
    | 'aria-autocomplete'
    | 'aria-haspopup'
    | 'children'
  >

export function Combobox({
  options,
  groups,
  listLabel,
  query,
  onQueryChange,
  loading = false,
  emptyMessage = 'No options found.',
  loadingMessage = 'Loading options…',
  footer,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  onClick,
  multiple,
  value,
  onValueChange,
  disabled,
  ...props
}: ComboboxProps): JSX.Element {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeValue, setActiveValue] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const expanded = open && !disabled
  // Sections and the flat entries they contribute share one keyboard sequence.
  const sections: Section[] =
    groups === undefined
      ? [{ label: null, options: options ?? [] }]
      : groups.filter((group) => group.options.length > 0)
  const rendered = withOffsets(sections)
  const entries = rendered.flatMap((section) => section.options)
  const activeIndex = loading
    ? -1
    : entries.findIndex(
        (option) => option.value === activeValue && !option.disabled,
      )

  function isSelected(option: ComboboxOption): boolean {
    return multiple ? value.includes(option.value) : value === option.value
  }

  function choose(option: ComboboxOption): void {
    if (disabled || loading || option.disabled) {
      return
    }
    if (multiple) {
      onValueChange(
        value.includes(option.value)
          ? value.filter((item) => item !== option.value)
          : [...value, option.value],
      )
    } else {
      onValueChange(option.value)
      setOpen(false)
    }
  }

  function move(direction: 1 | -1): void {
    setOpen(true)
    const enabled = entries.filter((option) => !option.disabled)
    if (loading || enabled.length === 0) {
      setActiveValue(null)
      return
    }
    const index = enabled.findIndex((option) => option.value === activeValue)
    const next =
      index < 0
        ? direction === 1
          ? 0
          : enabled.length - 1
        : (index + direction + enabled.length) % enabled.length
    setActiveValue(enabled[next].value)
  }

  function renderOption(option: ComboboxOption, index: number): JSX.Element {
    return (
      <li
        key={option.value}
        id={`${listId}-${index}`}
        role="option"
        aria-selected={isSelected(option)}
        aria-disabled={option.disabled || undefined}
        data-active={activeIndex === index || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => {
          if (!option.disabled) {
            setActiveValue(option.value)
          }
        }}
        onClick={() => choose(option)}
      >
        {multiple && (
          <span aria-hidden="true">{isSelected(option) ? '☑ ' : '☐ '}</span>
        )}
        {option.label}
      </li>
    )
  }

  return (
    <div
      ref={root}
      className={className ? `ui-combobox ${className}` : 'ui-combobox'}
    >
      <Input
        {...props}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        value={query}
        disabled={disabled}
        onChange={(event) => {
          onQueryChange(event.target.value)
          setActiveValue(null)
          setOpen(true)
        }}
        onFocus={(event) => {
          onFocus?.(event)
          if (!event.defaultPrevented) {
            setOpen(true)
          }
        }}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            setOpen(true)
          }
        }}
        onBlur={(event) => {
          onBlur?.(event)
          if (!root.current?.contains(event.relatedTarget)) {
            setOpen(false)
            setActiveValue(null)
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) {
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            move(event.key === 'ArrowDown' ? 1 : -1)
          } else if (
            event.key === 'Enter' &&
            expanded &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault()
            event.stopPropagation()
            if (activeIndex >= 0) {
              choose(entries[activeIndex])
            }
          } else if (event.key === 'Escape' && expanded) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            setActiveValue(null)
          } else if (event.key === 'Tab') {
            setOpen(false)
          }
        }}
      />
      {expanded && (
        <Popover
          open
          anchor={root}
          matchAnchorWidth
          onDismiss={() => {
            setOpen(false)
            setActiveValue(null)
          }}
          className="ui-combobox-popup"
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={listLabel}
            aria-multiselectable={multiple || undefined}
            aria-busy={loading}
          >
            {!loading &&
              rendered.map((section, sectionIndex) =>
                section.label === null ? (
                  section.options.map((option, index) =>
                    renderOption(option, section.start + index),
                  )
                ) : (
                  <li
                    key={section.label}
                    role="group"
                    aria-labelledby={`${listId}-group-${sectionIndex}`}
                  >
                    <span
                      id={`${listId}-group-${sectionIndex}`}
                      className="ui-combobox-group-label"
                    >
                      {section.label}
                    </span>
                    <ul role="presentation">
                      {section.options.map((option, index) =>
                        renderOption(option, section.start + index),
                      )}
                    </ul>
                  </li>
                ),
              )}
          </ul>
          {loading && <p role="status">{loadingMessage}</p>}
          {!loading && entries.length === 0 && emptyMessage !== '' && (
            <p role="status">{emptyMessage}</p>
          )}
          {footer}
        </Popover>
      )}
    </div>
  )
}
