import type {
  ClassificationReply,
  ClassificationRequest,
} from '../../protocol/classification.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import * as classification from '../../operations/classification/operations.ts'
import {
  readSampleInstruments,
  saveSampleInstruments,
} from '../../operations/classification/sample-instruments.ts'
import {
  applyClassificationRejections,
  readClassificationRejections,
} from '../../operations/classification/rejections.ts'
import { readStandaloneClassificationContext } from '../../operations/classification/standalone-context.ts'

export function executeClassification(
  db: AppDatabase,
  request: ClassificationRequest,
): ClassificationReply {
  switch (request.action) {
    case 'read-sample-instruments':
      return {
        action: request.action,
        result: readSampleInstruments(db, request.input),
      }
    case 'save-sample-instruments':
      return {
        action: request.action,
        result: saveSampleInstruments(db, request.input),
      }
    case 'create-author':
      return {
        action: request.action,
        result: classification.createAuthor(db, request.input),
      }
    case 'create-instrument':
      return {
        action: request.action,
        result: classification.createInstrument(db, request.input),
      }
    case 'rename-author':
      return {
        action: request.action,
        result: classification.renameAuthor(db, request.input),
      }
    case 'rename-instrument':
      return {
        action: request.action,
        result: classification.renameInstrument(db, request.input),
      }
    case 'get-author':
      return {
        action: request.action,
        result: classification.getAuthor(db, request.id),
      }
    case 'get-instrument':
      return {
        action: request.action,
        result: classification.getInstrument(db, request.id),
      }
    case 'list-authors':
      return {
        action: request.action,
        result: classification.listAuthors(db, request.input),
      }
    case 'list-instruments':
      return {
        action: request.action,
        result: classification.listInstruments(db, request.input),
      }
    case 'set-author-assignment':
      return {
        action: request.action,
        result: classification.setAuthorAssignment(db, request.input),
      }
    case 'set-instrument-assignment':
      return {
        action: request.action,
        result: classification.setInstrumentAssignment(db, request.input),
      }
    case 'list-target-authors':
      return {
        action: request.action,
        result: classification.listTargetAuthors(
          db,
          request.target,
          request.input,
        ),
      }
    case 'list-target-instruments':
      return {
        action: request.action,
        result: classification.listTargetInstruments(
          db,
          request.target,
          request.input,
        ),
      }
    case 'list-author-uses':
      return {
        action: request.action,
        result: classification.listAuthorUses(db, request.input),
      }
    case 'list-instrument-uses':
      return {
        action: request.action,
        result: classification.listInstrumentUses(db, request.input),
      }
    case 'review-author-removal':
      return {
        action: request.action,
        result: classification.reviewAuthorRemoval(db, request.id),
      }
    case 'review-instrument-removal':
      return {
        action: request.action,
        result: classification.reviewInstrumentRemoval(db, request.id),
      }
    case 'remove-author':
      return {
        action: request.action,
        result: classification.removeAuthor(db, request.input),
      }
    case 'remove-instrument':
      return {
        action: request.action,
        result: classification.removeInstrument(db, request.input),
      }
    case 'read-classification-rejections':
      return {
        action: request.action,
        result: readClassificationRejections(db, request.input),
      }
    case 'apply-classification-rejections':
      return {
        action: request.action,
        result: applyClassificationRejections(db, request.input),
      }
    case 'read-standalone-classification-context':
      return {
        action: request.action,
        result: readStandaloneClassificationContext(db, request.input),
      }
  }
}
