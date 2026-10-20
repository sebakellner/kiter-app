# Classification

Read when changing classification suggestions, recognition vocabulary, aliases,
evidence, rejection memory, or standalone classification. This guide owns their
feature behavior and technical direction. [Domain Model](../domain-model.md)
owns Instrument, Genre, and Sample-type meanings and validation;
[Search](search.md) owns queries and filters.

## Status and Scope

The reviewed classification workflow below is agreed but not implemented. A pure
recognition engine and initial in-code vocabulary are implemented as described
under Architecture and Delivery. Current Author/Instrument DB operations and
Instrument list/create/rename IPC do not deliver the reviewed workflow. Suggestions
remain distinct from confirmed user organization.
The shared batch contract and session review core are also implemented internally;
catalog-backed batch preparation, rejection storage and confirmed execution remain
pending.

- Suggest Instruments and Genres from filenames and folder names. Sample type
  has the separate rules below; Author credits and musical BPM/key hints are
  outside this delivery. No audio analysis is used for classification.
- Recognition is local and deterministic, not approximate library search.
- Reuse matching library entries or propose creating missing recognized entries
  with their assignments. Create nothing before confirmed execution.
- Existing library names, including custom entries, are recognition terms without
  requiring duplicate aliases. Adding vocabulary/rules does not automatically
  generate background proposals or classify existing content.

## Initial Vocabulary

### Genre Seed

The approved initial catalog contains 26 independent Genres: House, Tech House,
Deep House, Techno, Trance, Drum and Bass, Dubstep, UK Garage, Breakbeat, Disco,
Hip Hop, Trap, R&B, Soul, Funk, Pop, Reggaeton, Dancehall, Afrobeats, Rock, Jazz,
Blues, Folk, Classical, Ambient, and Cinematic. This is a bounded starting
selection across electronic, urban, acoustic, and cinematic music, not an
exhaustive catalog or a limit on custom Genres. Domain Model owns its flat,
user-editable lifecycle rules. Fresh libraries now persist this seed; existing
libraries receive offered vocabulary without automatic Genre creation.

### Instrument Recognition Terms

The approved 26 independent terms are Drums, Drum Breaks, Kick, Snare, Clap, Hi-Hat, Cymbal,
Tom, Percussion, Bass, 808, Synth, Lead, Pad, Keys, Piano, Organ, Guitar, Strings,
Brass, Woodwinds, Vocals, FX, Riser, Impact, and Texture.

These are recognition terms, not automatically created Instrument records. Piano
does not imply Keys; 808 does not imply Bass. Loop/One-Shot are a separate fixed
Sample-type dimension, not Instruments.

### Initial Aliases

- Instrument Drums: Drum.
- Instrument Drum Breaks: Drum Break.
- Instrument Kick: Kicks, Bass Drum, Bass Drums, BD.
- Instrument Snare: Snares.
- Instrument Clap: Claps.
- Instrument Hi-Hat: Hi Hat, Hi Hats, Hihat, Hihats, Hats.
- Instrument Cymbal: Cymbals.
- Instrument Tom: Toms.
- Instrument Percussion: Perc.
- Instrument Vocals: Vocal, Vox.
- Instrument FX: Effects, SFX.
- Instrument Riser: Risers.
- Instrument Impact: Impacts.
- Instrument Texture: Textures.
- Genre Drum and Bass: DnB, D&B.
- Genre Hip Hop: Hip-Hop, HipHop.
- Genre R&B: RnB, R and B.
- Genre UK Garage: UKG.

Variants define recognition behavior, not mandatory separate alias rows; case
and equivalent separators should not produce redundant records.

## Alias and Recognition Identity

The application and stored dimension is `instrument`. Vocabulary keys use the
`instrument:` prefix, including custom entity keys and supplied alias identities.
These identities remain stable within the current development baseline and its
future supported upgrades. Pre-baseline prototype catalogs are not imported.

- Supplied vocabulary and aliases have stable catalog keys; Genres and aliases
  have identities independent of names. Track renamed, deleted, and newly offered
  content without silently restoring defaults. Re-creating an entry gives it a
  new identity, not its former assignments or historical identity.
- Keep recognition vocabulary separate from library records: a recognized term
  may not yet have an Instrument/Genre record.
- Users can add aliases to supplied/custom Instruments and Genres. An alias has
  one target per dimension, across supplied and custom aliases. Reassignment is
  explicit; the same term may target one Instrument and one Genre independently.
- An alias cannot match a different entry's name within its dimension. Enforce
  conflicts when creating/reassigning aliases and creating/renaming entries.
- Included aliases are editable, reassignable, and deletable like custom aliases.
  Updates respect those changes and offer new aliases for voluntary incorporation.
- Renaming an entry preserves identity, assignments, and aliases. Its new name
  becomes a recognition term; the old name is not automatically an alias.
- Deleting an entry includes all attached aliases in impact review and deletes
  them, freeing their terms. No prior reassignment is required. Included
  recognition vocabulary may later propose re-creating the deleted classification,
  only on acceptance, without restoring assignments or custom aliases. This does
  not authorize automatic restoration through updates.

## Evidence Scope

- For Samples, use the filename, eligible root's own name, and descendant folder
  names along the relative path. Exclude ancestors above that root.
- During import, combine evidence from selected roots containing the included
  file, independently of the root chosen for Pack destination. Outside import,
  combine all registered root associations of selected Samples.
- Deduplicate proposals by classification, retaining every distinct supporting
  occurrence. Exposing the same folder through another root is not new evidence.
- For a Pack, use only supplying root names, not descendant names, filenames, or
  aggregated Sample classifications. Reimport uses selected associated roots;
  explicit classification uses all registered associated roots.
- Explicit classification can use registered paths when audio is unavailable.
  Identify them as cataloged-location evidence, not proof of existence, access,
  or analysis. This does not bypass complete discovery for new imports or
  authorize audio through stored paths.

### Pack Genre Evidence

- Offer Pack Genres to Samples during import and explicit classification, merging
  with path-derived proposals while identifying the Pack as distinct evidence.
  Assignment still requires acceptance; changing Pack Genres triggers no background
  proposals. Pack Instruments do not implicitly gain this behavior.
- During import use the reviewed resulting origin: retained/destination Pack,
  including Genres accepted in preparation. Standalone Samples have no Pack
  evidence. Changing origin decisions refreshes affected proposals for review.
- In standalone classification of Packs and Samples together, selected Samples
  may use staged accepted Pack Genres. Selecting a Pack does not select members.
  Execution dependencies are specified below.

## Recognition Rules

- Match complete words/phrases and explicit aliases. Do not infer unknown
  abbreviations, spelling corrections, or arbitrary substring matches.
- Normalize Unicode to NFC and lowercase locale-independently; preserve accents.
- Before lowercasing recognition text, separate lowercase-to-uppercase word
  boundaries: `VintageDrums` recognizes Drums. Apply the same split to matched
  names/aliases so explicit mixed-case aliases remain usable. Do not split
  all-uppercase runs or letter/number boundaries. Stored alias uniqueness keys
  retain their existing case-insensitive normalization; new recognition collisions
  are reported as ambiguities rather than merging existing entries.
  Accent-free variants require aliases.
- Spaces, hyphens, underscores, and dots are equivalent word separators. Exclude
  the audio filename extension. Do not automatically separate letters/numbers:
  `kick_01` recognizes Kick, but `kick01` needs an alias. Standalone 808 is valid.
- Preserve meaningful symbols such as `&` in R&B/D&B; equivalence to words
  requires aliases. Evaluate each path component separately, never joining
  phrases across folders. Source/display names and uniqueness comparison do not
  change under recognition normalization.
- Within a dimension, prefer the most specific phrase over fully contained
  matches in the same span. `tech_house_kick.wav` suggests Tech House and Kick,
  not House unless independently supported. This is not Genre hierarchy.
- Explicit exception: an unambiguous supplied Drum Break/Drum Breaks phrase
  proposes both Drum Breaks and Drums, with the same phrase as evidence. The
  companion Drums proposal requires its vocabulary target to remain available;
  this is not a hierarchy or inheritance rule. Renamed terms/custom aliases do
  not imply Drums unless they still match that explicit phrase. Loop and Genres
  require independent evidence. Letter/number boundaries remain intact, so
  `Breaks1` alone does not match `Breaks`.
- Different path components do not override one another for Instrument/Genre:
  `Snares/kick_01.wav` may suggest both, each with evidence, for user review.

### Ambiguity

- Never merge or rename distinct records automatically because names such as
  Lo-Fi and Lo Fi normalize to the same recognition phrase.
- New/changed names and aliases require explicit recognition-conflict resolution
  within a dimension, in addition to domain name-uniqueness checks.
- Existing unresolved conflicts omit the ambiguous match and explain its possible
  targets; independent matches continue. Preserve existing data.
- Partially overlapping phrases where neither contains the other omit only the
  ambiguous span. Fully contained phrases follow most-specific precedence.
- Instrument, Genre, and Sample-type recognition dimensions are independent.

## Sample-Type Suggestions

Use [Sample Type](../domain-model.md#sample-type--agreed-not-implemented) for its
meaning, optionality, and fixed values.

- Recognize Loop from Loop/Loops and One-Shot from One Shot/One Shots/Oneshot/
  Oneshots, including equivalent separators. Do not initially recognize OS or
  standalone Shot. Custom aliases may target either fixed type under the same
  conflict/update/management rules, without creating new types.
- Use the same root scope and unavailable-audio rules above. Do not infer type
  from Instrument, Genre, Pack, other Samples, duration, or audio analysis.
- Explicit filename clues take precedence over folders; otherwise use the nearest
  folder with a clue. `Loops/kick_one_shot.wav` suggests One-Shot.
- Contradictory clues within a component or remaining at equal priority produce
  no type proposal and an explanation. Preserve the existing type or unknown,
  allow manual editing, and do not block import. Do not conceal ambiguity by
  falling back to lower-priority evidence. Deduplicate folder occurrences across
  roots before applying priority.
- Confirmed types survive reimport, whether manually chosen or accepted. Offer a
  differing type as an explicit replacement, showing saved/proposed values.
  Never replace automatically based on how the old value was assigned.
- Type follows the review/rejection rules below. Clearing to unknown is not a
  rejection. Group decisions must identify replacements of existing types.
  Commit type decisions with the Sample's other classification changes.

## Review and Rejection Memory

- Accept/reject individually or for explicit groups of targets and proposals.
  Instrument/Genre proposals add assignments without replacing existing ones;
  Sample-type replacement follows its single-value rule above. Pack-origin
  conflicts retain individual keep/assign review under [Import](import.md).
- Provide an explicit Accept all action for the current preparation's reviewable
  proposals. Show its complete target/proposal scope, including items outside the
  visible page or filters, any required vocabulary creation, and existing-type
  replacements before applying the group decision. Keep affected targets and
  evidence consultable through bounded pages. Accept all stages acceptances;
  separate execution confirmation is still required. Ambiguous matches remain
  explained without inventing proposals or resolving them automatically. Rejection
  memory still controls which proposals are offered under the rules below.
- Unreviewed suggestions neither block import nor count as rejected; offer them
  again later. Rescans/reimport preserve confirmed organization.
- Acceptances and rejections are staged, not saved immediately, even for existing
  records. Explicit confirmation starts execution. Closing preparation retains it
  for the session; discarding saves nothing. No unconfirmed restart recovery.
- Revalidate before execution. Changed relevant identities, evidence, or rules
  require fresh review of affected targets, preserving still-valid decisions.
  Never reinterpret decisions or silently create replacement classifications.
- Remember explicit rejection for the particular classification identity while its
  evidence is unchanged. Alias/rule updates alone do not reset it for that identity;
  recognizing the same clue as a different classification may offer a new proposal.
  Rejecting Drums must not suppress Drum Breaks supported by the same phrase.
  New/changed supporting evidence, including a distinct newly recognized clue,
  can justify another proposal. The rules apply equally to Samples and Packs.
- Case/separator-only changes are the same normalized clue. Renaming a target
  preserves rejection identity. A distinct eligible location can supply a new
  occurrence. Pack evidence is identified by Pack + Genre identity, not Pack name.
- Removing an assignment is not rejection; it can be suggested again unchanged.
- Explicit classification may include rejected proposals on request. Viewing does
  not clear memory; confirming acceptance replaces the rejection atomically with
  the assignment. Discard preserves it; there is no blanket history reset.
- Retain matched terms, source occurrences, and rule provenance for explanation
  and stale checks, but identify evidence independently of rule versions.

## Confirmed Execution

- Per Sample/Pack, accepted assignments, required vocabulary creation, and explicit
  rejections commit together or not at all. Existing shared vocabulary committed
  by another target remains valid. Type decisions are included in that transaction.
- Standalone classification works on selected existing Samples/Packs without
  reimport. Continue after individual failures, report each outcome, and preserve
  successful targets. Retry failed targets after revalidation and fresh review
  when needed; never label partial completion full success.
- Process selected Packs before dependent Samples. A failed Pack leaves Samples
  whose decisions depend on its change unprocessed; unrelated targets continue.
  Record dependency-blocked outcomes explicitly.
- Import-specific transactions/failure/whole-batch Retry belong to
  [Import](import.md#commit-boundaries). Queueing, cancellation, continuation,
  close/restart, durable history, and verifiable recovery belong to
  [Operation Execution](operation-execution.md).

## Architecture and Delivery

### Implemented Pure Recognition Slice

`src/main/services/classification/` exports `createClassificationRecognizer` and
the initial recognition vocabulary. The compiled recognizer accepts an effective
vocabulary with explicit target identities, names, and aliases and processes one
Sample/Pack at a time. It returns Instrument/Genre/type proposals, path and Pack
Genre evidence, and explicit ambiguous matches without reading or writing data.

- Initial terms have stable keys independent of display names. The in-code Genre
  vocabulary also supplies the persistent initialization described below.
- Callers supply eligible path components, excluding ancestors outside registered
  scope. Each carries an occurrence identity, root/folder/filename kind, observed
  or cataloged availability, and distance from the file. Distances are comparable
  across roots; duplicate occurrences are recognized once. Packs use roots only.
- Tokenization uses NFC/lowercase, equivalent whitespace/hyphen/underscore/dot
  separators, Unicode letter/mark/number runs, and separate preserved punctuation
  tokens. Only the filename's final extension is removed. Letter/number boundaries
  are not split. Evidence includes normalized clue, matched name/alias, token span,
  original component text, occurrence, and `path-v2` provenance (case-boundary
  splitting before lowercasing). Existing libraries use the new recognition rule
  without inserting aliases or changing stored names/keys.
- Most-specific phrases suppress contained matches within each component and
  Instrument/Genre dimension. Conflicting targets or partially overlapping phrases
  omit ambiguous matches; independent matches continue. Sample type uses filename
  first, then the nearest eligible folder, with no fallback from contradictions.
- Pack Genre evidence supplied by the caller merges by target identity and
  deduplicates Pack/Genre pairs. The engine does not derive Pack assignments.
- Callers must resolve effective vocabulary edits and library identities before
  compilation. The engine does not enforce alias-write conflicts, validate paths
  or authorize audio, choose existing records, stage decisions, filter remembered
  rejections, or persist results. Those belong to subsequent delivery slices.

### Implemented Persistent Vocabulary Slice

- An additive STRICT migration adds Genres, independent Sample/Pack Genre
  memberships, recognition vocabulary mappings, and aliases. Existing catalog
  identities and organization are preserved under the protective-backup runner.
- Fresh libraries receive 26 Genre records, 25 Instrument recognition terms (no
  Instrument records), and the two fixed Sample types. Existing libraries receive
  offered Genres, reuse matching Instruments, and retain custom Instrument names.
- Vocabulary keys survive renames and deletion. Deleted targets and aliases have
  tombstones so reopening never restores defaults. Custom re-creation gets a new
  identity. Alias reassignment uses the alias ID explicitly; duplicate normalized
  terms in the same dimension reject with `NAME_CONFLICT`.
- Internal worker/DbClient commands provide Genre creation/rename/read/pagination,
  direct assignments and impact-checked removal, plus vocabulary/alias pages and
  alias creation/edit/reassignment/removal. Instrument name writes enforce alias and
  recognition conflicts. Removal reviews include aliases and Genre memberships;
  no renderer IPC or management UI is delivered by this slice.
- `loadCatalogRecognizer` compiles effective names and aliases through bounded
  worker pages. It recognizes offered terms for later explicit creation, omits
  retired entries, and preserves stable vocabulary keys for linked records.
- Future vocabulary updates, voluntary incorporation UI, authoritative review
  snapshots, rejected-proposal memory, and confirmed assignment execution remain
  pending. The adapter is not a stale-safe preparation/execution token.

### Implemented Single-Sample Preparation Preview

- Samples/Favorites expose Suggest classifications in the selected Sample's
  read-only inspector. It explicitly prepares one existing Sample and displays
  proposals, existing assignments, required creation, and ambiguity explanations.
  Session review retention and staged choices follow the implemented review slice
  below.
- `classification:prepare-sample` accepts a Sample UUID and bounded pagination,
  never renderer paths or vocabulary. Main authorizes the window; the worker
  reads source, registered root associations, vocabulary/aliases, assignments,
  and origin Pack Genres in one read transaction and runs the pure recognizer.
  No metadata, assignments, vocabulary, files, or rejection decisions are written.
- Evidence uses cataloged paths, explicitly labeled as such, without asserting
  current existence or audio access. Components include each eligible root and
  descendants only, deduplicating physical occurrences across overlapping roots;
  display-name overrides are not recognition clues. Unregistered roots contribute
  no path evidence. Pack Genres contribute separately through current origin.
- Output pages contain evidence rows, default 50 and maximum 100, with distinct
  proposal/ambiguity counts. Multiple evidence rows may share a proposal key.
  A SHA-256 read-state token is required beyond the first page; changed inputs
  return `STALE_REVIEW` and require a new preparation. No retained preparations
  or execution authorization are implied by this token.
- This first preview caps root associations at 100 and vocabulary/alias reads at
  10,000 each, failing explicitly rather than truncating recognition. These are
  implementation limits, not measured large-library performance guarantees.
- Multi-Sample scopes, rejection memory, and confirmed execution/recovery remain
  pending.

### Direct Single-Sample Suggestions — Adopted Simplified Workflow

This replaces the staged single-Sample review prototype. Batch/import review and
rejection-memory contracts elsewhere in this guide remain future workflows.

- Opening a selected Sample's inspector automatically loads suggestions and saved
  classifications. Show grouped Badges under Instruments, Genres and Sample type;
  evidence is collapsed under Why these suggestions? by default.
- Apply (+) saves one proposal immediately. Apply all saves every displayed
  actionable suggestion for this Sample; show required vocabulary creation inline.
  Ambiguities and existing assignments are excluded. Ignoring suggestions writes
  nothing. No Accept/Reject drafts, counters, extra confirmation, or review store.
- `classification:apply-sample` accepts Sample identity, current read-state token,
  and explicit proposal keys (maximum 100). An immediate worker transaction
  revalidates the complete scope, creates necessary vocabulary, and saves all
  selected assignments/type together or rolls everything back. Forged, missing,
  stale, and already-applied proposals cannot silently execute.
- This is an immediate short metadata action, outside the confirmed batch queue.
  No persistent preparation/history/restart continuation is promised. After an
  uncertain response or failure refresh saved data; never blindly replay a write.
  Source audio, Sample identity, Favorites and existing organization are preserved.
- Sample type is persisted with an additive nullable constrained column. Once
  assigned, differing automatic types are not offered by this short workflow;
  explicit replacement is available through the manual Sample-type editor below.
- Renderer reads bounded evidence pages (maximum 2,000 rows) under one token,
  groups duplicate proposals, and disables writes during loading, saving or errors.
  Successful writes refresh saved classifications. Reopening queries current data.
- Sample Info also exposes the [manual Instrument editor](catalog-organization.md#implemented-single-sample-instrument-editor).
  It also exposes the [manual Genre editor](catalog-organization.md#implemented-single-sample-genre-editor).
  While either is open, suggestion writes are disabled. Saving manual assignments
  refreshes suggestions; removal is not rejection memory.

### Implemented Manual Sample-Type Editor

Sample Info exposes Edit Sample type alongside Edit instruments and Edit genres.
It opens the shared anchored editor popover with a single-value native select:
Loop, One-Shot, or Unknown. React Hook Form owns the draft; Zod schemas in the
renderer/shared classification feature schema files validate fixed values. Unknown
is represented as `unknown` in the editor contract and persisted as SQL NULL.

- Save explicitly replaces a confirmed type, including an accepted suggestion.
  Cancel/Escape and application exit use the shared Save/Discard/Stay protection;
  outside clicks do not dismiss. Cmd/Ctrl+Enter saves; closing restores focus.
- `classification:read-sample-type` returns the saved value and a Sample/type-bound
  token. `classification:save-sample-type` revalidates it and updates only the type
  in one immediate worker transaction. Relevant changes reject with STALE_REVIEW;
  missing Samples and storage failures preserve prior data and the recoverable draft.
- Failed/uncertain writes require Reload saved type before another Save. Reload
  preserves the intended choice and exposes the current saved value for comparison.
- Saving refreshes suggestions. Differing automatic types remain omitted when a
  confirmed type exists; clearing to Unknown permits suggestions again and does
  not create rejection memory. Instruments, Genres, Favorites, origin, source audio,
  and other organization remain unchanged. This is a single-Sample short metadata
  edit, outside batch execution and its future combined inspector draft.

### Explicit Alias Updates

Instruments exposes Check vocabulary updates separately from the Sample inspector, with bounded
pages of new supplied aliases and an individual Add alias action. Checking never
writes data. Incorporation revalidates the displayed offer token transactionally,
rejects conflicts/stale offers, and records the supplied alias identity without
creating Instruments/Genres or assignments. Reopening Sample Info uses the updated
vocabulary automatically.

An alias is offered only when its supplied identity has never been incorporated;
edited, reassigned, and deleted supplied aliases are not restored. Retired targets
are excluded. Terms already in use appear blocked rather than being overwritten.
This delivers alias additions only, not general vocabulary-update management.

### Implemented Shared Batch Contract and Session Review Core

`src/shared/features/classification/batch-schemas.ts` owns strict, version-1
serializable schemas for snapshots, subjects, evidence, proposal targets,
rejections, review references, decisions, pages, and exported drafts.
`ClassificationBatchReview` in `src/main/services/classification/` implements
their internal session-only review behavior. The pure core does **not** change the
immediate inspector workflow, expose IPC/UI, read or write the catalog, or persist
rejection memory. Import now consumes its recognition, schemas and row/fingerprint
preparation through the [spooled import adapter](import.md#implemented-internal-import-classification-drafts--block-2-integration).
Authors and images are outside
this contract and reject as unknown fields.

Unlike the existing non-strict shared schemas, this versioned batch contract
deliberately uses `z.strictObject` to reject unknown fields rather than silently
strip them. Future extensions must explicitly declare supported fields in the
owning schemas and validate their behavior; do not relax strictness for reuse.

#### Identities and Caller Responsibilities

- A subject identifies a Sample or Pack by catalog UUID, or a new import target by
  preparation ID plus candidate/root ID. Existing entities use catalog identities;
  draft IDs are not reserved UUIDs. The future committing owner must map new subjects
  to committed identities atomically with assignments/rejections, never persist
  preparation-local handles as catalog identities.
- Instrument/Genre proposals bind a stable effective vocabulary key, current name,
  and existing entity UUID or explicit `null` for required creation. Sample type
  binds only `loop` or `one-shot`. Names are not identities. The caller resolves
  catalog/vocabulary bindings and omits ambiguous recognition results; the core
  rejects duplicate subjects/proposals and inconsistent bindings for the same key.
- Trusted main/worker callers assemble complete, bounded snapshots from eligible
  roots and effective vocabulary. Each subject carries a SHA-256 `stateToken`
  binding relevant source/root/origin, vocabulary/rules, and saved organization
  observations. The core neither creates nor authorizes that token. It does not
  prove filesystem existence, grant audio access, discover roots, or turn several
  reads into an atomic filesystem/catalog snapshot.
- Evidence retains the recognizer's original component text, matched term, token
  span, source availability and rule provenance. Recognition evidence/target types
  now live in shared domain contracts and are re-exported by the existing service.
  The immediate inspector's read-state/apply token is **not** this review protocol.

#### Version-1 Evidence and Rejection Serialization

- SHA-256 evidence keys hash UTF-8 compact JSON arrays. Path keys hash
  `["classification-evidence-v1", "path", occurrence, normalizedClueTokens]`.
  Version-1 clue normalization is NFC, lowercase-to-uppercase splitting before
  locale-independent lowercase, equivalent whitespace/hyphen/underscore/dot
  separators, and the current recognition punctuation-preserving tokenization.
  Changing these identity rules requires a new serialization version, not silently
  changing stored version-1 keys with a recognizer update.
- Occurrences are exact, caller-scoped location identities, shared across overlapping
  roots. Do not lowercase paths or use display names as occurrence identities.
  Component role, source availability, original spelling, matched name/alias,
  token offset, and rule version are explanation/staleness inputs, not evidence-key
  inputs. Repeated support at the same occurrence/clue is one rejection clue.
- Pack evidence hashes
  `["classification-evidence-v1", "pack-genre", packId, genreKey]`.
  A catalog Pack uses its UUID. `classificationPackEvidenceId` encodes a new Pack
  as compact JSON `["import-pack", preparationId, rootId]`, preventing collisions
  between preparations. Genre keys remain stable across renames; Pack presentation
  names do not participate.
- A rejection record is `{ contractVersion: 1, subject, target: { dimension, key },
evidenceKeys }`. Matching uses subject and stable classification identity plus
  evidence, not aliases or display names. Rejections never cross Samples/Packs,
  dimensions, or classification identities. Re-created classifications receive
  new identities; reassigned aliases can offer their new target.
- With all current supporting evidence keys covered by remembered rejections for
  that scope, a proposal is marked remembered and non-reviewable by default. Any
  new supporting occurrence/clue makes it reviewable again. Removing support alone
  does not erase memory for unchanged remaining clues. Explicit `includeRejected`
  makes remembered proposals reviewable without modifying their stored memory.
- Exported rejection intents contain `remember` records for explicit rejections
  and `forget` scopes for accepted classifications. A future target transaction
  must apply acceptance and clear that subject/classification's rejection records
  atomically. Merely viewing, staging, exporting, or discarding changes nothing.

#### Review, Groups, Freshness and Dependencies

- `getReference()` returns opaque review ID, monotonic revision, and SHA-256 token.
  Tokens bind the full normalized snapshot, remembered rejections, review mode and
  staged choices. Object property order and collection input order are normalized.
  No token is execution consent or a replacement for authoritative revalidation.
- `stage` validates an explicit group of 1–100 unique proposal keys atomically,
  supporting `accept`, `reject`, and returning to `unreviewed`. Assigned and hidden
  remembered proposals cannot be staged. `acceptAll` requires the complete current
  reference and stages every reviewable proposal, including unloaded pages and
  previously staged rejections. It has no implicit page/filter scope.
- `getSummary` reports complete scope counts, distinct required vocabulary
  creations, and existing-type replacements. `listProposals` exposes saved type,
  proposed type, replacement status, evidence and dependencies; `listAmbiguities`
  keeps omitted matches inspectable. Pages default to 50, maximum 100. Existing
  assignments are non-actionable; proposals never encode assignment removals.
- Every edit/refresh advances the revision and invalidates old page/group/export
  references. `refresh` accepts a newly authoritative snapshot and retains a choice
  only when subject/classification identity, exact evidence/provenance, bindings,
  relevant saved state, source-state token, and dependency fingerprints still match.
  Other targets retain valid decisions. Failed validation leaves the old draft
  unchanged. `discard` releases the owned snapshot and invalidates future access.
- A Sample Genre may depend explicitly on a selected Pack's proposed Genre. The
  core requires matching Pack evidence, rejects missing/cyclic/wrong-dimension
  dependencies, and prevents staged Pack evidence from omitting its dependency.
  Existing catalog Pack evidence needs no staged acceptance. New draft Pack
  evidence must refer to a Pack inside the same snapshot/preparation.
- Exported decisions place Packs before Samples. `dependencyBlocks` identifies
  accepted Sample decisions whose required Pack Genre is neither already assigned
  nor staged accepted. `dependenciesSatisfied` reports only this check: it does
  **not** claim confirmation/execution readiness. Upstream evidence/binding changes
  invalidate dependent choices, not unrelated targets. Actual execution failures
  and dependency-blocked durable outcomes remain future execution work.

#### Bounds and Validation Evidence

The internal in-memory core accepts at most 100 subjects, 2,000 proposals, 10,000
supporting evidence rows including ambiguity evidence, and 8 MiB serialized
snapshot content. A proposal retains at most 1,000 evidence rows; remembered
rejection inputs also cap total evidence keys at 10,000 and serialized content at
8 MiB. Import-local and review handles are at most 256 UTF-16 code units, allowing
encoded draft Pack evidence to fit the 4,096-unit evidence-identifier limit.
Limits reject explicitly;
there is no truncation, streaming input, large-library throughput claim, or whole
20,000-candidate in-memory review in this slice. Import's implemented adapter
composes bounded per-target chunks under its own complete spooled scope/token,
never splitting a global Accept all across independent review references.
Serialized-byte limits
are not process-memory budgets; parsing, indexes and defensive copies add overhead.

Pure tests cover serialization round trips, normalized evidence identity, independent
Drums/Drum Breaks rejections, alias/rename and changed-evidence behavior, explicit
rejection override, atomic groups, whole-scope Accept all beyond a loaded page,
type replacements, preserved assignments, stale/foreign references, refresh and
discard, Pack dependencies, detached outputs, strict schemas and resource limits.
Validation is local on macOS, not Windows or a packaged Electron/DAW workflow.

### Remaining Workflow Delivery

- Pure recognition combines included vocabulary, library names, and aliases into
  proposals/evidence; it never writes assignments.
- Renderer presents preparation/staged choices; main coordinates authoritative
  preparation, revalidation, and execution. Validate renderer decisions against
  reviewed state through narrow typed preload operations. DB worker owns bounded
  reads and transactional writes under [Architecture](../architecture.md).
- Deliver Genre operations/aliases/pure recognition, then standalone review and
  execution, then integration with reviewed import and the shared queue. Each
  executable workflow must include its agreed persistence/recovery guarantees.
  Preserve preview, Favorites, and authorized native dragging throughout.

Remaining implementation contracts: future catalog updates, tokenization punctuation
edge cases, standalone catalog-backed batch snapshot adapters and rejection storage, persisted
draft-to-catalog identity promotion, execution conflict payloads, durable confirmation,
dependency/result queries, IPC, and measured execution limits.
Visual design/prototypes remain deferred. These open technical contracts do not
reopen the business rules above or establish shipped capabilities.
