import { ipcMain } from 'electron'
import {
  CLASSIFICATION_CHANNELS,
  requireClassificationPreparationRequest,
} from '../../shared/ipc/classification'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'
import { requirePage } from '../../shared/domain/pagination'
import { requireAliasUpdateRequest } from '../../shared/ipc/aliasUpdates'

export function registerClassificationIpc(database: DbClient): void {
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.listAliasUpdates,
    (event, request: unknown) =>
      invokeResult(
        'classification.listAliasUpdates',
        {
          code: 'STORAGE_FAILED',
          message: 'Unable to check vocabulary updates.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.listAliasUpdates(requirePage(request))
        },
      ),
  )
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.incorporateAlias,
    (event, request: unknown) =>
      invokeResult(
        'classification.incorporateAlias',
        {
          code: 'STORAGE_FAILED',
          message: 'Unable to incorporate this alias.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.incorporateAlias(requireAliasUpdateRequest(request))
        },
      ),
  )
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.prepareSample,
    (event, request: unknown) =>
      invokeResult(
        'classification.prepareSample',
        {
          code: 'STORAGE_FAILED',
          message:
            'Unable to prepare classification suggestions. Retry to read the catalog again.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.prepareSampleClassification(
            requireClassificationPreparationRequest(request),
          )
        },
      ),
  )
}
