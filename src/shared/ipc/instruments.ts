import {
  requireClassificationName,
  requireClassificationPage,
} from '../domain/classification.ts'
import type {
  Instrument,
  ClassificationPage,
  ClassificationPageRequest,
} from '../domain/classification.ts'
import { requirePage } from '../domain/pagination.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
  requireEntityId,
} from '../domain/validation.ts'
import type { IpcResult } from './result.ts'
import type {
  SampleInstrumentsRequest,
  SampleInstrumentsSaveRequest,
  SampleInstrumentsSnapshot,
} from './sampleInstruments.ts'

export const INSTRUMENT_CHANNELS = {
  list: 'instruments:list',
  create: 'instruments:create',
  rename: 'instruments:rename',
  readSample: 'instruments:read-sample',
  saveSample: 'instruments:save-sample',
} as const

export type InstrumentListRequest = ClassificationPageRequest
export type InstrumentPage = ClassificationPage<Instrument>

export interface InstrumentCreateRequest {
  name: string
}

export interface InstrumentRenameRequest extends InstrumentCreateRequest {
  id: string
}

export interface InstrumentsApi {
  readSample: (
    request: SampleInstrumentsRequest,
  ) => Promise<IpcResult<SampleInstrumentsSnapshot>>
  saveSample: (
    request: SampleInstrumentsSaveRequest,
  ) => Promise<IpcResult<SampleInstrumentsSnapshot>>
  list: (request?: InstrumentListRequest) => Promise<IpcResult<InstrumentPage>>
  create: (request: InstrumentCreateRequest) => Promise<IpcResult<Instrument>>
  rename: (request: InstrumentRenameRequest) => Promise<IpcResult<Instrument>>
}

export function requireInstrumentListRequest(
  value: unknown,
): InstrumentListRequest {
  return requireClassificationPage(value)
}

export function requireInstrumentCreateRequest(
  value: unknown,
): InstrumentCreateRequest {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Instrument request.')
  }
  return { name: requireClassificationName(value.name) }
}

export function requireInstrumentRenameRequest(
  value: unknown,
): InstrumentRenameRequest {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Instrument request.')
  }
  return {
    id: requireEntityId(value.id),
    name: requireClassificationName(value.name),
  }
}

export function isInstrument(value: unknown): value is Instrument {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  try {
    return value.name === requireClassificationName(value.name)
  } catch {
    return false
  }
}

export function isInstrumentPage(value: unknown): value is InstrumentPage {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requirePage(value)
    return (
      value.limit === limit &&
      value.offset === offset &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.every(isInstrument) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset)
    )
  } catch {
    return false
  }
}
