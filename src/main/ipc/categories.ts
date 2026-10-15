import { ipcMain } from 'electron'
import {
  CATEGORY_CHANNELS,
  requireCategoryCreateRequest,
  requireCategoryListRequest,
  requireCategoryRenameRequest,
} from '../../shared/ipc/categories'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

export function registerCategoriesIpc(database: DbClient): void {
  ipcMain.handle(CATEGORY_CHANNELS.list, (event, request: unknown) =>
    invokeResult(
      'categories.list',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to list Categories. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listCategories(requireCategoryListRequest(request))
      },
    ),
  )
  ipcMain.handle(CATEGORY_CHANNELS.create, (event, request: unknown) =>
    invokeResult(
      'categories.create',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to create the Category. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.createCategory(requireCategoryCreateRequest(request))
      },
    ),
  )
  ipcMain.handle(CATEGORY_CHANNELS.rename, (event, request: unknown) =>
    invokeResult(
      'categories.rename',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to rename the Category. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.renameCategory(requireCategoryRenameRequest(request))
      },
    ),
  )
}
