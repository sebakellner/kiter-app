import './Library.css'
import { FileList } from '../FileList'
import { OpenFolderButton } from '../OpenFolderButton'
import { useLibrary } from '../../hooks/useLibrary'

export function Library(): React.JSX.Element {
  const { dir, files, loading, error, openFolder, updateFavorite } = useLibrary()

  return (
    <main className="library" aria-busy={loading}>
      <h1>Audio library</h1>
      <OpenFolderButton onClick={openFolder} loading={loading} />

      {!dir && <p>Open a folder to list its audio samples.</p>}
      {dir && <p className="library-directory">Folder: {dir}</p>}
      {loading && <p role="status">Opening folder and loading samples...</p>}
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}

      {dir && !loading && (
        <>
          <p>{files.length} audio files</p>
          <FileList files={files} onFavoriteChanged={updateFavorite} />
        </>
      )}
    </main>
  )
}
