import type { ReactNode } from 'react'
import './AppShell.css'

type Props = {
  header: ReactNode
  sidebar: ReactNode
  player: ReactNode
  children: ReactNode
  inspector?: ReactNode
  compactInspector?: boolean
  onDismissInspector?: () => void
}

export function AppShell({
  header,
  sidebar,
  player,
  children,
  inspector,
  compactInspector = false,
  onDismissInspector,
}: Props): React.JSX.Element {
  return (
    <div className="app-shell">
      <a className="app-shell-skip" href="#main-content">
        Skip to content
      </a>
      <header
        className="app-shell-header"
        inert={compactInspector}
        data-shell-region="header"
        tabIndex={-1}
      >
        {header}
      </header>
      <div
        className="app-shell-workspace"
        data-inspector-open={Boolean(inspector)}
        data-inspector-compact={compactInspector}
      >
        <aside
          className="app-shell-sidebar"
          inert={compactInspector}
          data-shell-region="sidebar"
          tabIndex={-1}
        >
          {sidebar}
        </aside>
        {children}
        {compactInspector && (
          <div
            className="app-shell-inspector-backdrop"
            onClick={onDismissInspector}
          />
        )}
        {inspector}
      </div>
      {player}
    </div>
  )
}
