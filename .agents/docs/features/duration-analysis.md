# Duration Analysis

Read when changing persisted observed duration, extraction scheduling, source
invalidation, pause/resume, or measurement retries. This guide owns that workflow;
[Search](search.md#duration-range) owns duration input and filter comparisons.
[Domain Model](../domain-model.md#availability-and-analysis) owns availability,
source-version, and observed/derived-data invariants.

## Status and Scope

This is agreed, not implemented catalog analysis. Existing preview/waveform
duration does not establish persistent queryable metadata. Musical BPM/key
analysis, persistent waveform peaks, and stronger source identity remain separate
modules. Measurements never change original audio or user organization.

## Measurement and Source Versions

- Measure in background after import; do not delay import for library-wide audio
  decoding. Until valid observation, duration remains unknown, never zero.
- Gradually include existing imported Samples lacking duration without reimport,
  under the same pause, priorities, and bounded scheduler.
- Persist observations against the source version; source changes invalidate
  them. Reject stale results. Size/mtime equality is not content identity.
- Duration, waveform, preview, and DAW reception have independent capabilities
  and outcomes; a supported extension proves none of their decoding support.

## Failures and Retry

- Preserve Sample/organization, leave duration unknown, and record analysis failure
  separately. Do not change a completed import into a failed import.
- Support explicit retry and retry after detecting a new source version. Never
  repeat the same failure indefinitely on the same version.
- Distinguish source unavailable from decoding/extraction errors. An authorized
  check/rescan confirming renewed access permits retry of unavailability failure
  even on the same version, respecting pause/limits. No continuous polling.
- Same-version decoding failures require explicit retry; a new version permits
  retry. Merely restarting the app is not a reason to retry recorded failures.

## Scheduling and Lifecycle

- Allow pause/resume and persist explicit pause choice. Prioritize explicit
  analysis requests. Bound active and queued work without blocking main or
  overwhelming preview; deduplicate by Sample/source version.
- Stop safely on exit and resume pending measurements automatically at restart
  unless explicitly paused. Verified restored access uses the retry rule above.
- This analysis-specific scheduler does not change manual continuation of the
  confirmed import/classification [queue](operation-execution.md#shared-confirmed-queue).
- Isolate expensive decoding from main; choose a bounded worker/utility-process
  implementation based on profiling and actual extraction requirements under
  [Architecture](../architecture.md#analysis-and-large-libraries).

## Remaining Technical Contracts

Define extraction/codec implementation, schema/migrations, typed pause state,
source/result validation, exact failure classes, explicit retry IPC, authorized
access checks, worker placement, concurrency/queue budgets, backpressure, and
shutdown/restart checkpoints. Validate on representative audio and libraries;
these are delivery details, not a reopened business-decision round.
