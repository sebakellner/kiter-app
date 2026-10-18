export function Categories(): React.JSX.Element {
  return (
    <section aria-labelledby="categories-title">
      <h1 id="categories-title">Categories</h1>
      <p>This is a placeholder for browsing samples by category.</p>
      <p>Category browsing is not available yet.</p>
      <h2>Recognition vocabulary</h2>
      <AliasUpdates onIncorporated={() => {}} />
    </section>
  )
}
import { AliasUpdates } from '@renderer/features/classification/components/SampleSuggestions/AliasUpdates'
