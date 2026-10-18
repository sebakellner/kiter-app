# Classification

Read when changing classification suggestions, recognition vocabulary, aliases,
evidence, rejection memory, or standalone classification. This guide owns their
feature behavior and technical direction. [Domain Model](../domain-model.md)
owns Category, Genre, and Sample-type meanings and validation;
[Search](search.md) owns queries and filters.

## Status and Scope

The reviewed classification workflow below is agreed but not implemented. A pure
recognition engine and initial in-code vocabulary are implemented as described
under Architecture and Delivery. Current Author/Category DB operations and
Category list/create/rename IPC do not deliver the reviewed workflow. Suggestions
remain distinct from confirmed user organization.

- Suggest Categories and Genres from filenames and folder names. Sample type
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

### Category Recognition Terms

The approved 25 independent terms are Drums, Kick, Snare, Clap, Hi-Hat, Cymbal,
Tom, Percussion, Bass, 808, Synth, Lead, Pad, Keys, Piano, Organ, Guitar, Strings,
Brass, Woodwinds, Vocals, FX, Riser, Impact, and Texture.

These are recognition terms, not automatically created Category records. Piano
does not imply Keys; 808 does not imply Bass. Loop/One-Shot are a separate fixed
Sample-type dimension, not Categories.

### Initial Aliases

- Category Kick: Kicks, Bass Drum, Bass Drums, BD.
- Category Snare: Snares.
- Category Clap: Claps.
- Category Hi-Hat: Hi Hat, Hi Hats, Hihat, Hihats, Hats.
- Category Cymbal: Cymbals.
- Category Tom: Toms.
- Category Percussion: Perc.
- Category Vocals: Vocal, Vox.
- Category FX: Effects, SFX.
- Category Riser: Risers.
- Category Impact: Impacts.
- Category Texture: Textures.
- Genre Drum and Bass: DnB, D&B.
- Genre Hip Hop: Hip-Hop, HipHop.
- Genre R&B: RnB, R and B.
- Genre UK Garage: UKG.

Variants define recognition behavior, not mandatory separate alias rows; case
and equivalent separators should not produce redundant records.

## Alias and Recognition Identity

- Supplied vocabulary and aliases have stable catalog keys; Genres and aliases
  have identities independent of names. Track renamed, deleted, and newly offered
  content without silently restoring defaults. Re-creating an entry gives it a
  new identity, not its former assignments or historical identity.
- Keep recognition vocabulary separate from library records: a recognized term
  may not yet have a Category/Genre record.
- Users can add aliases to supplied/custom Categories and Genres. An alias has
  one target per dimension, across supplied and custom aliases. Reassignment is
  explicit; the same term may target one Category and one Genre independently.
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
  proposals. Pack Categories do not implicitly gain this behavior.
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
- Different path components do not override one another for Category/Genre:
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
- Category, Genre, and Sample-type recognition dimensions are independent.

## Sample-Type Suggestions

Use [Sample Type](../domain-model.md#sample-type--agreed-not-implemented) for its
meaning, optionality, and fixed values.

- Recognize Loop from Loop/Loops and One-Shot from One Shot/One Shots/Oneshot/
  Oneshots, including equivalent separators. Do not initially recognize OS or
  standalone Shot. Custom aliases may target either fixed type under the same
  conflict/update/management rules, without creating new types.
- Use the same root scope and unavailable-audio rules above. Do not infer type
  from Category, Genre, Pack, other Samples, duration, or audio analysis.
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
  Category/Genre proposals add assignments without replacing existing ones;
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
- Remember explicit rejection while its evidence is unchanged. Alias/rule updates
  alone do not reset it; the same clue recognized differently is still rejected.
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
Sample/Pack at a time. It returns Category/Genre/type proposals, path and Pack
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
  original component text, occurrence, and `path-v1` provenance.
- Most-specific phrases suppress contained matches within each component and
  Category/Genre dimension. Conflicting targets or partially overlapping phrases
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
- Fresh libraries receive 26 Genre records, 25 Category recognition terms (no
  Category records), and the two fixed Sample types. Existing libraries receive
  offered Genres, reuse matching Categories, and retain custom Category names.
- Vocabulary keys survive renames and deletion. Deleted targets and aliases have
  tombstones so reopening never restores defaults. Custom re-creation gets a new
  identity. Alias reassignment uses the alias ID explicitly; duplicate normalized
  terms in the same dimension reject with `NAME_CONFLICT`.
- Internal worker/DbClient commands provide Genre creation/rename/read/pagination,
  direct assignments and impact-checked removal, plus vocabulary/alias pages and
  alias creation/edit/reassignment/removal. Category name writes enforce alias and
  recognition conflicts. Removal reviews include aliases and Genre memberships;
  no renderer IPC or management UI is delivered by this slice.
- `loadCatalogRecognizer` compiles effective names and aliases through bounded
  worker pages. It recognizes offered terms for later explicit creation, omits
  retired entries, and preserves stable vocabulary keys for linked records.
- Future vocabulary updates, voluntary incorporation UI, authoritative review
  snapshots, rejected-proposal memory, and confirmed assignment execution remain
  pending. The adapter is not a stale-safe preparation/execution token.

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

Remaining implementation contracts: future catalog updates, serialized evidence/rejection keys
(including targets not yet created), tokenization punctuation edge cases, conflict
payloads, review tokens, dependency queries, IPC, and bounded execution limits.
Visual design/prototypes remain deferred. These open technical contracts do not
reopen the business rules above or establish shipped capabilities.
