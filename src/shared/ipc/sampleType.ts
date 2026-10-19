import type { z } from 'zod'
import { DomainValidationError } from '../domain/validation.ts'
import {
  sampleTypeRequestSchema,
  sampleTypeSaveSchema,
  sampleTypeSnapshotSchema,
} from '../features/classification/schemas.ts'
import type { IpcResult } from './result.ts'

export type SampleTypeRequest = z.infer<typeof sampleTypeRequestSchema>
export type SampleTypeSaveRequest = z.infer<typeof sampleTypeSaveSchema>
export type SampleTypeSnapshot = z.infer<typeof sampleTypeSnapshotSchema>

export interface SampleTypeApi {
  readSampleType: (
    request: SampleTypeRequest,
  ) => Promise<IpcResult<SampleTypeSnapshot>>
  saveSampleType: (
    request: SampleTypeSaveRequest,
  ) => Promise<IpcResult<SampleTypeSnapshot>>
}

export function requireSampleTypeRequest(value: unknown): SampleTypeRequest {
  const result = sampleTypeRequestSchema.safeParse(value)
  if (!result.success) {
    throw new DomainValidationError('Invalid Sample type request.')
  }
  return result.data
}

export function requireSampleTypeSaveRequest(
  value: unknown,
): SampleTypeSaveRequest {
  const result = sampleTypeSaveSchema.safeParse(value)
  if (!result.success) {
    throw new DomainValidationError('Invalid Sample type save request.')
  }
  return result.data
}

export function isSampleTypeSnapshot(
  value: unknown,
): value is SampleTypeSnapshot {
  // Preload forbids dynamic code generation; use Zod's interpreted validator.
  return sampleTypeSnapshotSchema.safeParse(value, { jitless: true }).success
}
