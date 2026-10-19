import { useId, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Checkbox } from '@renderer/components/ui/Checkbox'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import { CreateCollection } from '../CreateCollection/CreateCollection'
import { useCollectionPicker } from './useCollectionPicker'
import { PendingMembershipGuard } from '../PendingMembershipGuard'
import './add-to-collection.css'

export function AddToCollection({
  sample,
  onClose,
}: {
  sample: { id: string; name: string }
  onClose: () => void
}): React.JSX.Element {
  const picker = useCollectionPicker(sample.id)
  const [creating, setCreating] = useState(false)
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
      <p>{sample.name}</p>
      <p className="collection-picker-help">
        Add references to this Sample. Original audio stays in place.
      </p>
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
                            {collection.assigned ? ' · Already included' : ''}
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
          <p role="status">Adding Sample… Please wait before leaving.</p>
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
              {picker.outcomes.map((outcome) => (
                <li key={outcome.id}>
                  <strong>{outcome.name}</strong>
                  <small>Collection {outcome.id}</small>
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
              <Button disabled={picker.pending} onClick={picker.chooseAgain}>
                Choose destinations again
              </Button>
            </>
          ) : (
            <Button variant="primary" type="submit" disabled={picker.pending}>
              Add Sample
            </Button>
          )}
        </footer>
      </form>
    </Dialog>
  )
}
