import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/Button'
import { OpenFolderButton } from '@renderer/features/library/components/OpenFolderButton'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { ImportDialog } from '@renderer/features/import/components/ImportDialog/ImportDialog'
import type { ImportDialogOutcome } from '@renderer/features/import/hooks/useImportDialog'

export function AppHeader(): React.JSX.Element {
  const navigate = useNavigate()
  const { importFolders } = useLibrarySession()
  // Import is a dialog workflow, so its state stays with the control that opens it.
  const [importing, setImporting] = useState(false)

  function closeImport(outcome: ImportDialogOutcome): void {
    setImporting(false)
    if (outcome.createdPacks > 0) {
      void navigate('/packs')
    } else if (outcome.importedFolders > 0) {
      void navigate('/samples')
    }
  }

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
      <OpenFolderButton onClick={() => setImporting(true)} />
      {importing && (
        <ImportDialog importFolders={importFolders} onClose={closeImport} />
      )}
    </>
  )
}
