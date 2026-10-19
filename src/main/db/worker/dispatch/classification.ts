import type {
  ClassificationReply,
  ClassificationRequest,
} from '../../protocol/classification.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import * as classification from '../../operations/classification/operations.ts'
import {
  readSampleCategories,
  saveSampleCategories,
} from '../../operations/classification/sample-categories.ts'

export function executeClassification(
  db: AppDatabase,
  request: ClassificationRequest,
): ClassificationReply {
  switch (request.action) {
    case 'read-sample-categories':
      return {
        action: request.action,
        result: readSampleCategories(db, request.input),
      }
    case 'save-sample-categories':
      return {
        action: request.action,
        result: saveSampleCategories(db, request.input),
      }
    case 'create-author':
      return {
        action: request.action,
        result: classification.createAuthor(db, request.input),
      }
    case 'create-category':
      return {
        action: request.action,
        result: classification.createCategory(db, request.input),
      }
    case 'rename-author':
      return {
        action: request.action,
        result: classification.renameAuthor(db, request.input),
      }
    case 'rename-category':
      return {
        action: request.action,
        result: classification.renameCategory(db, request.input),
      }
    case 'get-author':
      return {
        action: request.action,
        result: classification.getAuthor(db, request.id),
      }
    case 'get-category':
      return {
        action: request.action,
        result: classification.getCategory(db, request.id),
      }
    case 'list-authors':
      return {
        action: request.action,
        result: classification.listAuthors(db, request.input),
      }
    case 'list-categories':
      return {
        action: request.action,
        result: classification.listCategories(db, request.input),
      }
    case 'set-author-assignment':
      return {
        action: request.action,
        result: classification.setAuthorAssignment(db, request.input),
      }
    case 'set-category-assignment':
      return {
        action: request.action,
        result: classification.setCategoryAssignment(db, request.input),
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
    case 'list-target-categories':
      return {
        action: request.action,
        result: classification.listTargetCategories(
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
    case 'list-category-uses':
      return {
        action: request.action,
        result: classification.listCategoryUses(db, request.input),
      }
    case 'review-author-removal':
      return {
        action: request.action,
        result: classification.reviewAuthorRemoval(db, request.id),
      }
    case 'review-category-removal':
      return {
        action: request.action,
        result: classification.reviewCategoryRemoval(db, request.id),
      }
    case 'remove-author':
      return {
        action: request.action,
        result: classification.removeAuthor(db, request.input),
      }
    case 'remove-category':
      return {
        action: request.action,
        result: classification.removeCategory(db, request.input),
      }
  }
}
