import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { OpenFolderButton } from '@renderer/features/library/components/OpenFolderButton'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'

export function AppHeader(): React.JSX.Element {
  const navigate = useNavigate()
  const { loading, openFolder } = useLibrarySession()

  return (
    <>
      <span className="app-shell-brand">Kiter</span>
      <Button
        variant="ghost"
        aria-label="Back"
        onClick={() => void navigate(-1)}
      >
        Back
      </Button>
      <Button
        variant="ghost"
        aria-label="Forward"
        onClick={() => void navigate(1)}
      >
        Forward
      </Button>
      <OpenFolderButton
        loading={loading}
        onClick={async () => {
          if (await openFolder()) {
            void navigate('/samples')
          }
        }}
      />
    </>
  )
}
