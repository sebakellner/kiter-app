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

T1 | S4 | main/db: additive migration for rejection memory (schema + worker read/remember/forget commands + tests) | commit: feature branch slice 1
T2 | S3 | main/services: standalone catalog-backed batch snapshot adapter (bounded worker read command + service composition over ClassificationBatchReview + tests) | commit: feature branch slice 2
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
