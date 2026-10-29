import { useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableScrollArea,
} from '@renderer/components/ui/Table'
import type {
  ClassificationReviewRow,
  ClassificationSubject,
} from '@shared/features/classification/batch-schemas'
import type { StandaloneReviewSubject } from '@shared/ipc/standaloneReview'
import {
  STANDALONE_REVIEW_PAGE_SIZE,
  useStandaloneReview,
} from './useStandaloneReview'
import type { StandaloneReviewStatus } from './useStandaloneReview'
import './standalone-review.css'

const DIMENSION_LABELS = {
  instrument: 'Instrument',
  genre: 'Genre',
  'sample-type': 'Sample type',
} as const

const DECISION_LABELS = {
  accept: 'Accepted',
  reject: 'Rejected',
  unreviewed: 'Unreviewed',
} as const

const DECISION_ACTIONS = {
  accept: 'Accept',
  reject: 'Reject',
  unreviewed: 'Undo',
} as const

const DECISIONS = ['accept', 'reject', 'unreviewed'] as const

const REASON_LABELS = {
  'conflicting-targets': 'Conflicting targets',
  'overlapping-phrases': 'Overlapping phrases',
  'contradictory-type': 'Contradictory type',
} as const

function targetName(row: ClassificationReviewRow): string {
  if (row.target.dimension === 'sample-type') {
    return row.target.key === 'loop' ? 'Loop' : 'One-shot'
  }
  return row.target.name
}

function subjectKey(subject: ClassificationSubject): string {
  if (subject.identity.kind === 'catalog') {
    return `${subject.kind}:catalog:${subject.identity.id}`
  }
  return `${subject.kind}:import:${subject.identity.preparationId}:${subject.identity.id}`
}

// A review that changed or was released cannot be refreshed in place; only a
// new preparation can continue the workflow.
function blockedCopy(status: StandaloneReviewStatus): {
  title: string
  explanation: string
} {
  if (status === 'stale') {
    return {
      title: 'This classification review is out of date.',
      explanation:
        'The catalog or vocabulary changed after this review was prepared, so its suggestions are no longer valid. Nothing was saved. Prepare the review again to review the current suggestions.',
    }
  }
  if (status === 'gone') {
    return {
      title: 'This classification review is no longer available.',
      explanation:
        'Kiter keeps prepared reviews only for the current session. Restarting Kiter or discarding the review releases it. Nothing was saved. Prepare the review again to continue.',
    }
  }
  return {
    title: 'This classification review could not be prepared.',
    explanation: 'Nothing was saved. Prepare the review again to retry.',
  }
}

export function StandaloneReview({
  subjects,
  onDiscarded,
}: {
  subjects: StandaloneReviewSubject[]
  onDiscarded?: () => void
}): React.JSX.Element {
  const review = useStandaloneReview(subjects, onDiscarded)
  const [confirmingAcceptAll, setConfirmingAcceptAll] = useState(false)
  const { summary, proposals, subjectScope } = review
  const outsidePage = proposals ? proposals.total - proposals.items.length : 0
  const status =
    review.status === 'preparing'
      ? 'Preparing review…'
      : review.saving
        ? 'Saving review choices…'
        : review.loadingProposals
          ? 'Loading proposals…'
          : review.loadingAmbiguities
            ? 'Loading ambiguities…'
            : null
  const blocked = review.status !== 'ready' && review.status !== 'preparing'
  const copy = blockedCopy(review.status)
  return (
    <section
      aria-label="Classification review"
      aria-busy={review.busy}
      className="standalone-review"
    >
      {status && <p role="status">{status}</p>}
      {review.notice && <p role="status">{review.notice}</p>}
      {blocked && (
        <div role="alert" className="standalone-review-blocked">
          <h2>{copy.title}</h2>
          {review.failure && <p>{review.failure.message}</p>}
          <p>{copy.explanation}</p>
          <Button variant="primary" onClick={review.prepare}>
            Prepare again
          </Button>
        </div>
      )}
      {review.status === 'ready' && summary && review.review && (
        <>
          <p className="standalone-review-reference">
            Review {review.review.reviewId}, revision {review.review.revision}
          </p>
          <ul aria-label="Review summary" className="standalone-review-summary">
            <li>Targets: {summary.targets}</li>
            <li>Proposals: {summary.proposals}</li>
            <li>Reviewable: {summary.reviewable}</li>
            <li>Remembered: {summary.remembered}</li>
            <li>Ambiguities: {summary.ambiguities}</li>
            <li>Required creations: {summary.requiredCreations}</li>
            <li>Type replacements: {summary.typeReplacements}</li>
            <li>Accepted: {summary.accepted}</li>
            <li>Rejected: {summary.rejected}</li>
          </ul>
          {review.failure && <p role="alert">{review.failure.message}</p>}
          <div className="standalone-review-actions">
            <Button
              disabled={review.busy || summary.reviewable === 0}
              aria-expanded={confirmingAcceptAll}
              onClick={() => setConfirmingAcceptAll(true)}
            >
              Accept all
            </Button>
            <Button
              variant="ghost"
              disabled={review.busy}
              onClick={() => void review.discard()}
            >
              Discard review
            </Button>
          </div>
          {confirmingAcceptAll && (
            <section
              aria-label="Accept all scope"
              className="standalone-review-scope"
            >
              <h2>Accept all reviewable proposals</h2>
              <ul>
                <li>Samples in this review: {subjectScope.length}</li>
                <li>Proposals in this review: {summary.proposals}</li>
                <li>Reviewable proposals: {summary.reviewable}</li>
                <li>Proposals outside this page: {outsidePage}</li>
                <li>Required creations: {summary.requiredCreations}</li>
                <li>Type replacements: {summary.typeReplacements}</li>
                <li>Currently rejected: {summary.rejected}</li>
              </ul>
              <p>
                Accept all stages every reviewable proposal in this scope,
                including proposals that are not on this page, and replaces
                staged rejections. It writes nothing to the catalog.
              </p>
              <Button
                variant="primary"
                disabled={review.busy}
                onClick={() => {
                  setConfirmingAcceptAll(false)
                  void review.acceptAll()
                }}
              >
                Accept all proposals
              </Button>
              <Button
                variant="ghost"
                disabled={review.busy}
                onClick={() => setConfirmingAcceptAll(false)}
              >
                Cancel
              </Button>
            </section>
          )}
          {proposals && (
            <>
              <TableScrollArea
                aria-label="Review proposals"
                className="standalone-review-proposals"
              >
                <Table stickyHeader>
                  <TableCaption>Review proposals</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Target</TableHead>
                      <TableHead>Dimension</TableHead>
                      <TableHead>Type replacement</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposals.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          This review has no proposals.
                        </TableCell>
                      </TableRow>
                    ) : (
                      proposals.items.map((row) => {
                        const disabled =
                          review.busy || !row.reviewable || row.assigned
                        return (
                          <TableRow key={row.proposalKey}>
                            <TableHead scope="row">
                              {targetName(row)}
                              {row.assigned && <small> Already assigned</small>}
                              {row.remembered && (
                                <small> Remembered rejection</small>
                              )}
                            </TableHead>
                            <TableCell>
                              {DIMENSION_LABELS[row.target.dimension]}
                            </TableCell>
                            <TableCell>
                              {row.replacesType ? 'Yes' : 'No'}
                            </TableCell>
                            <TableCell>
                              {DECISION_LABELS[row.decision]}
                            </TableCell>
                            <TableCell>
                              {DECISIONS.map((decision) => (
                                <Button
                                  key={decision}
                                  disabled={
                                    disabled || row.decision === decision
                                  }
                                  onClick={() =>
                                    void review.stage(row, decision)
                                  }
                                >
                                  {DECISION_ACTIONS[decision]} {targetName(row)}
                                </Button>
                              ))}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </TableScrollArea>
              <nav aria-label="Proposal pages">
                <Button
                  disabled={review.busy || proposals.offset === 0}
                  onClick={() =>
                    void review.loadProposals(
                      Math.max(
                        0,
                        proposals.offset - STANDALONE_REVIEW_PAGE_SIZE,
                      ),
                    )
                  }
                >
                  Previous page
                </Button>
                <span>
                  {proposals.total === 0 ? 0 : proposals.offset + 1}–
                  {proposals.offset + proposals.items.length} of{' '}
                  {proposals.total}
                </span>
                <Button
                  disabled={review.busy || proposals.nextOffset === null}
                  onClick={() =>
                    void review.loadProposals(proposals.nextOffset ?? 0)
                  }
                >
                  Next page
                </Button>
              </nav>
            </>
          )}
          <section
            aria-label="Ambiguities"
            className="standalone-review-ambiguities"
          >
            <h2>Ambiguities</h2>
            <Button
              disabled={review.busy || summary.ambiguities === 0}
              onClick={() => void review.loadAmbiguities()}
            >
              {review.ambiguities
                ? 'Load more ambiguities'
                : `Show ambiguities (${summary.ambiguities})`}
            </Button>
            {review.ambiguities &&
              (review.ambiguities.items.length === 0 ? (
                <p>No ambiguous clues were omitted from this review.</p>
              ) : (
                <ul>
                  {review.ambiguities.items.map((row, index) => (
                    <li
                      key={`${subjectKey(row.subject)}:${row.dimension}:${index}`}
                    >
                      <p>
                        {REASON_LABELS[row.reason]} (
                        {DIMENSION_LABELS[row.dimension]})
                      </p>
                      <p>
                        Possible targets:{' '}
                        {row.targets.map((target) => target.key).join(', ')}
                      </p>
                      <ul>
                        {row.evidence.map((evidence, evidenceIndex) => (
                          <li key={evidenceIndex}>{evidence.text}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ))}
          </section>
        </>
      )}
    </section>
  )
}
