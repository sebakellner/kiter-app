# Open Decisions

Read when planning a delivery slice, assessing beta readiness, or asking "what is
still undefined". This document tracks decisions that remain open for the beta
already agreed in [Beta Scope](beta-scope.md). It does not change scope, add
requirements, or mark any row delivered: it only names, for each open item, what
must be decided, what it blocks, the evidence that closes it, and who decides.

Record every approved outcome in [Approval Log](#approval-log) with the evidence
that closed it, then move the resulting executable contract into the owning guide.
An implementation choice made without the named evidence does not close an entry.

Decider values: **Product** (the human product owner decides), **Engineering**
(a technical contract to be specified and reviewed), **Validation** (closes only
with measured evidence on representative data, hardware, or packages).

## Delivery Contracts Still To Specify

These are not product questions: the business rules are agreed in the owning
guide and only their executable contract is missing. They block implementation,
not scope. [Beta Scope](beta-scope.md#planned-delivery-sequence) requires each
slice to define its exact executable contracts before implementation.

| ID  | Open decision                                                                                                          | Owning guide                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Exact executable contracts for each delivery slice in the agreed six-stage sequence.                                   | [Beta Scope](beta-scope.md#planned-delivery-sequence)                             |
| D2  | Import commit/result queries and the exact contract for result membership and grouped reimport, or an explicit block.  | [Import](features/import.md) (`:131`, `:643`)                                     |
| D3  | Exact persistence and transition contracts for Interrupted, Needs-review, and verification states in the shared queue. | [Operation Execution](features/operation-execution.md) (`:94`)                    |
| D4  | Search matching/approximation contract and measured execution limits per result set.                                   | [Search](features/search.md) (`:16`)                                              |
| D5  | Classification vocabulary/alias/credit queries and measured execution limits.                                          | [Classification](features/classification.md) (`:826`)                             |
| D6  | Source relinking, registration lifecycle, and their execution/recovery contracts.                                      | [Catalog Organization](features/catalog-organization.md) (`:506`, `:572`, `:597`) |
| D7  | Filesystem verification/recovery contract for rename, move, and centralization, including pending-original management. | [File Organization](features/file-organization.md)                                |
| D8  | Export layout/manifest representation and partial-output/recovery contract, including manifest versioning.             | [Export](features/export.md)                                                      |
| D9  | Durable task/investigation support beyond the current analysis and operation journals.                                 | [Domain Model](domain-model.md) (`:651`)                                          |

After approval, D1 shrinks: a slice contract that lands in the owning guide
removes that row.

## Musical Analysis

**D10 — Analyzer selection and calibration.** Decider: **Product** + **Validation**.

- **Decision:** which local analyzer, which detection modes and codecs it actually
  covers, the acceptance/ambiguity thresholds, BPM numeric representation and
  precision, and canonical tonic spelling.
- **Blocks:** the BPM/tonality row of [Beta Scope](beta-scope.md#included-scope-and-observable-acceptance)
  and its exit gate; search filters, inspector presentation, and export manifests
  that consume effective musical values.
- **Closes when:** [Musical Analysis § Remaining Delivery Contracts](features/musical-analysis.md#remaining-delivery-contracts)
  is resolved and detection is validated on representative audio, recording
  supported modes/codecs, ambiguity handling, and known gaps.
- **Not closed by:** a chosen library, a passing mock, or the manual mode
  vocabulary alone.

## Measurable Budgets

**D11 — Large-library performance budgets.** Decider: **Product** + **Validation**.

- **Decision:** the agreed measurable numbers for load time, memory, and
  responsiveness across search, analysis, import, and playback, plus the
  representative library used to measure them.
- **Blocks:** any claim of scalability, and the exit gate that forbids claiming
  unmeasured capacity; may change indexing and bounded-work design.
- **Closes when:** budgets are agreed as delivery contracts and measured against
  representative data as described in [Architecture § Analysis and Large Libraries](architecture.md#analysis-and-large-libraries).

## Visual Design

**D12 — Deferred visual design and prototype validation.** Decider: **Product**.

- **Decision:** the visual shape of the sessions whose behavior is agreed but whose
  design was deferred: reviewed import, classification review, global search
  results, import results, source relinking, filesystem organization, export,
  operation history, and the remaining profile/presentation surfaces.
- **Blocks:** implementation of those journeys; several guides state that visual
  design and prototypes remain deferred.
- **Closes when:** each journey gets an agreed design or prototype recorded with
  its owning guide. See [UX Design](ux-design.md) (`:703`-`:731`),
  [Import](features/import.md) (`:24`), [Search](features/search.md) (`:16`),
  [Classification](features/classification.md) (`:826`),
  [Catalog Organization](features/catalog-organization.md) (`:8`),
  [Playback](features/playback.md) (`:7`).

## Platform and Release

These block a distributable beta. [Release Process](release-process.md) owns the
procedure; the decisions themselves are still open.

**D13 — Minimum OS versions and CPU architectures.** Decider: **Product**.

- **Decision:** the minimum macOS and Windows versions and the architectures
  shipped for each.
- **Blocks:** signing, packaging targets, and any support claim.
- **Closes when:** recorded and validated on real hardware
  ([Release Process § Current Status](release-process.md#current-status)).

**D14 — Distribution mechanics.** Decider: **Product**.

- **Decision:** artifact identity (replacing template product/publishing values),
  distribution channel, signing and notarization, update delivery, and the
  rollback/recovery approach for a published build.
- **Blocks:** publishing anything, including a signed artifact validation.
- **Closes when:** the chosen channel is configured and an unmodified signed
  artifact is installed, launched, and validated
  ([Release Process](release-process.md#current-status),
  [Beta Scope § Beta Exit Gates](beta-scope.md#beta-exit-gates)).

**D15 — Beta feedback and reporting channel.** Decider: **Product**.

- **Decision:** how beta users report failures, and what diagnostics may be
  attached under [Logging and Privacy](common-guidelines.md#logging-and-privacy).
- **Blocks:** the exit gate that requires the channel before publication; affects
  what the app is allowed to record and export.

**D16 — Windows qualification plan.** Decider: **Validation**.

- **Decision:** which Windows versions and machines are used, and which suites run
  there (Node backup/worker tests, Electron integration, packaged runner adapted to
  `.exe`/`resources`, alternate-drive destinations, locked files, non-overwrite
  publication, restart interruption, original preservation).
- **Blocks:** the "equivalent core workflows on both platforms" claim.
- **Closes when:** the recorded results exist
  ([Release Process § Remaining platform qualification](release-process.md#remaining-platform-qualification)).

**D17 — DAW acceptance matrix.** Decider: **Product** + **Validation**.

- **Decision:** which DAWs, versions, and audio formats count as beta evidence for
  original-file dragging and playback on each platform.
- **Blocks:** the playback/DAW row and any compatibility statement; a mocked drag
  test is not evidence.
- **Closes when:** real drops are recorded per DAW/format/platform.

## Not Open

Do not re-litigate these without an explicit scope revision: the required feature
blocks themselves, both target platforms, and the excluded capabilities listed in
[Beta Scope § Outside This Beta's Approved Scope](beta-scope.md#outside-this-betas-approved-scope)
(Kits, Tags, accounts, cloud sync, multiple Libraries/profiles, named favorite
lists, audio synthesis/editing/transcoding, reusable layout presets, advanced
search syntax, harmonic-compatibility inference, third-party manifest
interchange).

## Approval Log

Newest first. Every approved decision records its evidence; a decision without
evidence stays open above.

| Date | ID  | Decision | Evidence |
| ---- | --- | -------- | -------- |
| —    | —   | —        | —        |
