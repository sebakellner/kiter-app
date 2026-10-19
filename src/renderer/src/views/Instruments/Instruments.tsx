export function Instruments(): React.JSX.Element {
  return (
    <section aria-labelledby="instruments-title">
      <h1 id="instruments-title">Instruments</h1>
      <p>This is a placeholder for browsing samples by instrument.</p>
      <p>Instrument browsing is not available yet.</p>
      <h2>Recognition vocabulary</h2>
      <AliasUpdates onIncorporated={() => {}} />
    </section>
  )
}
import { AliasUpdates } from '@renderer/features/classification/components/SampleSuggestions/AliasUpdates'
