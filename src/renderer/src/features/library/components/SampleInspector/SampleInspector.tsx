import { Button } from '@renderer/components/ui/Button'
import { useSampleInspector } from './useSampleInspector'

export function SampleInspector({
  onClose,
}: {
  onClose: () => void
}): React.JSX.Element {
  const { sample } = useSampleInspector()
  return (
    <>
      <header className="app-shell-inspector-header">
        <h2 id="sample-inspector-title">Sample info</h2>
        <Button onClick={onClose}>Close inspector</Button>
      </header>
      <div className="app-shell-inspector-body">
        {sample ? (
          <dl>
            <dt>Name</dt>
            <dd>{sample.name}</dd>
            <dt>Relative path</dt>
            <dd>{sample.relativePath}</dd>
            <dt>Source file</dt>
            <dd>{sample.path}</dd>
            {'rootPath' in sample && (
              <>
                <dt>Source folder</dt>
                <dd>{sample.rootPath ?? 'No registered folder'}</dd>
              </>
            )}
            <dt>Favorite</dt>
            <dd>{sample.favorite ? 'Yes' : 'No'}</dd>
            <dt>Audio access</dt>
            <dd>
              {'unavailableReason' in sample && sample.unavailableReason
                ? sample.unavailableReason
                : 'Available for preview'}
            </dd>
          </dl>
        ) : (
          <p>Select a sample to see its information.</p>
        )}
      </div>
    </>
  )
}
