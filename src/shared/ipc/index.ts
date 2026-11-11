import type { DialogApi } from './dialog.ts'
import type { LibraryApi } from './library.ts'
import type { InstrumentsApi } from './instruments.ts'
import type { ClassificationApi } from './classification.ts'
import type { GenresApi } from './genres.ts'
import type { LifecycleApi } from './lifecycle.ts'
import type { CollectionsApi } from './collections.ts'
import type { StandaloneReviewApi } from './standaloneReview.ts'
import type { PacksApi } from './packs.ts'
import type { BackupApi } from './backup.ts'
import type { SearchApi } from './search.ts'

export interface Api {
  packs: PacksApi
  standaloneReview: StandaloneReviewApi
  collections: CollectionsApi
  genres: GenresApi
  lifecycle: LifecycleApi
  dialog: DialogApi
  library: LibraryApi
  instruments: InstrumentsApi
  classification: ClassificationApi
  search: SearchApi
  backup: BackupApi
}
export { DIALOG_CHANNELS } from './dialog.ts'
export { BACKUP_CHANNELS } from './backup.ts'
export type {
  BackupApi,
  BackupDeleteResult,
  BackupLocationRequest,
} from './backup.ts'
export { LIBRARY_CHANNELS } from './library.ts'
export {
  SEARCH_CHANNELS,
  SUGGESTION_KINDS,
  SUGGESTION_LIMIT,
} from './search.ts'
export type {
  SearchApi,
  SearchSuggestRequest,
  SearchSuggestResponse,
  SearchSuggestion,
  SearchSuggestionGroup,
  SuggestionKind,
} from './search.ts'
export { INSTRUMENT_CHANNELS } from './instruments.ts'
export type {
  InstrumentsApi,
  InstrumentListRequest,
  InstrumentCreateRequest,
  InstrumentRenameRequest,
  InstrumentPage,
} from './instruments.ts'
export type { Instrument } from '../domain/classification.ts'
export type { AudioFile } from '../domain/source.ts'
export type {
  LibrarySample,
  AudioSample,
  FavoriteState,
  AudioDragError,
} from './library.ts'
export type { IpcResult, AppFailure, AppErrorCode } from './result.ts'
