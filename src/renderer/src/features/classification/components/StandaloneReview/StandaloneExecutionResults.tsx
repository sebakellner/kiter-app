import { Link } from 'react-router-dom'
import type {
  StandaloneExecutionOutcome,
  StandaloneExecutionResult,
  StandaloneExecutionSubject,
} from '@shared/features/classification/execution-schemas'

// A committed target alone is success. Every other outcome wrote nothing, so the
// surface states what was saved and what was not instead of a batch verdict.
const OUTCOME_LABELS: Record<StandaloneExecutionOutcome, string> = {
  committed: 'Saved',
  stale: 'Not saved (catalog changed)',
  blocked: 'Not executed (Pack decision missing)',
  failed: 'Not saved (target failed)',
}

const OUTCOME_EXPLANATIONS: Record<StandaloneExecutionOutcome, string> = {
  committed: 'This target was written to the catalog.',
  stale:
    'The catalog changed since this review was prepared, so nothing was written for this target.',
  blocked:
    'A required Pack decision did not commit, so this target was not executed.',
  failed: 'This target could not be saved, so nothing was written for it.',
}

// Execution results carry the catalog identity only, never a display name, so the
// label shortens the identifier instead of inventing one. The full identity stays
// available on the row for anyone who needs to reach the target.
function subjectLabel(subject: StandaloneExecutionSubject): string {
  return `${subject.kind === 'pack' ? 'Pack' : 'Sample'} ${shortId(subject.id)}`
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function summaryCopy(result: StandaloneExecutionResult): {
  heading: string
  explanation: string
} {
  const total = result.results.length
  const { committed } = result.totals
  const notCommitted = total - committed
  if (total === 0) {
    return {
      heading: 'Nothing was executed',
      explanation:
        'No target was available to execute, so nothing was written to the catalog.',
    }
  }
  if (notCommitted === 0) {
    return {
      heading: 'Saved to the catalog',
      explanation: `Every reviewed target was saved: ${committed} of ${total} targets committed.`,
    }
  }
  if (committed === 0) {
    return {
      heading: 'No reviewed target was saved',
      explanation: `${notCommitted} of ${total} targets did not commit, so nothing was written.`,
    }
  }
  return {
    heading: 'Only some targets were saved',
    explanation: `${committed} of ${total} targets committed. ${notCommitted} did not, and nothing was written for those targets.`,
  }
}

/** Per-target execution results for the review main just consumed.
 *
 * Targets that did not commit come back as a scope for a fresh review, because the
 * executed review can never be staged again.
 */
export function StandaloneExecutionResults({
  result,
}: {
  result: StandaloneExecutionResult
}): React.JSX.Element {
  const copy = summaryCopy(result)
  const remaining = result.results
    .filter((item) => item.outcome !== 'committed')
    .map((item) => item.subject)
  return (
    <section
      aria-label="Execution results"
      className="standalone-review-execution"
    >
      <h2>{copy.heading}</h2>
      <p>{copy.explanation}</p>
      <ul aria-label="Execution totals" className="standalone-review-totals">
        <li>Committed targets: {result.totals.committed}</li>
        <li>Stale targets: {result.totals.stale}</li>
        <li>Blocked targets: {result.totals.blocked}</li>
        <li>Failed targets: {result.totals.failed}</li>
      </ul>
      <ul aria-label="Execution results by target">
        {result.results.map((item) => (
          <li
            key={`${item.subject.kind}:${item.subject.id}`}
            aria-label={subjectLabel(item.subject)}
            title={item.subject.id}
          >
            <h3>{subjectLabel(item.subject)}</h3>
            <p>{OUTCOME_LABELS[item.outcome]}</p>
            <p>{OUTCOME_EXPLANATIONS[item.outcome]}</p>
            <ul>
              <li>Assignments written: {item.assignments}</li>
              <li>
                Vocabulary created:{' '}
                {countLabel(
                  item.created.instruments,
                  'Instrument',
                  'Instruments',
                )}
                {', '}
                {countLabel(item.created.genres, 'Genre', 'Genres')}
              </li>
              <li>Sample type changed: {item.typeChanged ? 'Yes' : 'No'}</li>
            </ul>
            {item.message && <p>{item.message}</p>}
          </li>
        ))}
      </ul>
      {remaining.length === 0 ? (
        <Link to="/samples">Back to Samples</Link>
      ) : (
        <Link to="/classification/review" state={{ subjects: remaining }}>
          Review again
        </Link>
      )}
    </section>
  )
}
