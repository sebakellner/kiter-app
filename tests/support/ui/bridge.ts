import { vi } from 'vitest'
import type { Api } from '../../../src/shared/ipc/index.ts'

export function createTestApi(): {
  standaloneReview: {
    prepare: ReturnType<typeof vi.fn<Api['standaloneReview']['prepare']>>
    listProposals: ReturnType<
      typeof vi.fn<Api['standaloneReview']['listProposals']>
    >
    listAmbiguities: ReturnType<
      typeof vi.fn<Api['standaloneReview']['listAmbiguities']>
    >
    stage: ReturnType<typeof vi.fn<Api['standaloneReview']['stage']>>
    acceptAll: ReturnType<typeof vi.fn<Api['standaloneReview']['acceptAll']>>
    discard: ReturnType<typeof vi.fn<Api['standaloneReview']['discard']>>
    execute: ReturnType<typeof vi.fn<Api['standaloneReview']['execute']>>
  }
  collections: {
    update: ReturnType<typeof vi.fn<Api['collections']['update']>>
    reviewRemoval: ReturnType<typeof vi.fn<Api['collections']['reviewRemoval']>>
    remove: ReturnType<typeof vi.fn<Api['collections']['remove']>>
    create: ReturnType<typeof vi.fn<Api['collections']['create']>>
    list: ReturnType<typeof vi.fn<Api['collections']['list']>>
    get: ReturnType<typeof vi.fn<Api['collections']['get']>>
    destinations: ReturnType<typeof vi.fn<Api['collections']['destinations']>>
    setMembership: ReturnType<typeof vi.fn<Api['collections']['setMembership']>>
    moveSample: ReturnType<typeof vi.fn<Api['collections']['moveSample']>>
    placeSample: ReturnType<typeof vi.fn<Api['collections']['placeSample']>>
  }
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
  dialog: {
    openFolder: ReturnType<typeof vi.fn<Api['dialog']['openFolder']>>
    openFolders: ReturnType<typeof vi.fn<Api['dialog']['openFolders']>>
  }
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
  packs: {
    list: ReturnType<typeof vi.fn<Api['packs']['list']>>
    detail: ReturnType<typeof vi.fn<Api['packs']['detail']>>
    samples: ReturnType<typeof vi.fn<Api['packs']['samples']>>
    prepareImport: ReturnType<typeof vi.fn<Api['packs']['prepareImport']>>
    listImportCandidates: ReturnType<
      typeof vi.fn<Api['packs']['listImportCandidates']>
    >
    importPack: ReturnType<typeof vi.fn<Api['packs']['importPack']>>
  }
} {
  return {
    standaloneReview: {
      prepare: vi.fn<Api['standaloneReview']['prepare']>(),
      listProposals: vi.fn<Api['standaloneReview']['listProposals']>(),
      listAmbiguities: vi.fn<Api['standaloneReview']['listAmbiguities']>(),
      stage: vi.fn<Api['standaloneReview']['stage']>(),
      acceptAll: vi.fn<Api['standaloneReview']['acceptAll']>(),
      discard: vi.fn<Api['standaloneReview']['discard']>(),
      execute: vi.fn<Api['standaloneReview']['execute']>(),
    },
    collections: {
      update: vi.fn<Api['collections']['update']>(),
      reviewRemoval: vi.fn<Api['collections']['reviewRemoval']>(),
      remove: vi.fn<Api['collections']['remove']>(),
      create: vi.fn<Api['collections']['create']>(),
      list: vi.fn<Api['collections']['list']>(),
      get: vi.fn<Api['collections']['get']>(),
      destinations: vi.fn<Api['collections']['destinations']>(),
      setMembership: vi.fn<Api['collections']['setMembership']>(),
      moveSample: vi.fn<Api['collections']['moveSample']>(),
      placeSample: vi.fn<Api['collections']['placeSample']>(),
    },
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
    dialog: {
      openFolder: vi.fn<Api['dialog']['openFolder']>(),
      openFolders: vi.fn<Api['dialog']['openFolders']>(),
    },
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
    packs: {
      list: vi.fn<Api['packs']['list']>(),
      detail: vi.fn<Api['packs']['detail']>(),
      samples: vi.fn<Api['packs']['samples']>(),
      prepareImport: vi.fn<Api['packs']['prepareImport']>(),
      listImportCandidates: vi.fn<Api['packs']['listImportCandidates']>(),
      importPack: vi.fn<Api['packs']['importPack']>(),
    },
  }
}
