import { JSX } from 'react/jsx-runtime'

type Props = {
  onClick: () => void
  loading?: boolean
}

export function OpenFolderButton({ onClick, loading = false }: Props): JSX.Element {
  return (
    <button type="button" data-testid="open-folder" onClick={onClick} disabled={loading}>
      {loading ? 'Loading folder...' : 'Open folder'}
    </button>
  )
}
