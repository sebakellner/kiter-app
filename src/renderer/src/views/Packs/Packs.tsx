import { PackList } from '@renderer/features/packs/components/PackList'

export function Packs(): React.JSX.Element {
  return (
    <section aria-labelledby="packs-title">
      <h1 id="packs-title" tabIndex={-1}>
        Packs
      </h1>
      <PackList />
    </section>
  )
}
