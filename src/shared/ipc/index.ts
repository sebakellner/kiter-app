import type { DialogApi } from './dialog.ts'
import type { LibraryApi } from './library.ts'
import type { InstrumentsApi } from './instruments.ts'
import type { ClassificationApi } from './classification.ts'
import type { GenresApi } from './genres.ts'
import type { LifecycleApi } from './lifecycle.ts'
import type { CollectionsApi } from './collections.ts'
import type { StandaloneReviewApi } from './standaloneReview.ts'

export interface Api {
  standaloneReview: StandaloneReviewApi
  collections: CollectionsApi
  genres: GenresApi
  lifecycle: LifecycleApi
  dialog: DialogApi
  library: LibraryApi
  instruments: InstrumentsApi
  classification: ClassificationApi
}
export { DIALOG_CHANNELS } from './dialog.ts'
export { LIBRARY_CHANNELS } from './library.ts'
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
