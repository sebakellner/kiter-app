import { ipcMain } from 'electron'
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
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'
import type { AppFailure } from '../../shared/ipc/result'

const PREPARE_FAILURE: AppFailure = {
  code: 'STORAGE_FAILED',
  message:
    'Unable to prepare the classification review. Retry to read the catalog again.',
}

const READ_FAILURE: AppFailure = {
  code: 'STORAGE_FAILED',
  message: 'Unable to load the classification review. Prepare it again.',
}

const DECIDE_FAILURE: AppFailure = {
  code: 'STORAGE_FAILED',
  message:
    'Unable to update the classification review. Prepare it again before deciding.',
}

const DISCARD_FAILURE: AppFailure = {
  code: 'STORAGE_FAILED',
  message: 'Unable to discard the classification review. Prepare it again.',
}

const EXECUTE_FAILURE: AppFailure = {
  code: 'STORAGE_FAILED',
  message:
    'Unable to save the reviewed classifications. Read the current catalog data before trying again.',
}

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

  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.prepare,
    (event, request: unknown) =>
      invokeResult(
        'classification.prepareStandaloneReview',
        PREPARE_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.prepare(requireStandaloneReviewPrepareRequest(request))
        },
      ),
  )
  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.listProposals,
    (event, request: unknown) =>
      invokeResult(
        'classification.listStandaloneReviewProposals',
        READ_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.listProposals(
            requireStandaloneReviewPageRequest(request),
          )
        },
      ),
  )
  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.listAmbiguities,
    (event, request: unknown) =>
      invokeResult(
        'classification.listStandaloneReviewAmbiguities',
        READ_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.listAmbiguities(
            requireStandaloneReviewPageRequest(request),
          )
        },
      ),
  )
  ipcMain.handle(STANDALONE_REVIEW_CHANNELS.stage, (event, request: unknown) =>
    invokeResult('classification.stageStandaloneReview', DECIDE_FAILURE, () => {
      requireMainFrameWindow(event)
      return session.stage(requireStandaloneReviewDecisionsRequest(request))
    }),
  )
  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.acceptAll,
    (event, request: unknown) =>
      invokeResult(
        'classification.acceptAllStandaloneReview',
        DECIDE_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.acceptAll(
            requireStandaloneReviewAcceptAllRequest(request),
          )
        },
      ),
  )
  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.discard,
    (event, request: unknown) =>
      invokeResult(
        'classification.discardStandaloneReview',
        DISCARD_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.discard(requireStandaloneReviewDiscardRequest(request))
        },
      ),
  )
  ipcMain.handle(
    STANDALONE_REVIEW_CHANNELS.execute,
    (event, request: unknown) =>
      invokeResult(
        'classification.executeStandaloneReview',
        EXECUTE_FAILURE,
        () => {
          requireMainFrameWindow(event)
          return session.execute(
            requireStandaloneReviewExecutionRequest(request),
          )
        },
      ),
  )
}
