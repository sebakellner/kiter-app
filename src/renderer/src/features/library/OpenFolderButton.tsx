import { JSX } from 'react/jsx-runtime'

type Props = {
  onClick: () => void
  loading?: boolean
}

export function OpenFolderButton({ onClick, loading = false }: Props): JSX.Element {
  return (
    <button type="button" onClick={onClick} disabled={loading}>
      {loading ? 'Leyendo carpeta...' : 'Abrir carpeta'}
    </button>
  )
}
