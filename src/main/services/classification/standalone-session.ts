import { IpcError } from '../../../shared/ipc/result.ts'
import {
  requireStandaloneReviewAcceptAllRequest,
  requireStandaloneReviewDecisionsRequest,
  requireStandaloneReviewDiscardRequest,
  requireStandaloneReviewPageRequest,
  requireStandaloneReviewPrepareRequest,
} from '../../../shared/ipc/standaloneReview.ts'
import type {
  StandaloneReviewAcceptAllRequest,
  StandaloneReviewDecisionsRequest,
  StandaloneReviewDiscardRequest,
  StandaloneReviewPageRequest,
  StandaloneReviewPrepareRequest,
  StandaloneReviewPreparation,
} from '../../../shared/ipc/standaloneReview.ts'
import type {
  ClassificationAmbiguityRow,
  ClassificationReviewPage,
  ClassificationReviewRow,
  ClassificationReviewSummary,
} from '../../../shared/features/classification/batch-schemas.ts'
import {
  prepareStandaloneReview,
  type StandaloneReview,
  type StandaloneReviewDatabase,
} from './standalone-batch.ts'
import type { ClassificationBatchReview } from './batch-review.ts'

/** In-memory owner of prepared standalone reviews for this app session.
 *
 * Retains each prepared review so staged decisions survive navigation without
 * writing the catalog, and releases it on discard. Nothing here revalidates or
 * executes: durable confirmation and per-target transactions own that slice.
 * Reviews are session-only, so a restart drops them instead of recovering drafts
 * that no explicit confirmation backed.
 */
export interface StandaloneReviewSession {
  prepare: (
    request: StandaloneReviewPrepareRequest,
  ) => Promise<StandaloneReviewPreparation>
  listProposals: (
    request: StandaloneReviewPageRequest,
  ) => ClassificationReviewPage<ClassificationReviewRow>
  listAmbiguities: (
    request: StandaloneReviewPageRequest,
  ) => ClassificationReviewPage<ClassificationAmbiguityRow>
  stage: (
    request: StandaloneReviewDecisionsRequest,
  ) => ClassificationReviewSummary
  acceptAll: (
    request: StandaloneReviewAcceptAllRequest,
  ) => ClassificationReviewSummary
  discard: (request: StandaloneReviewDiscardRequest) => { reviewId: string }
}

type Retained = { review: ClassificationBatchReview; token: string }

function unknownReview(): never {
  throw new IpcError(
    'NOT_FOUND',
    'The classification review is no longer available. Prepare it again.',
  )
}

export function createStandaloneReviewSession(
  database: StandaloneReviewDatabase,
): StandaloneReviewSession {
  const retained = new Map<string, Retained>()

  function require(reviewId: string): Retained {
    return retained.get(reviewId) ?? unknownReview()
  }

  return {
    async prepare(value) {
      const request = requireStandaloneReviewPrepareRequest(value)
      const prepared: StandaloneReview = await prepareStandaloneReview(
        database,
        request.subjects.map((subject) => ({ ...subject })),
      )
      const summary = prepared.review.getSummary()
      // Replacing an id can never happen: the core mints a fresh UUID per review.
      retained.set(summary.reviewId, {
        review: prepared.review,
        token: prepared.token,
      })
      return {
        ...summary,
        // The reviewed scope, so the renderer can show Accept all coverage.
        subjectScope: request.subjects.map((subject) => ({ ...subject })),
      }
    },

    listProposals(value) {
      const request = requireStandaloneReviewPageRequest(value)
      return require(request.reviewId).review.listProposals(request)
    },

    listAmbiguities(value) {
      const request = requireStandaloneReviewPageRequest(value)
      return require(request.reviewId).review.listAmbiguities(request)
    },

    stage(value) {
      const request = requireStandaloneReviewDecisionsRequest(value)
      return require(request.reviewId).review.stage(request)
    },

    acceptAll(value) {
      const request = requireStandaloneReviewAcceptAllRequest(value)
      return require(request.reviewId).review.acceptAll(request)
    },

    discard(value) {
      const request = requireStandaloneReviewDiscardRequest(value)
      require(request.reviewId).review.discard()
      retained.delete(request.reviewId)
      return { reviewId: request.reviewId }
    },
  }
}
