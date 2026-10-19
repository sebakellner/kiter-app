import { ipcMain } from 'electron'
import {
  CLASSIFICATION_CHANNELS,
  requireClassificationPreparationRequest,
  requireClassificationApplyRequest,
} from '../../shared/ipc/classification'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'
import { requirePage } from '../../shared/domain/pagination'
import { requireAliasUpdateRequest } from '../../shared/ipc/aliasUpdates'
import {
  requireSampleTypeRequest,
  requireSampleTypeSaveRequest,
} from '../../shared/ipc/sampleType'

export function registerClassificationIpc(database: DbClient): void {
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.readSampleType,
    (event, request: unknown) =>
      invokeResult(
        'classification.read-sample-type',
        {
          code: 'STORAGE_FAILED',
          message:
            'Unable to load saved Sample type. Retry to read the catalog again.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.readSampleType(requireSampleTypeRequest(request))
        },
      ),
  )
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.saveSampleType,
    (event, request: unknown) =>
      invokeResult(
        'classification.save-sample-type',
        {
          code: 'STORAGE_FAILED',
          message:
            'Unable to save Sample type. Your draft was preserved; reload saved type before retrying.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.saveSampleType(requireSampleTypeSaveRequest(request))
        },
      ),
  )
  ipcMain.handle(
    CLASSIFICATION_CHANNELS.applySample,
    (event, request: unknown) =>
      invokeResult(
        'classification.applySample',
        {
          code: 'STORAGE_FAILED',
          message:
            'Unable to apply suggestions. Refresh to check the saved classifications.',
        },
        () => {
          requireMainFrameWindow(event)
          return database.applySampleClassification(
            requireClassificationApplyRequest(request),
          )
        },
      ),
  )
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
