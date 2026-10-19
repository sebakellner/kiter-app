import { useEffect } from 'react'

export function useShellNavigation(): void {
  useEffect(() => {
    function navigateRegion(event: KeyboardEvent): void {
      if (
        event.key !== 'F6' ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[aria-modal="true"], dialog[open]')
      ) {
        return
      }

      const regions = Array.from(
        document.querySelectorAll<HTMLElement>('[data-shell-region]'),
      ).filter((region) => !region.closest('[inert]'))
      if (regions.length === 0) {
        return
      }
      const current = regions.findIndex((region) =>
        region.contains(document.activeElement),
      )
      const next =
        current === -1
          ? event.shiftKey
            ? regions.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + regions.length) %
            regions.length
      const region = regions[next]
      const available = (selector: string): HTMLElement | undefined =>
        Array.from(region.querySelectorAll<HTMLElement>(selector)).find(
          (element) => !element.closest('[inert]'),
        )
      const target =
        available('[role="row"][aria-selected="true"]') ??
        available('[role="row"][tabindex="0"]') ??
        available('a[aria-current="page"]') ??
        available('button:not(:disabled), a[href], audio') ??
        region
      event.preventDefault()
      target.focus()
    }

    document.addEventListener('keydown', navigateRegion)
    return () => document.removeEventListener('keydown', navigateRegion)
  }, [])
}
