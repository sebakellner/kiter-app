import { NavLink } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'

export function AppSidebar(): React.JSX.Element {
  return (
    <nav aria-label="Main navigation">
      <Button as={NavLink} variant="ghost" to="/home">
        Home
      </Button>
      <h2>Library</h2>
      <Button as={NavLink} variant="ghost" to="/samples">
        Samples
      </Button>
      <Button as={NavLink} variant="ghost" to="/favorites">
        Favorites
      </Button>
      <Button as={NavLink} variant="ghost" to="/packs">
        Packs
      </Button>
      <Button as={NavLink} variant="ghost" to="/collections">
        Collections
      </Button>
      <h2>Organization</h2>
      <Button as={NavLink} variant="ghost" to="/instruments">
        Instruments
      </Button>
      <Button as={NavLink} variant="ghost" to="/authors">
        Authors
      </Button>
      <h2>Your collections</h2>
      <div className="app-shell-collections">
        <p>Open Collections to create and browse your selections.</p>
      </div>
    </nav>
  )
}
