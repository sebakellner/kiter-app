import type { SampleRequest, SampleReply } from '../../protocol/samples.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import * as samples from '../../operations/samples/operations.ts'
import {
  listCatalogSamples,
  getCatalogSample,
} from '../../operations/samples/catalog.ts'
import {
  getReinclusionRoot,
  reincludeSource,
} from '../../operations/sources/reinclusion.ts'

export function executeSample(
  db: AppDatabase,
  request: SampleRequest,
): SampleReply {
  switch (request.action) {
    case 'list-catalog-samples':
      return {
        action: request.action,
        result: listCatalogSamples(db, request.input),
      }
    case 'get-catalog-sample':
      return {
        action: request.action,
        result: getCatalogSample(db, request.id),
      }
    case 'get-sample':
      return {
        action: request.action,
        result: samples.getSample(db, request.id),
      }
    case 'update-sample':
      return {
        action: request.action,
        result: samples.updateSample(db, request.input),
      }
    case 'review-sample-removal':
      return {
        action: request.action,
        result: samples.reviewSampleRemoval(db, request.id),
      }
    case 'list-sample-references':
      return {
        action: request.action,
        result: samples.listSampleReferences(db, request.input),
      }
    case 'remove-sample':
      return {
        action: request.action,
        result: samples.removeSample(db, request.input),
      }
    case 'list-excluded-sources':
      return {
        action: request.action,
        result: samples.listExcludedSources(db, request.input),
      }
    case 'get-reinclusion-root':
      return {
        action: request.action,
        result: getReinclusionRoot(db, request.input),
      }
    case 'reinclude-source':
      return {
        action: request.action,
        result: reincludeSource(db, request.input, request.file),
      }
  }
}
