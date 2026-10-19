# Export

Read when changing reviewed audio export, output layouts, optional manifests, or
export recovery. These business rules are agreed, not implemented capabilities.
[File Organization](file-organization.md) owns shared physical-name constraints and
the Kiter family/instrument layout; export copies audio and never moves originals.

## Scope, Layout, and Review

- Export an individual Sample, an explicit checked batch, current Pack members,
  or a Collection's sequence. Review the actual scope and order before confirming,
  including hidden selected Samples. Changes affecting the reviewed output require
  revalidation and renewed review; never silently change the confirmed selection.
- Copy original audio without transcoding, embedding metadata, or modifying it.
  No ZIP/archive output or format conversion in this delivery. Never register the
  export destination or catalog the copies automatically; preserve Sample sources,
  organization, and playback. Main must authorize reading each source.
- Offer a flat folder, reviewed origin-relative subfolders, or Kiter's reviewed
  family/instrument layout. Resolve ambiguous source roots/classification choices
  before confirmation and permit destination adjustments in the plan.
- Default to physical filenames. Offer the same original-name/fixed-text/counter
  template scope as physical renaming, with extension preserved. Collection output
  uses its reviewed manual order; other scopes use displayed plan order. Prefixes
  can make order visible in filenames, but no receiving-app order is guaranteed.
- Show sources, every final relative output path, collisions, and optional manifest
  before confirmation. Validate destination-compatible names. Resolve collisions
  only by reviewed renaming or exclusion, never overwriting or merging, including
  conflicts between output items and existing files or source audio.
- Show unavailable sources before confirmation and allow explicit exclusion to
  export the remaining scope. If a source fails during execution, continue other
  independent items and report partial results accurately; never claim the entire
  original selection was exported.

## Optional Kiter Manifest

- Offer a versioned Kiter JSON manifest separate from audio. This is a documented
  Kiter-specific description, not an industry interchange standard, database
  backup, guaranteed reimport format, or promise of third-party compatibility.
  Integrations with a particular receiving application need their own contract.
- Include relative exported paths, reference IDs, physical/presentation names,
  origin Pack, confirmed direct Instruments/Genres/Authors, confirmed Sample type,
  and Collection order when applicable. Never include unaccepted suggestions.
- Also include effective musical values and automatic/manual provenance under
  [Musical Analysis](musical-analysis.md), distinguishing Unknown/Not applicable.
  Usable automatic estimates need no user acceptance; uncertain/stale candidates
  are not effective values and are not exported as confirmed data.
- Exclude absolute source paths, personal notes, Favorite marks, UserProfile, and
  operation history. Declared Author credits remain included as chosen catalog
  metadata; excluding personal profile data does not make credits anonymous.
- Describe actual results, identifying failed/omitted items on partial output
  without exposing absolute paths. A missing/failed requested manifest makes the
  requested export partial even when all audio copies succeeded. Do not claim a
  manifest was delivered until its publication succeeds; handle its destination
  collisions under the same no-overwrite policy.
- After retrying a partial export, publish a new manifest file with a unique,
  reviewed versioned filename instead of replacing the previous manifest. Identify
  which file describes the cumulative verified output and link the retry result to
  its original export. Earlier manifests remain descriptions of their publication
  state; never silently rewrite them. Output-version naming is distinct from the
  manifest schema version.

## Execution and Recovery

- Share the serial confirmed queue and persistent Operation history under
  [Operation Execution](operation-execution.md). Continue independent failures;
  allow cancel/ordinary exit at safe file boundaries, retaining completed copies
  and reporting failed/unprocessed work. No automatic rollback or original deletion.
- Verify copied audio content before claiming an item complete. Persist verifiable
  source/destination outcomes. On interruption reconcile actual outputs before
  offering manual continuation; never blindly overwrite or replay completed copies.
- Retry failed/unprocessed scope only after revalidation and renewed review when
  scope/impact changes. Existing output files require verification; they are not
  automatically successful because names/sizes match. Uncertain outputs block
  their own retry until reconciled, without implying unrelated copies failed.
- Deleting export history never removes exported files or original audio.

## Remaining Delivery Contracts

Define exact manifest schema/version/filename, identity encoding, output-root and
relative-path resolution, bounded scope snapshots, source/destination validation,
temporary publication, full-copy verification, journal/recovery checkpoints,
versioned manifest publication/cumulative-result verification after retries, IPC,
and review/results UI.
These are delivery contracts, not shipped export support.
