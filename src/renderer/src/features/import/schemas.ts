import { z } from 'zod'
import { requirePresentationName } from '@shared/domain/validation'

// The commit guard only accepts a stored, normalized Pack name, so the dialog
// validates the same rule before it asks for a Pack.
export const packImportNameSchema = z
  .string()
  .max(480)
  .transform((value, context) => {
    try {
      return requirePresentationName(value)
    } catch {
      context.addIssue({
        code: 'custom',
        message:
          'Enter a Pack name of 1 to 120 characters without line breaks.',
      })
      return z.NEVER
    }
  })

export function readPackName(value: string): {
  name: string | null
  error: string | null
} {
  const result = packImportNameSchema.safeParse(value)
  if (result.success) {
    return { name: result.data, error: null }
  }
  return {
    name: null,
    error: result.error.issues[0]?.message ?? 'Enter a valid Pack name.',
  }
}
