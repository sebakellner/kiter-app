import { Link } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'

export function Home(): React.JSX.Element {
  const { dir, files } = useLibrarySession()
  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">Home</h1>
      <p>Your sounds, ready for your next session.</p>
      <div>
        <h2>{dir ? 'Current folder' : 'Start with your samples'}</h2>
        {dir ? (
          <>
            <p>
              {files.length} audio files ·{' '}
              {files.filter((file) => file.favorite).length} favorites in this
              folder
            </p>
            <p>{dir}</p>
            <Button as={Link} to="/samples">
              Browse samples
            </Button>
          </>
        ) : (
          <p>
            Use Open folder to explore your audio. Your source files stay in
            place.
          </p>
        )}
      </div>
      <p>
        This first prototype browses one folder at a time. Library-wide
        summaries and recent activity are coming later.
      </p>
    </section>
  )
}
