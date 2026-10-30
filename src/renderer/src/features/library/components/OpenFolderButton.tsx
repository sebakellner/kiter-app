import type { JSX } from 'react'
import { Button } from '@renderer/components/ui/Button'

type Props = {
  onClick: () => void
}

export function OpenFolderButton({ onClick }: Props): JSX.Element {
  return (
    <Button variant="primary" data-testid="open-folder" onClick={onClick}>
      Open folder
    </Button>
  )
}
