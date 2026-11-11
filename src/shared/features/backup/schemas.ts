import { z } from 'zod'

// Deleting and restoring name exactly one stored folder, so the request is an
// object with one field. This stays a shape check on purpose: whether the string
// is an absolute path inside Kiter's managed storage is decided where the
// filesystem is, by the worker that owns it, never from renderer text alone.
export const backupLocationSchema = z.object({
  location: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)),
})
