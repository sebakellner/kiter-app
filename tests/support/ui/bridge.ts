import { vi } from 'vitest'
import type { Api } from '../../../src/shared/ipc/index.ts'

export function createTestApi(): {
  genres: {
    list: ReturnType<typeof vi.fn<Api['genres']['list']>>
    readSample: ReturnType<typeof vi.fn<Api['genres']['readSample']>>
    saveSample: ReturnType<typeof vi.fn<Api['genres']['saveSample']>>
  }
  lifecycle: {
    onCloseRequested: ReturnType<
      typeof vi.fn<Api['lifecycle']['onCloseRequested']>
    >
  }
  classification: {
    readSampleType: ReturnType<
      typeof vi.fn<Api['classification']['readSampleType']>
    >
    saveSampleType: ReturnType<
      typeof vi.fn<Api['classification']['saveSampleType']>
    >
    applySample: ReturnType<typeof vi.fn<Api['classification']['applySample']>>
    listAliasUpdates: ReturnType<
      typeof vi.fn<Api['classification']['listAliasUpdates']>
    >
    incorporateAlias: ReturnType<
      typeof vi.fn<Api['classification']['incorporateAlias']>
    >
    prepareSample: ReturnType<
      typeof vi.fn<Api['classification']['prepareSample']>
    >
  }
  dialog: { openFolder: ReturnType<typeof vi.fn<Api['dialog']['openFolder']>> }
  instruments: {
    readSample: ReturnType<typeof vi.fn<Api['instruments']['readSample']>>
    saveSample: ReturnType<typeof vi.fn<Api['instruments']['saveSample']>>
    list: ReturnType<typeof vi.fn<Api['instruments']['list']>>
    create: ReturnType<typeof vi.fn<Api['instruments']['create']>>
    rename: ReturnType<typeof vi.fn<Api['instruments']['rename']>>
  }
  library: {
    list: ReturnType<typeof vi.fn<Api['library']['list']>>
    importFolder: ReturnType<typeof vi.fn<Api['library']['importFolder']>>
    setFavorite: ReturnType<typeof vi.fn<Api['library']['setFavorite']>>
    startDrag: ReturnType<typeof vi.fn<Api['library']['startDrag']>>
    onDragError: ReturnType<typeof vi.fn<Api['library']['onDragError']>>
  }
} {
  return {
    genres: {
      list: vi.fn<Api['genres']['list']>(),
      readSample: vi.fn<Api['genres']['readSample']>(),
      saveSample: vi.fn<Api['genres']['saveSample']>(),
    },
    lifecycle: {
      onCloseRequested: vi
        .fn<Api['lifecycle']['onCloseRequested']>()
        .mockReturnValue(() => {}),
    },
    classification: {
      readSampleType: vi.fn<Api['classification']['readSampleType']>(),
      saveSampleType: vi.fn<Api['classification']['saveSampleType']>(),
      applySample: vi.fn<Api['classification']['applySample']>(),
      listAliasUpdates: vi.fn<Api['classification']['listAliasUpdates']>(),
      incorporateAlias: vi.fn<Api['classification']['incorporateAlias']>(),
      prepareSample: vi.fn<Api['classification']['prepareSample']>(),
    },
    dialog: { openFolder: vi.fn<Api['dialog']['openFolder']>() },
    instruments: {
      readSample: vi.fn<Api['instruments']['readSample']>(),
      saveSample: vi.fn<Api['instruments']['saveSample']>(),
      list: vi.fn<Api['instruments']['list']>(),
      create: vi.fn<Api['instruments']['create']>(),
      rename: vi.fn<Api['instruments']['rename']>(),
    },
    library: {
      list: vi.fn<Api['library']['list']>(),
      importFolder: vi.fn<Api['library']['importFolder']>(),
      setFavorite: vi.fn<Api['library']['setFavorite']>(),
      startDrag: vi.fn<Api['library']['startDrag']>(),
      onDragError: vi.fn<Api['library']['onDragError']>(),
    },
  }
}
