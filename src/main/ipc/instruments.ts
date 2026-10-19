import { ipcMain } from 'electron'
import {
  INSTRUMENT_CHANNELS,
  requireInstrumentCreateRequest,
  requireInstrumentListRequest,
  requireInstrumentRenameRequest,
} from '../../shared/ipc/instruments'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'
import {
  requireSampleInstrumentsRequest,
  requireSampleInstrumentsSaveRequest,
} from '../../shared/ipc/sampleInstruments'

export function registerInstrumentsIpc(database: DbClient): void {
  ipcMain.handle(INSTRUMENT_CHANNELS.readSample, (event, request: unknown) =>
    invokeResult(
      'instruments.read-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to load saved instruments. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.readSampleInstruments(
          requireSampleInstrumentsRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(INSTRUMENT_CHANNELS.saveSample, (event, request: unknown) =>
    invokeResult(
      'instruments.save-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to save instruments. Your draft was preserved; reload saved instruments before retrying.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.saveSampleInstruments(
          requireSampleInstrumentsSaveRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(INSTRUMENT_CHANNELS.list, (event, request: unknown) =>
    invokeResult(
      'instruments.list',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to list Instruments. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listInstruments(requireInstrumentListRequest(request))
      },
    ),
  )
  ipcMain.handle(INSTRUMENT_CHANNELS.create, (event, request: unknown) =>
    invokeResult(
      'instruments.create',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to create the Instrument. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.createInstrument(
          requireInstrumentCreateRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(INSTRUMENT_CHANNELS.rename, (event, request: unknown) =>
    invokeResult(
      'instruments.rename',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to rename the Instrument. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.renameInstrument(
          requireInstrumentRenameRequest(request),
        )
      },
    ),
  )
}
