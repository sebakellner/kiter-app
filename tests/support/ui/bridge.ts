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
  categories: {
    readSample: ReturnType<typeof vi.fn<Api['categories']['readSample']>>
    saveSample: ReturnType<typeof vi.fn<Api['categories']['saveSample']>>
    list: ReturnType<typeof vi.fn<Api['categories']['list']>>
    create: ReturnType<typeof vi.fn<Api['categories']['create']>>
    rename: ReturnType<typeof vi.fn<Api['categories']['rename']>>
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
      applySample: vi.fn<Api['classification']['applySample']>(),
      listAliasUpdates: vi.fn<Api['classification']['listAliasUpdates']>(),
      incorporateAlias: vi.fn<Api['classification']['incorporateAlias']>(),
      prepareSample: vi.fn<Api['classification']['prepareSample']>(),
    },
    dialog: { openFolder: vi.fn<Api['dialog']['openFolder']>() },
    categories: {
      readSample: vi.fn<Api['categories']['readSample']>(),
      saveSample: vi.fn<Api['categories']['saveSample']>(),
      list: vi.fn<Api['categories']['list']>(),
      create: vi.fn<Api['categories']['create']>(),
      rename: vi.fn<Api['categories']['rename']>(),
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
