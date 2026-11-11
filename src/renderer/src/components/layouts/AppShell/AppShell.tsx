import type { CSSProperties, ReactNode } from 'react'
import {
  MACOS_TRAFFIC_LIGHT_INSET,
  WINDOW_HEADER_HEIGHT,
  type WindowPlatform,
} from '@shared/window-chrome'
import './AppShell.css'

type Props = {
  header: ReactNode
  sidebar: ReactNode
  player: ReactNode
  children: ReactNode
  platform: WindowPlatform
  inspector?: ReactNode
  compactInspector?: boolean
  onDismissInspector?: () => void
}

export function AppShell({
  header,
  sidebar,
  player,
  children,
  platform,
  inspector,
  compactInspector = false,
  onDismissInspector,
}: Props): React.JSX.Element {
  // The header band replaces the native title bar, so its height and the space
  // the platform window controls need come from the shared window-chrome module.
  const chrome = {
    ...(platform === 'darwin'
      ? { '--app-shell-header-start-inset': `${MACOS_TRAFFIC_LIGHT_INSET}px` }
      : {}),
  } as CSSProperties

  return (
    <div className="app-shell" style={chrome} data-platform={platform}>
      <a className="app-shell-skip" href="#main-content">
        Skip to content
      </a>
      <header
        className="app-shell-header"
        style={{ height: WINDOW_HEADER_HEIGHT }}
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
