import { z } from 'zod'
import {
  collectionCreateSchema,
  collectionGetSchema,
} from '@shared/features/collections/schemas'

export const collectionFormSchema = collectionCreateSchema.extend({
  description: collectionCreateSchema.shape.description.unwrap().unwrap(),
})

export type CollectionFormValues = z.infer<typeof collectionFormSchema>

export const collectionPickerSchema = z.object({
  collectionIds: z
    .array(collectionGetSchema.shape.id)
    .min(1, 'Select at least one Collection.')
    .max(100, 'Select at most 100 Collections.')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Select each Collection only once.',
    ),
})

export type CollectionPickerValues = z.infer<typeof collectionPickerSchema>
