# File Organization

Read when changing physical audio rename, relocation, or centralization. These
business rules are agreed, not implemented filesystem workflows.
[Domain Model](../domain-model.md) owns Sample identity and organization;
[Architecture](../architecture.md#safe-file-operations-planned) owns recoverable
filesystem/catalog coordination. Presentation-name editing is a separate catalog
operation and never implicitly renames audio.

## Reviewed Scope and Names

- Support individual physical renaming and reviewed batch naming. Initial batch
  templates combine the original filename without extension, fixed text/prefix,
  and a sequence counter in reviewed order. Preserve the audio extension and
  allow individual corrections in the plan. Metadata-driven naming is outside
  this initial template scope.
- Support moving one or multiple Samples to a selected folder. Centralization
  moves selected Samples into a user-chosen local folder under the convention
  below; it is not copy-only export and does not create new Sample identities.
- Show every source, final filename, destination, registration change, affected
  reference scope, and conflict before confirmation. Revalidate before each action.
- Never overwrite or merge. Resolve collisions by an explicitly reviewed new
  name or exclusion from the plan. Suggested unique suffixes require review of
  the final result. Destinations occupied by other Samples remain conflicts.
- Block names incompatible with macOS/Windows until corrected in review. Cover
  reserved names, characters, path segments, and actual destination limits; never
  silently replace invalid characters. Physical naming preserves presentation-name
  overrides; without an override, the displayed actual filename follows the change.
- Preserve IDs, Favorites, origins, Collections, and direct classifications/credits.
  Destination outside registered coverage requires reviewed source registration,
  without importing other files. Moving Samples does not transfer the Pack's
  source-registration identity/association; whole-root recovery is a separate
  [source relinking](catalog-organization.md#source-relinking--agreed-baseline-not-implemented)
  workflow.

## Kiter Centralization Convention

This is Kiter's initial convention, not a claim of an industry standard or a
hierarchy between Category records. Use confirmed direct Categories to propose
one physical destination per Sample; no inferred assignment or audio duplication.

| Category | Relative destination |
| --- | --- |
| Drums | `Drums` |
| Kick, Snare, Clap, Hi-Hat, Cymbal, Tom, Percussion | `Drums/<Category>` |
| Bass | `Bass` |
| 808 | `Bass/808` |
| Synth, Lead, Pad, Keys, Piano, Organ, Guitar, Strings, Brass, Woodwinds | `Instruments/<Category>` |
| Vocals | `Vocals` |
| FX | `FX` |
| Riser, Impact, Texture | `FX/<Category>` |
| No unambiguous mapped Category | `Uncategorized` fallback, with review |

- Propose a destination only when mapped Categories identify one choice. Multiple
  mapped choices require an explicit choice of one destination. A generic family
  Category does not silently lose to an instrument Category. With no mapped choice,
  propose Uncategorized. Categories remain unchanged in all cases.
- Permit changing destination folders for individual Samples or explicit groups
  before confirmation, including custom classifications. This initial delivery
  saves the confirmed plan, not reusable persistent layout presets.
- The mapping is an explicit plan-generation vocabulary, not authority to infer
  identity from names or silently retarget stored plans after Category changes.
  Exact mapping identity/update behavior is a delivery contract under classification
  identity rules. Loop/One-Shot and Genre do not determine this initial layout.

## Verified Execution and Partial Outcomes

- Use the shared serial queue and persistent Operation history under
  [Operation Execution](operation-execution.md). Persist plans, intent, item
  outcomes, and recoverable filesystem/catalog checkpoints. Continue independent
  items after failures, reporting completed, failed, partial, and unprocessed work.
- Allow cancellation between files; finish the current file to a safe boundary.
  Ordinary exit also waits for that boundary, persists the outcome, and starts no
  more files/operations. After interruption reconcile actual files and catalog
  before manual continuation. Block retry of uncertain items until reconciled;
  never blindly repeat copy, rename, or source deletion.
- When relocation requires copy then deletion, verify full content equality of
  the destination and revalidate that the source has not changed before retiring
  it. Size/mtime and successful decoding alone are insufficient. Never delete the
  last valid copy or a changed source. Same-volume renames also require source,
  conflict, authorization, and recoverable catalog coordination checks.
- If a verified destination is ready but original deletion fails, use the verified
  destination as the Sample's source and report a partial movement with a remaining
  physical original. Reattempt only explicitly authorized cleanup after renewed
  validation of both files; never automatically delete it on restart. That leftover
  copy does not automatically become another catalog Sample. Protect its canonical
  location as an original pending cleanup so rescans cannot automatically import
  it. Show it in the operation result; either reviewed cleanup or explicit retention
  as an independent copy resolves that protection. Do not silently catalog it when
  removing protection; independent import still follows reviewed import rules.
- Other failures preserve verified recoverable copies and report disk/catalog
  state accurately; cancellation does not undo successful actions. Revalidation
  and renewed review apply when retry scope or impact changes.
- Before mutating the loaded Sample's physical file, require Stop preview if
  playing. After successful source update, reauthorize the destination, revoke
  the former capability, and load paused at zero without the prior sequence or
  Loop/advance modes. Failure never resumes audio automatically. Reconcile an
  uncertain source before offering playback/drag; unrelated audio remains usable
  subject to authorization.

## Remaining Delivery Contracts

Define template syntax/counter details, Category mapping identities, bounded plan
queries, destination authorization/registration transactions, cross-platform name
validation, full-content verification, temporary publication, filesystem journals,
source-version/analysis invalidation, pending-original protection records, cleanup
review, IPC, recovery and failure tests, and visual review/progress controls.
These technical contracts must preserve the agreed business outcomes and must not
be represented as an implemented capability.
