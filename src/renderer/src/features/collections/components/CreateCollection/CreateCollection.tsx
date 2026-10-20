import type { Collection } from '@shared/domain/collection'
import { CollectionForm } from '../CollectionForm/CollectionForm'

export function CreateCollection({
  onClose,
  onCreated,
  completionLabel,
}: {
  onClose: () => void
  onCreated: (collection: Collection) => void
  completionLabel?: string
}): React.JSX.Element {
  return (
    <CollectionForm
      onClose={onClose}
      onSaved={onCreated}
      completionLabel={completionLabel}
    />
  )
}
