import { FileList } from '@renderer/features/library/components/FileList'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { useSamplesViewState } from './useSamplesViewState'

export function Samples(): React.JSX.Element {
  const { dir, files, loading, error, updateFavorite, preview } =
    useLibrarySession()
  const { favoritesOnly, setFavoritesOnly } = useSamplesViewState()

  return (
    <section aria-labelledby="samples-title">
      <h1 id="samples-title">Samples</h1>
      <p>Browse the current folder. Library-wide browsing is coming later.</p>

      {!dir && <p>Open a folder to list its audio samples.</p>}
      {dir && <p data-testid="library-directory">Folder: {dir}</p>}
      {loading && <p role="status">Opening folder and loading samples...</p>}
      {error && (
        <p role="alert" className="sample-error" data-testid="library-error">
          {error}
        </p>
      )}

      {dir && (
        <>
          <p>{files.length} audio files</p>
          <FileList
            files={files}
            onFavoriteChanged={updateFavorite}
            preview={preview}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChanged={setFavoritesOnly}
          />
        </>
      )}
    </section>
  )
}
