import {
  CLASSIFICATION_CHANNELS,
  requireClassificationPreparationRequest,
  requireClassificationApplyRequest,
} from '../../shared/ipc/classification'
import type { DbClient } from '../db'
import { handleResult } from './handler'
import { requirePage } from '../../shared/domain/pagination'
import { requireAliasUpdateRequest } from '../../shared/ipc/aliasUpdates'
import {
  requireSampleTypeRequest,
  requireSampleTypeSaveRequest,
} from '../../shared/ipc/sampleType'

export function registerClassificationIpc(database: DbClient): void {
  handleResult(
    CLASSIFICATION_CHANNELS.readSampleType,
    'classification.read-sample-type',
    'Unable to load saved Sample type. Retry to read the catalog again.',
    (request) => database.readSampleType(requireSampleTypeRequest(request)),
  )
  handleResult(
    CLASSIFICATION_CHANNELS.saveSampleType,
    'classification.save-sample-type',
    'Unable to save Sample type. Your draft was preserved; reload saved type before retrying.',
    (request) => database.saveSampleType(requireSampleTypeSaveRequest(request)),
  )
  handleResult(
    CLASSIFICATION_CHANNELS.applySample,
    'classification.applySample',
    'Unable to apply suggestions. Refresh to check the saved classifications.',
    (request) =>
      database.applySampleClassification(
        requireClassificationApplyRequest(request),
      ),
  )
  handleResult(
    CLASSIFICATION_CHANNELS.listAliasUpdates,
    'classification.listAliasUpdates',
    'Unable to check vocabulary updates.',
    (request) => database.listAliasUpdates(requirePage(request)),
  )
  handleResult(
    CLASSIFICATION_CHANNELS.incorporateAlias,
    'classification.incorporateAlias',
    'Unable to incorporate this alias.',
    (request) => database.incorporateAlias(requireAliasUpdateRequest(request)),
  )
  handleResult(
    CLASSIFICATION_CHANNELS.prepareSample,
    'classification.prepareSample',
    'Unable to prepare classification suggestions. Retry to read the catalog again.',
    (request) =>
      database.prepareSampleClassification(
        requireClassificationPreparationRequest(request),
      ),
  )
}
