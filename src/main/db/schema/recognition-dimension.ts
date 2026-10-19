import { customType } from 'drizzle-orm/sqlite-core'
import type { RecognitionDimension } from '../../../shared/domain/recognition.ts'

// Storage values predate the Instrument name. Keep them and vocabulary keys
// unchanged so existing assignments, alias edits and deletion memory survive.
export const recognitionDimension = customType<{
  data: RecognitionDimension
  driverData: string
}>({
  dataType: () => 'text',
  toDriver: (value) => (value === 'instrument' ? 'category' : value),
  fromDriver: (value) => {
    if (value === 'category') {
      return 'instrument'
    }
    if (value === 'genre' || value === 'sample-type') {
      return value
    }
    throw new Error('Invalid stored recognition dimension.')
  },
})
