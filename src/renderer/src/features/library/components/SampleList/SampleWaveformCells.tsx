import { useState } from 'react'
import { TableCell } from '@renderer/components/ui/Table'
import { Waveform } from '../Waveform'
import type { ListSample } from './useSampleList'
import type { SampleAudioDragProps } from '../../hooks/useSampleAudioDrag'

type Props = {
  sample: Pick<ListSample, 'audioUrl' | 'name'>
  audioDragProps: SampleAudioDragProps
}

// The row keys these cells by audio URL so a source change clears measured time.
export function SampleWaveformCells({
  sample,
  audioDragProps,
}: Props): React.JSX.Element {
  const [seconds, setSeconds] = useState<number | null>(null)

  return (
    <>
      <TableCell role="gridcell" className="sample-row-waveform">
        {sample.audioUrl ? (
          <div className="sample-waveform-drag" {...audioDragProps}>
            <Waveform
              audioUrl={sample.audioUrl}
              name={sample.name}
              compact
              onDurationLoaded={setSeconds}
            />
          </div>
        ) : (
          <span className="sample-row-unavailable">Preview unavailable</span>
        )}
      </TableCell>
      <TableCell role="gridcell" className="sample-row-time">
        {seconds != null ? (
          <span data-testid="sample-duration">{seconds.toFixed(2)} s</span>
        ) : (
          <span aria-label="Duration unavailable">—</span>
        )}
      </TableCell>
    </>
  )
}
