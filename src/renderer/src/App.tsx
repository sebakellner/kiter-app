import { FileList } from './features/library/FileList'
import { OpenFolderButton } from './features/library/OpenFolderButton'
import { useLibrary } from './features/library/uselibrary'

export default function App(): React.JSX.Element {
  const { dir, files, loading, error, openFolder } = useLibrary()

  return (
    <main className="library" aria-busy={loading}>
      <h1>Biblioteca de audio</h1>
      <OpenFolderButton onClick={openFolder} loading={loading} />

      {!dir && <p>Abre una carpeta para listar sus archivos de audio.</p>}
      {dir && <p className="library-directory">Carpeta: {dir}</p>}
      {loading && <p role="status">Abriendo carpeta y leyendo archivos...</p>}
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}

      {dir && !loading && (
        <>
          <p>{files.length} archivos de audio</p>
          <FileList files={files} />
        </>
      )}
    </main>
  )
}
