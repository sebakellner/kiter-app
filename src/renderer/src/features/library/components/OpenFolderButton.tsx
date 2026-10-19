import type { JSX } from 'react'
import { Button } from '@renderer/components/ui/Button'

type Props = {
  onClick: () => void
  loading?: boolean
}

export function OpenFolderButton({
  onClick,
  loading = false,
}: Props): JSX.Element {
  return (
    <Button
      variant="primary"
      data-testid="open-folder"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? 'Loading folder...' : 'Open folder'}
    </Button>
  )
}
