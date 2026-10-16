# Operation Execution

Read when changing the shared import/classification queue, durable confirmed
operations, cancellation, exit, restart, outcome history, or recovery. This guide
owns those cross-feature contracts. [Import](import.md) and
[Classification](classification.md) own their target transactions and failure
policies; [Architecture](../architecture.md) owns general process boundaries.

## Status and Scope

These are agreed planned workflows, not an implemented task journal or queue.
The business-decision round for this scope is complete; concrete storage and IPC
remain incremental delivery contracts. This is not a generic scheduling system
for every mutation and does not replace DB-worker command serialization.
Duration analysis has [separate scheduling](duration-analysis.md), including its
distinct restart behavior. Filesystem operations need additional recovery rules.

## Shared Confirmed Queue

- Confirmed imports and standalone classification share one serial queue, ordered
  by confirmation, even if their targets do not overlap.
- Allow preparing/confirming later operations while one executes. Persist confirmed
  decisions before execution; revalidate queued work before it starts.
- Pending operations may be removed, not edited/reordered. To change one, remove
  and prepare a replacement.
- Needs review pauses advancement until review or removal. Preserve still-valid
  decisions and require new review of relevant changed state; never replay stale
  choices. Import rediscovery requirements remain in Import.
- A terminal failure/partial outcome or standalone cancellation retains its result
  and advances to the next queued operation. This does not override an exit request.
- Queued imports/classifications survive restart as pending. Never auto-execute:
  user continuation and revalidation are required.

## Cancellation, Exit, and Continuation

- Confirmed imports are not cancelable. Ordinary exit is blocked while import
  executes; explain that it must finish. Do not automatically quit afterward;
  hiding/minimizing remains available. Forced termination/OS shutdown are not
  covered by that guard and require reconciliation.
- Standalone classification can cancel between targets. Finish the current
  transaction and start no further targets. Preserve committed work and report
  completed, failed, and unprocessed targets, not rollback.
- Ordinary exit during classification requests the same boundary stop, persists
  its result, and exits without starting the next queued operation. Dirty forms
  still obey [exit review](../ux-design.md#keyboard-focus-and-overlays--agreed).
- Continuing canceled/interrupted classification creates a new operation for
  failed/unprocessed targets only, preserving the original result. Reconcile
  uncertain outcomes first; revalidate and review stale decisions. Do not reapply
  completed targets. Import Retry prepares the entire original batch instead.
- Other non-import retries target failed items after revalidation, with renewed
  confirmation if scope or impact changes.

## Verifiable Recovery

- Store confirmed operations and reviewed decisions before starting execution.
- Store committed per-Sample/Pack outcomes in the same transaction as their
  changes. Coupled new-Pack/first-Sample writes record both outcomes together.
  Progress events or renderer acknowledgements do not prove database commits.
- On restart distinguish completed, failed, and unprocessed targets from durable
  records. Interrupted execution is not assumed successful or rolled back.
- Mark states that cannot be established unverified; block their retry until
  reconciliation finishes. Verification completion need not prove every outcome
  or turn an operation into success. Never auto-resume or use history as Undo.
- Preserve item outcomes and meaningful progress units. Proposed task states
  queued/running/completed/partial/failed/canceled are planning vocabulary, not
  implemented enums; Interrupted/Needs review and verification need exact contracts.
  A cancellation request differs from its final outcome.
- Filesystem/catalog workflows cannot rely on database atomicity alone; see
  [Safe File Operations](../architecture.md#safe-file-operations-planned).
  Never merge conflicting operations on the same file into a blind retry.

## History and Result Access

- Import and standalone classification history persist until explicit deletion,
  without automatic cleanup/expiration. Classification retains summaries and
  paginated per-target outcomes; import retains folder/file and operation links.
- Delete individual/batched terminal records only after confirmation, never
  active, queued, or recovering records. Interrupted records become eligible only
  after verification finishes. Failed results may be deleted after verification;
  success is not a prerequisite. Removing pending queue work is a separate action.
- History cleanup does not undo classifications or delete Samples, Packs, or
  source audio. Explain dependencies of operation-specific links on that history.
- If an open history/result-membership record is deleted, replace it with Record
  deleted, remove record-based actions, and offer Back to history. Do not keep
  serving cached membership as a valid query; catalog records stay intact.
- Settings → Library opens import history ordered by date with state filters and
  folder/file detail; route contracts remain open. No new classification-history
  placement is implied before navigation contracts are defined.
- The header operation indicator exposes active work and Recent results.
  Completed-result detail opens modally with focus restoration; import progress
  supports minimizing/reopening. Ordinary Tab and F6 reach the indicator with an
  accessible name and state announcements; no dedicated results shortcut initially.
- Other non-import results are session-only, retaining the latest 50 completed/
  closed records. Protect active work and unreviewed failures, even above 50.
  Opening failure detail marks it reviewed for rotation; dismissing its notice
  does not. Reviewed never means successful/resolved/retried. Keep large details
  compact/bounded; closing notices does not discard accessible result details.

## Technical Ownership and Remaining Contracts

- Renderer presents staged review and subscribes to bounded progress/results.
  Main owns queue/lifecycle orchestration and authoritative revalidation through
  narrow IPC; DB worker owns durable operation records and transactional results.
- Main coordinates restart reconciliation against worker-owned records, without
  trusting renderer-supplied evidence, paths, or claimed outcomes.
- Define journal schema/migrations, bounded decision payloads, queue limits,
  version/review tokens, dependency checkpoints, exit synchronization, pagination,
  cleanup queries, and recovery queries as part of each delivery.
- Each delivered execution path must include its agreed persistence/recovery
  guarantees; unconfirmed preparations remain session-only. Source audio remains
  unchanged throughout these catalog operations.
