import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

const compactQuery = '(max-width: 1000px)'

export function useInspectorPanel(
  open: boolean,
  setOpen: (open: boolean) => void,
  opener: HTMLElement | null,
): {
  compact: boolean
  panel: RefObject<HTMLElement | null>
  close: () => void
} {
  const [compact, setCompact] = useState(
    () => window.matchMedia(compactQuery).matches,
  )
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    const media = window.matchMedia(compactQuery)
    const update = (): void => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function close(): void {
    setOpen(false)
    requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>(
          '[role="row"][aria-selected="true"]',
        ) ??
        (opener?.isConnected ? opener : document.getElementById('main-content'))
      target?.focus()
    })
  }

  useEffect(() => {
    if (open) {
      if (compact) {
        panel.current?.focus()
      } else if (opener?.isConnected && document.activeElement === opener) {
        opener.closest<HTMLElement>('[role="row"]')?.focus()
      }
    }
  }, [open, compact, opener])

  useEffect(() => {
    if (!open || !compact) {
      return
    }
    function confineFocus(event: FocusEvent): void {
      if (
        event.target instanceof Element &&
        !panel.current?.contains(event.target) &&
        !event.target.closest('[aria-label="Global player"]')
      ) {
        panel.current?.focus()
      }
    }
    function cycleFocus(event: KeyboardEvent): void {
      if (event.key !== 'Tab' || event.defaultPrevented) {
        return
      }
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#sample-inspector button:not(:disabled), [aria-label="Global player"] button:not(:disabled), [aria-label="Global player"] audio',
        ),
      )
      if (controls.length === 0) {
        return
      }
      const current = controls.findIndex(
        (control) => control === document.activeElement,
      )
      const next =
        current === -1
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + controls.length) %
            controls.length
      event.preventDefault()
      controls[next].focus()
    }
    document.addEventListener('focusin', confineFocus)
    document.addEventListener('keydown', cycleFocus)
    return () => {
      document.removeEventListener('focusin', confineFocus)
      document.removeEventListener('keydown', cycleFocus)
    }
  }, [open, compact])

  return {
    compact,
    panel,
    close,
  }
}
