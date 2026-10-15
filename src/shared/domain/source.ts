import { isRecord } from './validation.ts'

export interface AudioFile {
  name: string
  path: string
  relativePath: string
}

export interface DiscoveredAudioFile extends AudioFile {
  observedSizeBytes: number
  observedMtimeMs: number
}

export function isDiscoveredAudioFile(
  value: unknown,
): value is DiscoveredAudioFile {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.relativePath === 'string' &&
    typeof value.observedSizeBytes === 'number' &&
    Number.isSafeInteger(value.observedSizeBytes) &&
    value.observedSizeBytes >= 0 &&
    typeof value.observedMtimeMs === 'number' &&
    Number.isFinite(value.observedMtimeMs)
  )
}

export type SourceAvailability = 'available' | 'missing' | 'inaccessible'

export interface SampleSource {
  sampleId: string
  canonicalPath: string
  availability: SourceAvailability
  revision: number
  observedSizeBytes: number | null
  observedMtimeMs: number | null
  lastCheckedAt: string
  lastErrorCode: string | null
}

export interface SourceRoot {
  id: string
  canonicalPath: string
  registered: boolean
  lastScanAt: string | null
  lastScanOutcome: 'completed' | 'failed' | null
  lastScanErrorCode: string | null
}
