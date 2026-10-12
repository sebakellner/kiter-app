import type { AudioFile } from '@shared/ipc'

type Props = {
  files: AudioFile[]
}

export function FileList({ files }: Props): React.JSX.Element {
  if (files.length === 0) {
    return <p>No hay archivos de audio para mostrar.</p>
  }

  return (
    <ul className="audio-files" aria-label="Archivos de audio">
      {files.map((file) => (
        <li key={file.path} title={file.path}>
          {file.relativePath}
        </li>
      ))}
    </ul>
  )
}
