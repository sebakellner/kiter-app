import { z } from 'zod'
import { collectionCreateSchema } from '@shared/features/collections/schemas'

export const collectionFormSchema = collectionCreateSchema.extend({
  description: collectionCreateSchema.shape.description.unwrap().unwrap(),
})

export type CollectionFormValues = z.infer<typeof collectionFormSchema>
