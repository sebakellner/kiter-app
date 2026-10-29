import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcError, unwrapIpcResult } from '@shared/ipc/result'
import type { AppErrorCode } from '@shared/ipc/result'
import type {
  ClassificationAmbiguityRow,
  ClassificationReviewPage,
  ClassificationReviewReference,
  ClassificationReviewRow,
  ClassificationReviewSummary,
} from '@shared/features/classification/batch-schemas'
import type { StandaloneExecutionResult } from '@shared/features/classification/execution-schemas'
import type { StandaloneReviewSubject } from '@shared/ipc/standaloneReview'

// Pages default to 50 in the shared contract; the reviewer only needs one size.
export const STANDALONE_REVIEW_PAGE_SIZE = 50

export type StandaloneReviewDecision = 'accept' | 'reject' | 'unreviewed'

export type StandaloneReviewStatus =
  'preparing' | 'ready' | 'stale' | 'gone' | 'failed' | 'executed'

export type StandaloneReviewFailure = {
  code: AppErrorCode
  message: string
}

export type StandaloneReviewPage<T> = {
  items: T[]
  total: number
  offset: number
  nextOffset: number | null
}

type ReviewState = {
  status: StandaloneReviewStatus
  review: ClassificationReviewReference | null
  summary: ClassificationReviewSummary | null
  subjectScope: StandaloneReviewSubject[]
  proposals: StandaloneReviewPage<ClassificationReviewRow> | null
  ambiguities: StandaloneReviewPage<ClassificationAmbiguityRow> | null
  failure: StandaloneReviewFailure | null
  notice: string | null
  // Which step produced the current failure, so the blocked screen can name it.
  failurePhase: 'prepare' | 'execute' | null
  saving: boolean
  executing: boolean
  // Execution consumes the review in main, so these results are the last thing
  // this surface can show for it.
  executed: StandaloneExecutionResult | null
  loadingProposals: boolean
  loadingAmbiguities: boolean
}

const INITIAL_STATE: ReviewState = {
  status: 'preparing',
  review: null,
  summary: null,
  subjectScope: [],
  proposals: null,
  ambiguities: null,
  failure: null,
  notice: null,
  failurePhase: null,
  saving: false,
  executing: false,
  executed: null,
  loadingProposals: false,
  loadingAmbiguities: false,
}

export type StandaloneReviewController = ReviewState & {
  busy: boolean
  prepare: () => void
  loadProposals: (offset: number) => void
  loadAmbiguities: () => void
  stage: (
    row: ClassificationReviewRow,
    decision: StandaloneReviewDecision,
  ) => Promise<void>
  acceptAll: () => Promise<void>
  discard: () => Promise<void>
  execute: () => Promise<void>
}

// Every request carries the complete reference from the last answered reply, so
// main can reject a stale review before answering.
function referenceOf(
  value: ClassificationReviewReference,
): ClassificationReviewReference {
  return {
    reviewId: value.reviewId,
    revision: value.revision,
    token: value.token,
  }
}

function toPage<T>(
  page: ClassificationReviewPage<T>,
  offset: number,
): StandaloneReviewPage<T> {
  return {
    items: page.items,
    total: page.total,
    offset,
    nextOffset: page.nextOffset,
  }
}

function toFailure(reason: unknown, fallback: string): StandaloneReviewFailure {
  if (reason instanceof IpcError) {
    return { code: reason.code, message: reason.message }
  }
  return {
    code: 'PROTOCOL_ERROR',
    message: reason instanceof Error ? reason.message : fallback,
  }
}

// A stale or released review cannot be recovered in place: there is no refresh
// channel, so preparing again is the only route forward.
function blockedStatus(code: AppErrorCode): StandaloneReviewStatus | null {
  if (code === 'STALE_REVIEW') {
    return 'stale'
  }
  if (code === 'NOT_FOUND') {
    return 'gone'
  }
  return null
}

function decisionNotice(decision: StandaloneReviewDecision): string {
  if (decision === 'accept') {
    return 'Accepted 1 proposal.'
  }
  if (decision === 'reject') {
    return 'Rejected 1 proposal.'
  }
  return 'Returned 1 proposal to unreviewed.'
}

export function useStandaloneReview(
  subjects: StandaloneReviewSubject[],
  onDiscarded?: () => void,
): StandaloneReviewController {
  const [state, setState] = useState<ReviewState>(INITIAL_STATE)
  // Each preparation attempt owns one generation; replies of an older attempt
  // must never overwrite the current review.
  const generation = useRef(0)
  const subjectKey = JSON.stringify(subjects)

  const prepare = useCallback((targets: StandaloneReviewSubject[]): void => {
    if (targets.length === 0) {
      return
    }
    const run = generation.current + 1
    generation.current = run
    const isCurrent = (): boolean => generation.current === run
    setState({ ...INITIAL_STATE, status: 'preparing' })
    void (async () => {
      try {
        const prepared = unwrapIpcResult(
          await window.api.standaloneReview.prepare({ subjects: targets }),
        )
        if (!isCurrent()) {
          return
        }
        const page = unwrapIpcResult(
          await window.api.standaloneReview.listProposals({
            ...referenceOf(prepared),
            offset: 0,
            limit: STANDALONE_REVIEW_PAGE_SIZE,
          }),
        )
        if (!isCurrent()) {
          return
        }
        setState({
          ...INITIAL_STATE,
          status: 'ready',
          review: referenceOf(page),
          summary: prepared,
          subjectScope: prepared.subjectScope,
          proposals: toPage(page, 0),
        })
      } catch (reason) {
        if (!isCurrent()) {
          return
        }
        setState((previous) => {
          const failure = toFailure(
            reason,
            'Unable to prepare this classification review.',
          )
          return {
            ...previous,
            status: blockedStatus(failure.code) ?? 'failed',
            failure,
            saving: false,
            loadingProposals: false,
            loadingAmbiguities: false,
          }
        })
      }
    })()
  }, [])

  const prepareAgain = useCallback(() => {
    prepare(subjects)
  }, [prepare, subjects])

  useEffect(() => {
    prepare(JSON.parse(subjectKey) as StandaloneReviewSubject[])
    return () => {
      generation.current += 1
    }
  }, [prepare, subjectKey])

  return {
    ...state,
    busy:
      state.status === 'preparing' ||
      state.saving ||
      state.executing ||
      state.loadingProposals ||
      state.loadingAmbiguities,
    prepare: prepareAgain,
    loadProposals,
    loadAmbiguities,
    stage,
    acceptAll,
    discard,
    execute,
  }

  async function loadProposals(offset: number): Promise<void> {
    const reference = state.review
    if (
      !reference ||
      state.status !== 'ready' ||
      state.saving ||
      state.loadingProposals
    ) {
      return
    }
    const run = generation.current
    setState((previous) => ({
      ...previous,
      loadingProposals: true,
      failure: null,
    }))
    try {
      const page = unwrapIpcResult(
        await window.api.standaloneReview.listProposals({
          ...referenceOf(reference),
          offset,
          limit: STANDALONE_REVIEW_PAGE_SIZE,
        }),
      )
      if (generation.current !== run) {
        return
      }
      setState((previous) => ({
        ...previous,
        review: referenceOf(page),
        proposals: toPage(page, offset),
        loadingProposals: false,
      }))
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
    }
  }

  async function loadAmbiguities(): Promise<void> {
    const reference = state.review
    if (
      !reference ||
      state.status !== 'ready' ||
      state.saving ||
      state.loadingAmbiguities
    ) {
      return
    }
    const run = generation.current
    const offset = state.ambiguities?.nextOffset ?? 0
    setState((previous) => ({
      ...previous,
      loadingAmbiguities: true,
      failure: null,
    }))
    try {
      const page = unwrapIpcResult(
        await window.api.standaloneReview.listAmbiguities({
          ...referenceOf(reference),
          offset,
          limit: STANDALONE_REVIEW_PAGE_SIZE,
        }),
      )
      if (generation.current !== run) {
        return
      }
      setState((previous) => ({
        ...previous,
        review: referenceOf(page),
        ambiguities: {
          items: [...(previous.ambiguities?.items ?? []), ...page.items],
          total: page.total,
          offset: 0,
          nextOffset: page.nextOffset,
        },
        loadingAmbiguities: false,
      }))
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
    }
  }

  async function stage(
    row: ClassificationReviewRow,
    decision: StandaloneReviewDecision,
  ): Promise<void> {
    const reference = state.review
    if (!reference || state.status !== 'ready' || state.saving) {
      return
    }
    const run = generation.current
    const offset = state.proposals?.offset ?? 0
    setState((previous) => ({
      ...previous,
      saving: true,
      failure: null,
      notice: null,
    }))
    let summary: ClassificationReviewSummary
    try {
      summary = unwrapIpcResult(
        await window.api.standaloneReview.stage({
          ...referenceOf(reference),
          choices: [{ proposalKey: row.proposalKey, decision }],
        }),
      )
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      // The choice never reached main, so the previous reference still holds.
      setState((previous) => failureState(previous, reason))
      return
    }
    if (generation.current !== run) {
      return
    }
    // The choice is already staged in main. Adopt its new reference immediately,
    // before reloading the page: a failed reload must not leave the surface
    // holding the pre-stage revision, or the next request would be rejected as
    // stale and every staged choice would be lost.
    setState((previous) => ({
      ...previous,
      status: 'ready',
      review: referenceOf(summary),
      summary,
      failure: null,
      notice: decisionNotice(decision),
      saving: false,
    }))
    try {
      const page = unwrapIpcResult(
        await window.api.standaloneReview.listProposals({
          ...referenceOf(summary),
          offset,
          limit: STANDALONE_REVIEW_PAGE_SIZE,
        }),
      )
      if (generation.current !== run) {
        return
      }
      setState((previous) => ({
        ...previous,
        review: referenceOf(page),
        proposals: toPage(page, offset),
      }))
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
    }
  }

  async function acceptAll(): Promise<void> {
    const reference = state.review
    if (!reference || state.status !== 'ready' || state.saving) {
      return
    }
    const run = generation.current
    setState((previous) => ({
      ...previous,
      saving: true,
      failure: null,
      notice: null,
    }))
    let summary: ClassificationReviewSummary
    try {
      summary = unwrapIpcResult(
        await window.api.standaloneReview.acceptAll(referenceOf(reference)),
      )
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
      return
    }
    if (generation.current !== run) {
      return
    }
    // Same rule as a single choice: adopt the staged reference before the reload
    // so a failed reload cannot strand the surface on a stale revision.
    setState((previous) => ({
      ...previous,
      status: 'ready',
      review: referenceOf(summary),
      summary,
      failure: null,
      notice: 'Accepted every reviewable proposal.',
      saving: false,
    }))
    try {
      const page = unwrapIpcResult(
        await window.api.standaloneReview.listProposals({
          ...referenceOf(summary),
          offset: 0,
          limit: STANDALONE_REVIEW_PAGE_SIZE,
        }),
      )
      if (generation.current !== run) {
        return
      }
      setState((previous) => ({
        ...previous,
        review: referenceOf(page),
        proposals: toPage(page, 0),
      }))
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
    }
  }

  async function execute(): Promise<void> {
    const reference = state.review
    // One confirmation owns one execution attempt: while it runs, and after it
    // answered, there is no review left to execute again.
    if (
      !reference ||
      state.status !== 'ready' ||
      state.saving ||
      state.executing ||
      state.executed ||
      // The confirmation's scope is the accepted set it was opened for. Writing
      // with none accepted would consume the review for nothing.
      (state.summary?.accepted ?? 0) === 0
    ) {
      return
    }
    const run = generation.current
    setState((previous) => ({
      ...previous,
      executing: true,
      failure: null,
      notice: null,
    }))
    let result: StandaloneExecutionResult
    try {
      // Execution carries only the reviewed reference; main materializes the
      // decisions, so this request never describes what to write.
      result = unwrapIpcResult(
        await window.api.standaloneReview.execute(referenceOf(reference)),
      )
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      // A refused execution means the review is gone: main consumes it on every
      // attempt, so preparing it again is the only way forward. The reference and
      // summary are dropped; the loaded page and ambiguities stay inert behind the
      // blocked screen and are replaced by the next preparation.
      setState((previous) => executionFailureState(previous, reason))
      return
    }
    if (generation.current !== run) {
      return
    }
    setState({ ...INITIAL_STATE, status: 'executed', executed: result })
  }

  async function discard(): Promise<void> {
    const reference = state.review
    if (!reference || state.saving) {
      return
    }
    const run = generation.current
    setState((previous) => ({
      ...previous,
      saving: true,
      failure: null,
      notice: null,
    }))
    try {
      unwrapIpcResult(
        // Discard is keyed by the review identity alone; the strict shared
        // request rejects a revision or token on this channel.
        await window.api.standaloneReview.discard({
          reviewId: reference.reviewId,
        }),
      )
      if (generation.current !== run) {
        return
      }
      setState(INITIAL_STATE)
      onDiscarded?.()
    } catch (reason) {
      if (generation.current !== run) {
        return
      }
      setState((previous) => failureState(previous, reason))
    }
  }
}

function failureState(state: ReviewState, reason: unknown): ReviewState {
  const failure = toFailure(reason, 'Unable to complete this review request.')
  return {
    ...state,
    status: blockedStatus(failure.code) ?? state.status,
    failure,
    failurePhase: 'prepare',
    saving: false,
    loadingProposals: false,
    loadingAmbiguities: false,
  }
}

// A failed execution leaves no usable review, so the surface drops every staged
// value instead of letting the operator retry against released state.
function executionFailureState(
  state: ReviewState,
  reason: unknown,
): ReviewState {
  const failure = toFailure(
    reason,
    'Unable to save the reviewed classifications.',
  )
  return {
    ...state,
    status: blockedStatus(failure.code) ?? 'failed',
    review: null,
    summary: null,
    failure,
    failurePhase: 'execute',
    saving: false,
    executing: false,
    loadingProposals: false,
    loadingAmbiguities: false,
  }
}
