import type { Instrument } from '../domain/classification.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import { isInstrument } from './instruments.ts'
import type { z } from 'zod'
import {
  sampleInstrumentsRequestSchema,
  sampleInstrumentsSaveSchema,
} from '../features/classification/schemas.ts'

export type SampleInstrumentsRequest = z.infer<
  typeof sampleInstrumentsRequestSchema
>
export type SampleInstrumentsSnapshot = {
  sampleId: string
  token: string
  instruments: Instrument[]
}
export type SampleInstrumentsSaveRequest = z.infer<
  typeof sampleInstrumentsSaveSchema
>

export function requireSampleInstrumentsRequest(
  value: unknown,
): SampleInstrumentsRequest {
  const parsed = sampleInstrumentsRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Instruments request.')
  }
  return parsed.data
}

export function requireSampleInstrumentsSaveRequest(
  value: unknown,
): SampleInstrumentsSaveRequest {
  const parsed = sampleInstrumentsSaveSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Instruments save request.')
  }
  return parsed.data
}

export function isSampleInstrumentsSnapshot(
  value: unknown,
): value is SampleInstrumentsSnapshot {
  return (
    isRecord(value) &&
    isEntityId(value.sampleId) &&
    typeof value.token === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.token) &&
    Array.isArray(value.instruments) &&
    value.instruments.length <= 1000 &&
    value.instruments.every(isInstrument) &&
    new Set(value.instruments.map((instrument) => instrument.id)).size ===
      value.instruments.length
  )
}
