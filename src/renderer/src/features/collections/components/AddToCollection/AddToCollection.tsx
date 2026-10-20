import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Checkbox } from '@renderer/components/ui/Checkbox'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import { CreateCollection } from '../CreateCollection/CreateCollection'
import { useCollectionPicker } from './useCollectionPicker'
import { PendingMembershipGuard } from '../PendingMembershipGuard'
import './add-to-collection.css'
import { useToast } from '@renderer/components/ui/Toast'
import type { LibrarySample } from '@shared/ipc/library'
import {
  useCheckedCollectionSamples,
  type CollectionSample,
} from './useCheckedCollectionSamples'

export function AddToCollection({
  sample,
  samples,
  sourceCollectionId,
  onUnavailable,
  onClose,
}: {
  sample?: Pick<LibrarySample, 'id' | 'name' | 'relativePath'>
  samples?: CollectionSample[]
  sourceCollectionId?: string
  onUnavailable?: (ids: string[]) => void
  onClose: () => void
}): React.JSX.Element {
  if (samples) {
    return (
      <CheckedSamplesPicker
        samples={samples}
        sourceCollectionId={sourceCollectionId}
        onUnavailable={onUnavailable}
        onClose={onClose}
      />
    )
  }
  if (!sample) {
    throw new Error('Add to Collection requires Samples.')
  }
  return <CollectionPicker samples={[sample]} onClose={onClose} />
}

function CheckedSamplesPicker({
  samples,
  sourceCollectionId,
  onUnavailable,
  onClose,
}: {
  samples: CollectionSample[]
  sourceCollectionId?: string
  onUnavailable?: (ids: string[]) => void
  onClose: () => void
}): React.JSX.Element {
  const review = useCheckedCollectionSamples(samples, sourceCollectionId)
  useEffect(() => {
    if (!review.loading && !review.error && review.missing.length > 0) {
      onUnavailable?.(review.missing.map(({ id }) => id))
    }
  }, [review.loading, review.error, review.missing, onUnavailable])
  if (review.loading || review.error || review.samples.length === 0) {
    return (
      <Dialog open aria-label="Add to Collection" onDismiss={onClose}>
        <h2>Add to Collection</h2>
        {review.loading ? (
          <p role="status">Reviewing selected Samples…</p>
        ) : (
          <>
            <p role="alert">
              {review.error ??
                'None of the selected Samples remain in the source list. Close and select Samples again.'}
            </p>
            <Button onClick={review.refresh}>Review Samples again</Button>
          </>
        )}
        <Button onClick={onClose}>Cancel</Button>
      </Dialog>
    )
  }
  return (
    <CollectionPicker
      samples={review.samples}
      missing={review.missing}
      onReviewAgain={review.refresh}
      onClose={onClose}
    />
  )
}

function CollectionPicker({
  samples,
  missing = [],
  onReviewAgain,
  onClose,
}: {
  samples: CollectionSample[]
  missing?: CollectionSample[]
  onReviewAgain?: () => void
  onClose: () => void
}): React.JSX.Element {
  const sample = samples.length === 1 ? samples[0] : null
  const subject = sample ? `“${sample.name}”` : `${samples.length} Samples`
  const operationId = useId()
  const { showToast } = useToast()
  const picker = useCollectionPicker(samples, (outcomes) => {
    const added = outcomes.filter(({ status }) => status === 'added')
    const existing = outcomes.filter(
      ({ status }) => status === 'already-included',
    )
    const failed = outcomes.filter(({ status }) => status === 'failed')
    if (failed.length > 0) {
      showToast({
        operationId,
        variant: 'error',
        message: `${subject}: ${added.length} added, ${existing.length} already included, ${failed.length} failed. Review the Collection results.`,
      })
    } else if (sample && added.length === 1 && existing.length === 0) {
      showToast({
        operationId,
        message: `“${sample.name}” added to “${added[0].name}”.`,
      })
    } else {
      showToast({
        operationId,
        variant: added.length > 0 ? 'success' : 'info',
        message: `${subject}: ${added.length} added, ${existing.length} already included, 0 failed.`,
      })
    }
  })
  const [creating, setCreating] = useState(false)
  const [resultOffset, setResultOffset] = useState(0)
  const titleId = useId()
  const input = useRef<HTMLInputElement>(null)
  const dismiss = (): void => {
    if (!picker.pending) {
      onClose()
    }
  }
  if (creating) {
    return (
      <CreateCollection
        completionLabel="Create and select"
        onClose={() => setCreating(false)}
        onCreated={(collection) => {
          picker.toggle(collection, true)
          picker.refresh()
          setCreating(false)
        }}
      />
    )
  }
  const failed =
    picker.outcomes?.filter(({ status }) => status === 'failed').length ?? 0
  return (
    <Dialog
      open
      aria-labelledby={titleId}
      onDismiss={dismiss}
      initialFocus={input}
      className="collection-picker"
    >
      {picker.pending && <PendingMembershipGuard />}
      <h2 id={titleId}>Add to Collection</h2>
      {sample ? (
        <p>{sample.name}</p>
      ) : (
        <p>
          {samples.length} Samples selected, including selections outside the
          current page or filters.
        </p>
      )}
      {sample && sample.relativePath !== sample.name && (
        <p className="collection-picker-help">{sample.relativePath}</p>
      )}
      <p className="collection-picker-help">
        Add references to {sample ? 'this Sample' : 'these Samples'}. Original
        audio stays in place.
      </p>
      {!sample && (
        <details>
          <summary>Review selected Samples ({samples.length})</summary>
          <ol aria-label="Selected Samples">
            {samples.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <small>{item.relativePath}</small>
                <small>Sample {item.id}</small>
              </li>
            ))}
          </ol>
        </details>
      )}
      {missing.length > 0 && (
        <section aria-label="Unavailable selections">
          <p role="alert">
            {missing.length} selected Samples are no longer in the source list
            and will not be added. Confirm the remaining Samples or cancel to
            select again.
          </p>
          <ul>
            {missing.map((item) => (
              <li key={item.id}>
                {item.name} · {item.relativePath} · {item.id}
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void picker.submit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            if (!picker.pending && !picker.outcomes) {
              void picker.submit()
            }
          } else if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault()
          }
        }}
      >
        {!picker.outcomes && (
          <>
            <div className="collection-picker-toolbar">
              <Input
                ref={input}
                type="search"
                aria-label="Search Collections"
                placeholder="Search Collections"
                maxLength={120}
                disabled={picker.pending}
                value={picker.request.search}
                onChange={(event) => picker.search(event.currentTarget.value)}
              />
              <Button
                disabled={picker.pending || picker.selected.length >= 100}
                onClick={() => setCreating(true)}
              >
                Create Collection
              </Button>
            </div>
            {picker.loading && <p role="status">Loading Collections…</p>}
            {picker.error && (
              <p role="alert">
                {picker.error}{' '}
                <Button disabled={picker.pending} onClick={picker.refresh}>
                  Retry Collections
                </Button>
              </p>
            )}
            {picker.page && (
              <>
                {picker.page.total === 0 &&
                  !picker.loading &&
                  !picker.error && (
                    <p>
                      {picker.request.search
                        ? 'No Collections match this search.'
                        : 'No Collections yet. Create one to save this Sample.'}
                    </p>
                  )}
                <ul
                  aria-label="Collection destinations"
                  className="collection-picker-options"
                  aria-busy={picker.loading}
                >
                  {picker.page.items.map((collection) => (
                    <li key={collection.id}>
                      <label>
                        <Checkbox
                          checked={picker.selected.some(
                            ({ id }) => id === collection.id,
                          )}
                          disabled={
                            picker.pending ||
                            picker.loading ||
                            Boolean(picker.error) ||
                            (picker.selected.length >= 100 &&
                              !picker.selected.some(
                                ({ id }) => id === collection.id,
                              ))
                          }
                          onChange={(event) =>
                            picker.toggle(
                              collection,
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <span>
                          {collection.name}
                          <small>Collection {collection.id}</small>
                          <small>
                            {collection.sampleCount}{' '}
                            {collection.sampleCount === 1
                              ? 'Sample'
                              : 'Samples'}
                            {sample && collection.assigned
                              ? ' · Already included'
                              : ''}
                          </small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {(picker.page.total > picker.page.limit ||
                  picker.page.offset > 0) && (
                  <nav
                    aria-label="Collection destination pages"
                    className="collection-picker-toolbar"
                  >
                    <Button
                      disabled={
                        picker.pending ||
                        picker.loading ||
                        picker.page.offset === 0
                      }
                      onClick={() =>
                        picker.load(
                          Math.max(0, picker.page!.offset - picker.page!.limit),
                        )
                      }
                    >
                      Previous Collections
                    </Button>
                    <Button
                      disabled={
                        picker.pending ||
                        picker.loading ||
                        picker.page.offset + picker.page.limit >=
                          picker.page.total
                      }
                      onClick={() =>
                        picker.load(picker.page!.offset + picker.page!.limit)
                      }
                    >
                      Next Collections
                    </Button>
                  </nav>
                )}
              </>
            )}
            <ul
              aria-label="Selected Collections"
              className="collection-picker-selected"
            >
              {picker.selected.map((collection) => (
                <li key={collection.id}>
                  <Button
                    disabled={picker.pending}
                    aria-label={`Remove destination: ${collection.name}, ${collection.id}`}
                    onClick={() => picker.toggle(collection, false)}
                  >
                    {collection.name} ×
                  </Button>
                  <small>Collection {collection.id}</small>
                </li>
              ))}
            </ul>
            <p>
              {picker.selected.length}{' '}
              {picker.selected.length === 1 ? 'Collection' : 'Collections'}{' '}
              selected
            </p>
            {picker.form.formState.errors.collectionIds && (
              <p role="alert">
                {picker.form.formState.errors.collectionIds.message}
              </p>
            )}
          </>
        )}
        {picker.pending && (
          <p role="status">
            Adding {sample ? 'Sample' : 'Samples'}… Please wait before leaving.
          </p>
        )}
        {picker.outcomes && (
          <section aria-label="Collection results">
            <p role={failed ? 'alert' : 'status'}>
              {
                picker.outcomes.filter(({ status }) => status === 'added')
                  .length
              }{' '}
              added,{' '}
              {
                picker.outcomes.filter(
                  ({ status }) => status === 'already-included',
                ).length
              }{' '}
              already included, {failed} failed.
            </p>
            <ul>
              {picker.outcomes
                .slice(resultOffset, resultOffset + 50)
                .map((outcome) => (
                  <li key={`${outcome.id}:${outcome.sample.id}`}>
                    <strong>{outcome.name}</strong>
                    <small>Collection {outcome.id}</small>
                    {!sample && (
                      <>
                        <span>{outcome.sample.name}</span>
                        <small>
                          {outcome.sample.relativePath} · Sample{' '}
                          {outcome.sample.id}
                        </small>
                      </>
                    )}
                    <p>
                      {outcome.status === 'failed'
                        ? outcome.message
                        : outcome.status === 'added'
                          ? 'Sample added.'
                          : 'Sample already included. Its position was preserved.'}
                    </p>
                  </li>
                ))}
            </ul>
            {picker.outcomes.length > 50 && (
              <nav
                aria-label="Membership result pages"
                className="collection-picker-toolbar"
              >
                <Button
                  disabled={picker.pending || resultOffset === 0}
                  onClick={() =>
                    setResultOffset((offset) => Math.max(0, offset - 50))
                  }
                >
                  Previous results
                </Button>
                <span>
                  {resultOffset + 1}–
                  {Math.min(resultOffset + 50, picker.outcomes.length)} of{' '}
                  {picker.outcomes.length}
                </span>
                <Button
                  disabled={
                    picker.pending ||
                    resultOffset + 50 >= picker.outcomes.length
                  }
                  onClick={() => setResultOffset((offset) => offset + 50)}
                >
                  Next results
                </Button>
              </nav>
            )}
            {failed > 0 && (
              <p>
                Successful additions are saved. Choose destinations again if a
                Sample or Collection is no longer available.
              </p>
            )}
          </section>
        )}
        <footer className="collection-picker-toolbar">
          <Button disabled={picker.pending} onClick={dismiss}>
            {picker.outcomes ? 'Done' : 'Cancel'}
          </Button>
          {picker.outcomes ? (
            <>
              {picker.canRetry && (
                <Button
                  disabled={picker.pending}
                  onClick={() => void picker.retryFailed()}
                >
                  Retry failed
                </Button>
              )}
              <Button
                disabled={picker.pending}
                onClick={onReviewAgain ?? picker.chooseAgain}
              >
                Choose destinations again
              </Button>
            </>
          ) : (
            <Button variant="primary" type="submit" disabled={picker.pending}>
              {sample ? 'Add Sample' : `Add ${samples.length} Samples`}
            </Button>
          )}
        </footer>
      </form>
    </Dialog>
  )
}
