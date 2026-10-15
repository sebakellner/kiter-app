import path from 'node:path'
import type { DiscoveredAudioFile } from '../../../src/shared/domain/source.ts'

export function makeDiscoveredAudioFile(
  root: string,
  relativePath = 'kick.wav',
  overrides: Partial<
    Pick<DiscoveredAudioFile, 'observedSizeBytes' | 'observedMtimeMs'>
  > = {},
): DiscoveredAudioFile {
  return {
    name: path.basename(relativePath),
    path: path.join(root, relativePath),
    relativePath,
    observedSizeBytes: 100,
    observedMtimeMs: 1000,
    ...overrides,
  }
}
