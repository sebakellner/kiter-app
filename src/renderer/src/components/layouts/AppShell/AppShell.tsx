import type { ReactNode } from 'react'
import './AppShell.css'

type Props = {
  header: ReactNode
  sidebar: ReactNode
  player: ReactNode
  children: ReactNode
}

export function AppShell({
  header,
  sidebar,
  player,
  children,
}: Props): React.JSX.Element {
  return (
    <div className="app-shell">
      <a className="app-shell-skip" href="#main-content">
        Skip to content
      </a>
      <header className="app-shell-header">{header}</header>
      <div className="app-shell-workspace">
        <aside className="app-shell-sidebar">{sidebar}</aside>
        {children}
      </div>
      {player}
    </div>
  )
}
