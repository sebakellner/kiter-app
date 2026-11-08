import {
  INSTRUMENT_CHANNELS,
  requireInstrumentCreateRequest,
  requireInstrumentListRequest,
  requireInstrumentRenameRequest,
} from '../../shared/ipc/instruments'
import type { DbClient } from '../db'
import { handleResult } from './handler'
import {
  requireSampleInstrumentsRequest,
  requireSampleInstrumentsSaveRequest,
} from '../../shared/ipc/sampleInstruments'

export function registerInstrumentsIpc(database: DbClient): void {
  handleResult(
    INSTRUMENT_CHANNELS.readSample,
    'instruments.read-sample',
    'Unable to load saved instruments. Retry to check database storage.',
    (request) =>
      database.readSampleInstruments(requireSampleInstrumentsRequest(request)),
  )
  handleResult(
    INSTRUMENT_CHANNELS.saveSample,
    'instruments.save-sample',
    'Unable to save instruments. Your draft was preserved; reload saved instruments before retrying.',
    (request) =>
      database.saveSampleInstruments(
        requireSampleInstrumentsSaveRequest(request),
      ),
  )
  handleResult(
    INSTRUMENT_CHANNELS.list,
    'instruments.list',
    'Unable to list Instruments. Check database storage.',
    (request) =>
      database.listInstruments(requireInstrumentListRequest(request)),
  )
  handleResult(
    INSTRUMENT_CHANNELS.create,
    'instruments.create',
    'Unable to create the Instrument. Check database storage.',
    (request) =>
      database.createInstrument(requireInstrumentCreateRequest(request)),
  )
  handleResult(
    INSTRUMENT_CHANNELS.rename,
    'instruments.rename',
    'Unable to rename the Instrument. Check database storage.',
    (request) =>
      database.renameInstrument(requireInstrumentRenameRequest(request)),
  )
}
