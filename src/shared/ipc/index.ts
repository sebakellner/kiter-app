import type { DialogApi } from './dialog.ts'
import type { LibraryApi } from './library.ts'
import type { CategoriesApi } from './categories.ts'
import type { ClassificationApi } from './classification.ts'
import type { LifecycleApi } from './lifecycle.ts'

export interface Api {
  lifecycle: LifecycleApi
  dialog: DialogApi
  library: LibraryApi
  categories: CategoriesApi
  classification: ClassificationApi
}
export { DIALOG_CHANNELS } from './dialog.ts'
export { LIBRARY_CHANNELS } from './library.ts'
export { CATEGORY_CHANNELS } from './categories.ts'
export type {
  CategoriesApi,
  CategoryListRequest,
  CategoryCreateRequest,
  CategoryRenameRequest,
  CategoryPage,
} from './categories.ts'
export type { Category } from '../domain/classification.ts'
export type { AudioFile } from '../domain/source.ts'
export type {
  LibrarySample,
  AudioSample,
  FavoriteState,
  AudioDragError,
} from './library.ts'
export type { IpcResult, AppFailure, AppErrorCode } from './result.ts'
