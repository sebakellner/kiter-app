# Standalone Classification Review & Execution

Delivers the remaining Classification workflow for existing catalog Samples/Packs:
standalone catalog-backed review, rejection memory, and confirmed execution.
Spec owner: `.agents/docs/features/classification.md` (§Review and Rejection
Memory, §Confirmed Execution, §Remaining Workflow Delivery).

## Specs

S1 — "Renderer presents preparation/staged choices; main coordinates authoritative
preparation, revalidation, and execution. Validate renderer decisions against
reviewed state through narrow typed preload operations. DB worker owns bounded
reads and transactional writes under [Architecture]."

S2 — "Deliver Genre operations/aliases/pure recognition, then standalone review
and execution, then integration with reviewed import and the shared queue. Each
executable workflow must include its agreed persistence/recovery guarantees.
Preserve preview, Favorites, and authorized native dragging throughout."

S3 — "Remaining implementation contracts: future catalog updates, tokenization
punctuation edge cases, standalone catalog-backed batch snapshot adapters and
rejection storage, persisted draft-to-catalog identity promotion, execution
conflict payloads, durable confirmation, dependency/result queries, IPC, and
measured execution limits."

S4 — Rejection memory: "Remember explicit rejection for the particular
classification identity while its evidence is unchanged." A rejection record is
`{ contractVersion: 1, subject, target: { dimension, key }, evidenceKeys }`.
"Exported rejection intents contain `remember` records for explicit rejections
and `forget` scopes for accepted classifications. A future target transaction
must apply acceptance and clear that subject/classification's rejection records
atomically. Merely viewing, staging, exporting, or discarding changes nothing."

S5 — "Acceptances and rejections are staged, not saved immediately, even for
existing records. Explicit confirmation starts execution." "Revalidate before
execution. Changed relevant identities, evidence, or rules require fresh review
of affected targets, preserving still-valid decisions."

S6 — "Per Sample/Pack, accepted assignments, required vocabulary creation, and
explicit rejections commit together or not at all. Existing shared vocabulary
committed by another target remains valid. Type decisions are included in that
transaction."

S7 — "Standalone classification works on selected existing Samples/Packs without
reimport. Continue after individual failures, report each outcome, and preserve
successful targets. Retry failed targets after revalidation and fresh review
when needed; never label partial completion full success."

S8 — "Process selected Packs before dependent Samples. A failed Pack leaves
Samples whose decisions depend on its change unprocessed; unrelated targets
continue. Record dependency-blocked outcomes explicitly."

S9 — "The future committing owner must map new subjects to committed identities
atomically with assignments/rejections, never persist preparation-local handles
as catalog identities." (Standalone subjects are catalog UUIDs; the owner maps
required vocabulary creation to new records in the same transaction.)

S10 — "Batch standalone classification and reviewed import retain the
confirmed-operation contracts" (operation-execution.md §Shared Confirmed Queue):
one serial queue, persisted confirmed decisions, revalidation before start,
pending removal, restart as pending without auto-execution. Queue delivery
belongs to Operation Execution; standalone execution reuses its contracts.

## Tasks

T1 | S4 | main/db: additive migration for rejection memory (schema + worker read/remember/forget commands + tests) | DONE — 5fe2018 feat(db): add classification rejection memory storage (generated drizzle/meta/0001_snapshot.json accounts for most counted lines; authored code ~700)
T2 | S3 | main/services: standalone catalog-backed batch snapshot adapter (bounded worker read command + service composition over ClassificationBatchReview + tests) | DONE in two slices — 2a db read `16b12ea` (795 authored lines: strict schemas, worker read, tests); 2b service adapter 464 lines + 324-line test + docs/tracker (this commit)
T3 | S1 S5 | main+shared: authoritative standalone preparation/review service + narrow typed IPC (prepare/list/stage/acceptAll/discard, no writes) + tests | commit: feature branch slice 3
T4 | S6 S7 S8 S9 | main/db: confirmed execution slice (per-target transactions: vocabulary creation, assignments, type, rejection remember/forget; conflict payloads; dependency-blocked outcomes; durable results + queries) + tests | commit: feature branch slice 4
T5 | S1 | renderer: standalone review UI (preparation, staged choices, accept all, ambiguity views, execution + per-target results) + tests | commit: feature branch slice 5
T6 | S2 S10 | integration with reviewed import and the shared confirmed queue — blocked on Operation Execution delivery | commit: separate work once unblocked

## Log

L1 — user: "con que bloque seguimos del feature de categorias?"
L2 — user: "hagamos el workflow de classification"
L3 — exploration: categories→instruments refactor already merged in main; pure
recognition, persistent vocabulary, single-sample preview/apply, sample-type
editor, alias updates, and the internal batch contract/session review core are
implemented; rejection storage, standalone catalog-backed preparation, execution,
IPC, and UI remain (classification.md §Remaining Workflow Delivery).
L4 — decision: scope this feature to standalone review/execution on existing
catalog Samples/Packs; Genre/Instrument management UI stays in catalog-organization
("Pack, Instrument, and Author Views"); shared-queue integration (T6) waits on
Operation Execution delivery.
L5 — T1 done: rejection memory storage (classification_rejections STRICT table,
read/apply worker commands, bounded reads with token, corruption defense).
Commit 5fe2018; full suite 292/292 green.
L6 — T2 done: standalone catalog snapshot adapter. Bounded worker read
`read-standalone-classification-context` (100-row vocabulary/alias pages pinned by
the first page token, complete target echo on every page) plus
`prepareStandaloneReview`/`refreshStandaloneReview` composing it with rejection
memory over `ClassificationBatchReview`: cataloged root/folder/filename evidence
deduplicated across overlapping roots, Pack root-name evidence, origin-Pack Genre
evidence, per-target read-state tokens, and echo-digest drift detection that answers
STALE_REVIEW instead of publishing a mixed snapshot. Neither path writes the
catalog or grants execution. Commits: 2a db read `16b12ea`; 2b service adapter,
docs and tracker in this commit. Focused tests 11/11; full suite 303/303;
typecheck, typecheck:tests and lint clean.
L7 — test corrections while finishing T2 (the pre-written T2 tests never ran): the
seeded catalog already owns an active House Genre, so the review reports 2 required
creations (not 3) and the Pack-Genre fixture assigns that existing Genre through
`listGenres` instead of `createGenre`, which correctly rejects a duplicate term; the
worker-schema test now types its deliberately invalid payloads as untrusted input so
the test project typechecks.
L8 — slice boundary record: slice 2a (795 lines) and 2b (837 lines) each exceed the
~400 authored-line guidance because strict schemas and their tests dominate the
diff; the remaining tasks stay one slice each (T3 preparation/review service + IPC,
T4 confirmed execution, T5 renderer review UI).
