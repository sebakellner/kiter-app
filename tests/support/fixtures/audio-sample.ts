import type { AudioSample } from '../../../src/shared/ipc/library.ts'

export function makeAudioSample(
  overrides: Partial<AudioSample> = {},
): AudioSample {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'kick.wav',
    path: '/fixtures/kick.wav',
    relativePath: 'kick.wav',
    favorite: false,
    audioUrl: 'sample://audio/00000000-0000-4000-8000-000000000002',
    ...overrides,
  }
}
