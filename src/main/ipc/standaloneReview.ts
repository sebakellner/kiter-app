import {
  STANDALONE_REVIEW_CHANNELS,
  requireStandaloneReviewAcceptAllRequest,
  requireStandaloneReviewDecisionsRequest,
  requireStandaloneReviewDiscardRequest,
  requireStandaloneReviewExecutionRequest,
  requireStandaloneReviewPageRequest,
  requireStandaloneReviewPrepareRequest,
} from '../../shared/ipc/standaloneReview'
import type { DbClient } from '../db'
import {
  createStandaloneReviewSession,
  type StandaloneReviewSession,
} from '../services/classification'
import { handleResult } from './handler'

const PREPARE_FAILURE =
  'Unable to prepare the classification review. Retry to read the catalog again.'

const READ_FAILURE =
  'Unable to load the classification review. Prepare it again.'

const DECIDE_FAILURE =
  'Unable to update the classification review. Prepare it again before deciding.'

const DISCARD_FAILURE =
  'Unable to discard the classification review. Prepare it again.'

const EXECUTE_FAILURE =
  'Unable to save the reviewed classifications. Read the current catalog data before trying again.'

/** Standalone catalog review: preparation, staging and confirmed execution.
 *
 * Execution is the only write path here. It commits one target per transaction
 * inside the worker and answers per-target outcomes, so a partial batch is never
 * reported as full success. The session is created once per registered app so a
 * review survives navigation within this session.
 */
export function registerStandaloneReviewIpc(database: DbClient): void {
  const session: StandaloneReviewSession = createStandaloneReviewSession({
    readStandaloneClassificationContext: async (input) =>
      database.readStandaloneClassificationContext(input),
    readClassificationRejections: async (input) =>
      database.readClassificationRejections(input),
    executeStandaloneClassificationTarget: async (input) =>
      database.executeStandaloneClassificationTarget(input),
  })

  handleResult(
    STANDALONE_REVIEW_CHANNELS.prepare,
    'classification.prepareStandaloneReview',
    PREPARE_FAILURE,
    (request) =>
      session.prepare(requireStandaloneReviewPrepareRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.listProposals,
    'classification.listStandaloneReviewProposals',
    READ_FAILURE,
    (request) =>
      session.listProposals(requireStandaloneReviewPageRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.listAmbiguities,
    'classification.listStandaloneReviewAmbiguities',
    READ_FAILURE,
    (request) =>
      session.listAmbiguities(requireStandaloneReviewPageRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.stage,
    'classification.stageStandaloneReview',
    DECIDE_FAILURE,
    (request) =>
      session.stage(requireStandaloneReviewDecisionsRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.acceptAll,
    'classification.acceptAllStandaloneReview',
    DECIDE_FAILURE,
    (request) =>
      session.acceptAll(requireStandaloneReviewAcceptAllRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.discard,
    'classification.discardStandaloneReview',
    DISCARD_FAILURE,
    (request) =>
      session.discard(requireStandaloneReviewDiscardRequest(request)),
  )
  handleResult(
    STANDALONE_REVIEW_CHANNELS.execute,
    'classification.executeStandaloneReview',
    EXECUTE_FAILURE,
    (request) =>
      session.execute(requireStandaloneReviewExecutionRequest(request)),
  )
}
