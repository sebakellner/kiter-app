import { vi } from 'vitest'
import type { Api } from '../../../src/shared/ipc/index.ts'

export function createTestApi(): {
  dialog: { openFolder: ReturnType<typeof vi.fn<Api['dialog']['openFolder']>> }
  categories: {
    list: ReturnType<typeof vi.fn<Api['categories']['list']>>
    create: ReturnType<typeof vi.fn<Api['categories']['create']>>
    rename: ReturnType<typeof vi.fn<Api['categories']['rename']>>
  }
  library: {
    importFolder: ReturnType<typeof vi.fn<Api['library']['importFolder']>>
    setFavorite: ReturnType<typeof vi.fn<Api['library']['setFavorite']>>
    startDrag: ReturnType<typeof vi.fn<Api['library']['startDrag']>>
    onDragError: ReturnType<typeof vi.fn<Api['library']['onDragError']>>
  }
} {
  return {
    dialog: { openFolder: vi.fn<Api['dialog']['openFolder']>() },
    categories: {
      list: vi.fn<Api['categories']['list']>(),
      create: vi.fn<Api['categories']['create']>(),
      rename: vi.fn<Api['categories']['rename']>(),
    },
    library: {
      importFolder: vi.fn<Api['library']['importFolder']>(),
      setFavorite: vi.fn<Api['library']['setFavorite']>(),
      startDrag: vi.fn<Api['library']['startDrag']>(),
      onDragError: vi.fn<Api['library']['onDragError']>(),
    },
  }
}
