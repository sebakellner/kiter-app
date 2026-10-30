import type { DbClient } from '../../db'
import { canonicalClassificationSubjectKey } from '../../db/operations/classification/rejections.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { isRecord } from '../../../shared/domain/validation.ts'
import type {
  ClassificationBatchDraft,
  ClassificationReviewRow,
  ClassificationSubject,
} from '../../../shared/features/classification/batch-schemas.ts'
import type {
  StandaloneExecutionOutcome,
  StandaloneExecutionResult,
  StandaloneExecutionSubject,
  StandaloneExecutionTargetResult,
} from '../../../shared/features/classification/execution-schemas.ts'
import type { ClassificationStateFields } from '../../../shared/features/classification/state-fields.ts'

/** The single write this orchestrator needs; every target owns its transaction. */
export type StandaloneExecutionDatabase = Pick<
  DbClient,
  'executeStandaloneClassificationTarget'
>

type Group = {
  subject: ClassificationSubject
  catalog: StandaloneExecutionSubject
  stateToken: string
  accepts: ClassificationReviewRow[]
}

function catalogTarget(
  subject: ClassificationSubject,
): StandaloneExecutionSubject {
  if (subject.identity.kind !== 'catalog') {
    throw new IpcError(
      'INVALID_INPUT',
      'Standalone execution only commits catalog targets.',
    )
  }
  return { kind: subject.kind, id: subject.identity.id }
}

function empty(
  subject: StandaloneExecutionSubject,
): StandaloneExecutionTargetResult {
  return {
    subject,
    outcome: 'committed',
    assignments: 0,
    created: { instruments: 0, genres: 0 },
    typeChanged: false,
    remembered: 0,
    forgotten: 0,
  }
}

/** Packs decide before the Samples that may depend on them. */
function rank(kind: ClassificationSubject['kind']): number {
  return kind === 'pack' ? 0 : 1
}

function groupDecisions(draft: ClassificationBatchDraft): Group[] {
  const groups = new Map<string, Group>()
  for (const row of draft.decisions) {
    const key = canonicalClassificationSubjectKey(row.subject)
    const existing = groups.get(key)
    if (existing) {
      if (existing.stateToken !== row.stateToken) {
        throw new IpcError(
          'PROTOCOL_ERROR',
          'One classification target carries two reviewed states.',
        )
      }
      if (row.decision === 'accept') {
        existing.accepts.push(row)
      }
      continue
    }
    groups.set(key, {
      subject: row.subject,
      catalog: catalogTarget(row.subject),
      stateToken: row.stateToken,
      accepts: row.decision === 'accept' ? [row] : [],
    })
  }
  return [...groups.values()].sort(
    (a, b) => rank(a.subject.kind) - rank(b.subject.kind),
  )
}

function indexChanges<T extends { subject: ClassificationSubject }>(
  changes: T[],
  groups: Map<string, Group>,
  kind: string,
): Map<string, T[]> {
  const index = new Map<string, T[]>()
  for (const change of changes) {
    const key = canonicalClassificationSubjectKey(change.subject)
    // The review core derives every change from a decided row, so a change
    // without one means the draft and its decisions disagree.
    if (!groups.has(key)) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        `The classification review carries a ${kind} change for an undecided target.`,
      )
    }
    const bucket = index.get(key)
    if (bucket) {
      bucket.push(change)
    } else {
      index.set(key, [change])
    }
  }
  return index
}

function failure(error: unknown): {
  outcome: StandaloneExecutionOutcome
  message: string
} {
  if (isRecord(error) && error.code === 'STALE_REVIEW') {
    return {
      outcome: 'stale',
      message: 'Reviewed state changed. Prepare the review again.',
    }
  }
  const raw = error instanceof Error ? error.message.trim() : ''
  return {
    outcome: 'failed',
    message:
      raw.length > 0
        ? raw.slice(0, 500)
        : 'Unable to save this classification target.',
  }
}

/** Executes a reviewed decision set one target at a time.
 *
 * Each target is committed by the worker in its own transaction, so a failing
 * target writes nothing and never stops the remaining ones. Dependencies are
 * resolved by ordering Packs first: a Sample whose accepted decision needs a Pack
 * change that did not commit is reported blocked instead of being executed.
 */
export async function executeStandaloneDraft(
  database: StandaloneExecutionDatabase,
  draft: ClassificationBatchDraft,
  // Reviewed field digests, resolved per subject from the review that produced the
  // draft. They only explain a stale target; omitting them changes no outcome.
  stateFields?: (
    subject: ClassificationSubject,
  ) => ClassificationStateFields | undefined,
): Promise<StandaloneExecutionResult> {
  if (draft.explicitAssignments?.length) {
    throw new IpcError(
      'INVALID_INPUT',
      'Standalone execution does not commit import draft assignments.',
    )
  }
  const groupList = groupDecisions(draft)
  const groups = new Map(
    groupList.map((group) => [
      canonicalClassificationSubjectKey(group.subject),
      group,
    ]),
  )
  const remember = indexChanges(
    draft.rejectionChanges.remember,
    groups,
    'rejection',
  )
  const forget = indexChanges(draft.rejectionChanges.forget, groups, 'forget')
  const blockedKeys = new Set(
    draft.dependencyBlocks.map((block) => block.proposalKey),
  )
  const outcomes = new Map<string, StandaloneExecutionOutcome>()
  const results: StandaloneExecutionTargetResult[] = []
  for (const group of groupList) {
    const key = canonicalClassificationSubjectKey(group.subject)
    const blocked =
      group.accepts.some((row) => blockedKeys.has(row.proposalKey)) ||
      group.accepts.some((row) =>
        row.dependencies.some((dependency) => {
          const upstream = outcomes.get(
            canonicalClassificationSubjectKey(dependency.subject),
          )
          // An unselected dependency is already saved catalog state, not a
          // decision this batch still owes.
          return upstream !== undefined && upstream !== 'committed'
        }),
      )
    if (blocked) {
      results.push({
        ...empty(group.catalog),
        outcome: 'blocked',
        message: 'A required Pack decision did not commit.',
      })
      outcomes.set(key, 'blocked')
      continue
    }
    try {
      const reviewedFields = stateFields?.(group.subject)
      const result = await database.executeStandaloneClassificationTarget({
        subject: group.catalog,
        expectedStateToken: group.stateToken,
        ...(reviewedFields ? { expectedStateFields: reviewedFields } : {}),
        accepts: group.accepts.map((row) => row.target),
        rejections: {
          remember: remember.get(key) ?? [],
          forget: forget.get(key) ?? [],
        },
      })
      results.push(result)
      outcomes.set(key, result.outcome)
    } catch (error) {
      const { outcome, message } = failure(error)
      results.push({ ...empty(group.catalog), outcome, message })
      outcomes.set(key, outcome)
    }
  }
  const totals = { committed: 0, stale: 0, blocked: 0, failed: 0 }
  for (const result of results) {
    totals[result.outcome]++
  }
  return {
    reviewId: draft.reviewId,
    revision: draft.revision,
    token: draft.token,
    contractVersion: 1,
    results,
    totals,
  }
}
