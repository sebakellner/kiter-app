import type { DbClient } from '../../db'
import type {
  CatalogSample,
  CatalogAudioSample,
  LibraryListRequest,
  LibraryPage,
} from '../../../shared/ipc/library'
import { verifyCatalogSource } from './source-access'

export async function listLibraryCatalog(
  input: LibraryListRequest,
  database: Pick<DbClient, 'listCatalogSamples'>,
  audioUrl: (sample: CatalogSample) => string,
): Promise<LibraryPage> {
  const page = await database.listCatalogSamples(input)
  const items: CatalogAudioSample[] = []
  for (const sample of page.items) {
    const item: CatalogAudioSample = {
      ...sample,
      audioUrl: null,
      unavailableReason: null,
    }
    try {
      await verifyCatalogSource(sample)
      item.audioUrl = audioUrl(sample)
    } catch {
      item.unavailableReason =
        'Audio unavailable. Check the original file and folder access, then refresh.'
    }
    items.push(item)
  }
  return { ...page, items }
}
