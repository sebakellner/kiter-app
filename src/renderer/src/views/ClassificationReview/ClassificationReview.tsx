import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isRecord } from '@shared/domain/validation'
import type { StandaloneReviewSubject } from '@shared/ipc/standaloneReview'
import { StandaloneReview } from '@renderer/features/classification/components/StandaloneReview/StandaloneReview'

// Selected Samples arrive as route state from the catalog batch action; the
// review never guesses a scope from the current list.
function readSubjects(state: unknown): StandaloneReviewSubject[] {
  if (!isRecord(state) || !Array.isArray(state.subjects)) {
    return []
  }
  const subjects: StandaloneReviewSubject[] = []
  for (const value of state.subjects) {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
      return []
    }
    if (value.kind !== 'sample' && value.kind !== 'pack') {
      return []
    }
    subjects.push({ kind: value.kind, id: value.id })
  }
  return subjects
}

export function ClassificationReview(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const subjects = useMemo(() => readSubjects(location.state), [location.state])
  return (
    <section aria-labelledby="classification-review-title">
      <nav aria-label="Breadcrumb">
        <Link to="/samples">Samples</Link>
      </nav>
      <h1 id="classification-review-title" tabIndex={-1}>
        Review classifications
      </h1>
      {subjects.length === 0 ? (
        <>
          <p>
            Select one or more Samples in the Samples list, then choose Review
            classifications.
          </p>
          <Link to="/samples">Back to Samples</Link>
        </>
      ) : (
        <StandaloneReview
          subjects={subjects}
          onDiscarded={() => navigate('/samples')}
        />
      )}
    </section>
  )
}
