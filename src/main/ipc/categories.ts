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
import {
  requireSampleCategoriesRequest,
  requireSampleCategoriesSaveRequest,
} from '../../shared/ipc/sampleCategories'

export function registerCategoriesIpc(database: DbClient): void {
  ipcMain.handle(CATEGORY_CHANNELS.readSample, (event, request: unknown) =>
    invokeResult(
      'categories.read-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to load saved categories. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.readSampleCategories(
          requireSampleCategoriesRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(CATEGORY_CHANNELS.saveSample, (event, request: unknown) =>
    invokeResult(
      'categories.save-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to save categories. Your draft was preserved; reload saved categories before retrying.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.saveSampleCategories(
          requireSampleCategoriesSaveRequest(request),
        )
      },
    ),
  )
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
