import { useId, useRef, useState } from 'react'
import type { ComponentPropsWithRef, JSX } from 'react'
import { Popover } from '../Popover'
import './Combobox.css'

export type ComboboxOption = {
  value: string
  label: string
  disabled?: boolean
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

export type ComboboxProps = SelectionProps & {
  options: ComboboxOption[]
  listLabel: string
  query: string
  onQueryChange: (query: string) => void
  loading?: boolean
  emptyMessage?: string
  loadingMessage?: string
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
  listLabel,
  query,
  onQueryChange,
  loading = false,
  emptyMessage = 'No options found.',
  loadingMessage = 'Loading options…',
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
  const activeIndex = loading
    ? -1
    : options.findIndex(
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
    const enabled = options.filter((option) => !option.disabled)
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

  return (
    <div
      ref={root}
      className={className ? `ui-combobox ${className}` : 'ui-combobox'}
    >
      <input
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
              choose(options[activeIndex])
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
              options.map((option, index) => (
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
                    <span aria-hidden="true">
                      {isSelected(option) ? '☑ ' : '☐ '}
                    </span>
                  )}
                  {option.label}
                </li>
              ))}
          </ul>
          {loading && <p role="status">{loadingMessage}</p>}
          {!loading && options.length === 0 && (
            <p role="status">{emptyMessage}</p>
          )}
        </Popover>
      )}
    </div>
  )
}
