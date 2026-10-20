import { Button } from '@renderer/components/ui/Button'
import type { PreviewController } from '../../hooks/usePreview'
import './PreviewPlayer.css'

export function PreviewPlayer({
  preview: { player, selected, error, stop, setPlaying, setError },
}: {
  preview: PreviewController
}): React.JSX.Element {
  return (
    <section
      className="preview-player"
      aria-label="Global player"
      data-shell-region="player"
      tabIndex={-1}
    >
      <div className="preview-player-description">
        <p title={selected?.path}>
          {selected
            ? `Preview: ${selected.name}`
            : 'Choose a sample to preview'}
        </p>
        {error && (
          <p role="alert" className="sample-error" data-testid="preview-error">
            {error}
          </p>
        )}
      </div>
      <Button disabled={!selected} onClick={stop}>
        Stop
      </Button>
      <audio
        ref={player}
        controls
        preload="none"
        aria-label="Preview player"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false)
          setError(
            'Unable to play the sample. Audio is unsupported or the file is unavailable.',
          )
        }}
      />
    </section>
  )
}
