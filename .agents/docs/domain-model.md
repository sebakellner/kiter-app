# Domain Model

Read this guide when changing entities, relationships, metadata, lifecycle
behavior, or domain validation. See [README](../../README.md) for current
app behavior, [Architecture](architecture.md) for technical ownership, and
[Common Guidelines](common-guidelines.md) for implementation conventions.

## Scope and Decision Status

This guide defines the agreed product vocabulary and organization rules for
Kiter's local library. It separates those decisions from the implemented
catalog and from questions that still require agreement.

- **Agreed domain:** one local UserProfile with Preferences, one Library,
  Sample, Pack, Collection, Category, Genre, Author, and sample favorite marks.
- **Agreed Genre extension, not implemented:** optional multiple Genres on Samples
  and Packs, with independent assignments, an initial vocabulary plus user-created
  entries, and no hierarchy. Business rules and initial content are agreed;
  executable storage/IPC contracts remain to be delivered.
- **Implemented slice:** pure entity contracts, fresh 17-table catalog, separate
  Sample/source records, imported root associations, Favorites, and transactional
  local profile/Preferences bootstrap. DB client profile reads and volume writes
  exist internally, alongside profile name/Author-link editing; they are not
  wired to settings UI or player restoration. The
  [shared contracts](../../src/shared/ipc/index.ts) define `AudioFile`,
  `LibrarySample`, `AudioSample`, `FavoriteState`, and typed IPC results.
  Drizzle rows remain private persistence types, separate from domain contracts.
  Source size/mtime observations advance revisions on detected changes.
- **Implemented internal classification slice:** Author/Category creation, reads,
  renaming, paginated search, independent Sample/Pack assignments, use inspection,
  and impact-checked removal through the DB worker/client. Category listing,
  creation and renaming have IPC/preload contracts; other classification IPC and
  all classification UI remain pending.
- **Implemented internal Collection slice:** create/edit/read, bounded lists,
  idempotent append/removal of memberships, atomic full-sequence reorder, and
  impact-checked deletion through the worker/client. No Collection IPC/UI or
  cover publication/physical cleanup is exposed yet.
- **Implemented internal Pack slice:** reviewed registration/reimport from scanned
  roots, bounded Pack/member/candidate queries, presentation edits, manual origin
  corrections, and impact-checked removal through the worker/client. Import
  preparation catalogs Samples before Pack confirmation; no Pack IPC/UI exists.
- **Implemented internal Sample lifecycle slice:** presentation edits, bounded
  reference/exclusion queries, exact-impact reviewed catalog removal, and explicit
  reinclusion through the worker/client and main library service. Original audio
  stays untouched; no Sample editing/removal/reinclusion IPC/UI exists yet.
- **Implemented internal profile/image slice:** profile name/Author-link editing,
  validated immutable cover/avatar publication, reviewed reference replacement,
  cleanup claims, and startup reconciliation. No profile/image IPC/UI exists yet.
- **Not implemented:** Pack UI, Collection UI, classification/credit UI,
  profile/image UI, and other lifecycle workflows below.
- **Deferred design:** analysis/cache storage layout, cache persistence, waveform
  peaks, and analysis versioning. Managed covers are part of the first new
  entity delivery; persistent technical analysis follows separately.

Fields below describe information responsibilities, not database columns or
mandatory form fields unless explicitly stated. Extend executable contracts
incrementally; do not replace working listing types with a speculative model.

## Product Direction

These workflows define the product direction, not delivered capabilities or
permission to implement unresolved behavior:

- Import Packs and standalone Samples, preview audio, classify and credit them,
  and build ordered Collections without duplicating source audio.
- Edit Pack names, descriptions, covers, Categories, and Author credits;
  manage one local UserProfile with an optional Author link and managed avatar.
- Search across the Library, including Packs, Collections, Categories, and
  available Sample data. Favorites remain independent Sample marks.
- Rename, relocate, centralize, and export through reviewed file workflows
  that preserve identities and references. Centralization uses a producer-chosen
  local folder with directories organized by sample type.
- Extract technical metadata such as duration, waveform, sample rate, and
  channels; do not invent measurements or musical inferences.
- Suggest classifications and groupings for unstructured folders, and require
  review before changing files. Suggestions are not verified metadata.
- Track analysis, organization, renaming, relocation, and export as tasks with
  visible status and errors. Define concrete task behavior when implementing
  it; tasks do not imply audio synthesis or generation.

Native dragging uses original files while preview remains available in Kiter.
Named favorite lists, Tags, and possible future Kits are outside the agreed
first entity delivery.

## Product Vocabulary

| Concept     | Meaning                                                                                   | Modeling decision                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| UserProfile | The local profile of the person using this installation.                                  | Exactly one profile with a name, optional avatar, and optional linked Author; no login or account.                     |
| Preferences | Application behavior chosen by the local user.                                            | One typed preference record per profile; initially persistent preview volume only.                                     |
| Library     | The complete local scope of imported samples, packs, collections, and their organization. | One Library with multiple source directories; not a separately identified entity in this stage.                        |
| Sample      | A cataloged audio resource with its own identity and organization.                        | Core entity; it may be standalone or have one origin Pack.                                                             |
| Pack        | An imported source package, such as a sample product from a producer or provider.         | Core entity with presentation data, samples, categories, and declared authors.                                         |
| Collection  | A selection of samples assembled inside Kiter.                                            | Core entity referencing samples from different Packs and standalone samples.                                           |
| Category    | A classification used to organize Samples and Packs.                                      | Classification entity; assignments are independent for each target.                                                    |
| Genre       | A musical style used to classify Samples and Packs, separately from Category.             | Optional multiple direct assignments; flat vocabulary with initial and user-created entries, without a primary Genre.  |
| Author      | A declared author, producer, provider, or collaborator credited on Samples or Packs.      | Reusable credit identity, not a user profile or authorization principal; may represent the same person as UserProfile. |
| Favorite    | A personal mark on a Sample.                                                              | Sample state, not a separate grouping or named-list entity in this stage.                                              |

Use **Pack**, not **Kit**, for imported source packages. Use **Author**, not
**Owner**, for declared credits.

Kits are outside the current model. A possible future conversion of Collections
into Kits does not make a Collection a Kit or define conversion behavior now.
Tags and named favorite lists also remain outside this agreed stage.

## Core Entities and Responsibilities

### UserProfile and Preferences

The beta has one explicit local profile and one Library, not multiple accounts,
login, permissions, or isolated per-user catalogs.

- UserProfile has a stable ID and required presentation name, an optional
  managed avatar, and an optional link to an existing Author.
- Profile names use the same trimmed NFC, 1–120 Unicode-code-point policy as
  Authors, rejecting controls and line/paragraph separators before trimming.
  Editing supplies both the name and `authorId`; explicit `null` unlinks the
  Author. Updates preserve the independently edited avatar and Preferences and
  reject nonexistent Authors without changing the profile.
- Profile presentation data and the Author's artistic name are independent.
  Changing the link or profile name does not rename or delete an Author.
- An Author can exist without a profile. Deleting a linked Author clears that
  optional link after confirmation but preserves the profile and Preferences.
- Linking an Author does not automatically credit them on imports, Samples, or
  Packs. Credits require explicit assignment, including for one's own work.
- The beta allows editing the profile, not creating additional profiles or
  deleting the only one. Do not attach a user ID to every catalog entity merely
  to model the implicit single-user scope.
- Preferences are application settings, not artistic credits. Initially persist
  preview volume in the inclusive range 0 to 1, with default 1 to preserve the
  current player's initial volume. Restore it before playback; zero is valid.
- Future settings require typed fields and defined behavior, not an arbitrary
  JSON or key/value bag. Theme, playback position, mute state, and automatic
  attribution are not approved persistent settings in this stage.

### Sample

A Sample represents an audio resource in the catalog, not a temporary playback
URL or merely a filename.

- Has a stable catalog ID, display data, a source location, and availability.
- Has an editable presentation name independent of its actual filename, and
  optional notes. Editing presentation data never renames source audio.
- Presentation-name overrides are optional, trimmed NFC, at most 120 Unicode
  code points, rejecting controls and line/paragraph separators before trimming.
  Empty/whitespace-only names clear the override. Notes use the optional NFC,
  5,000-code-point description policy, preserving nonempty spacing and CR/LF.
  Editing supplies both fields; absent fields clear their stored values.
- Has zero or one origin Pack. A Sample without a Pack is a standalone Sample.
- Can belong to any number of Collections.
- Can have multiple Categories assigned directly to it.
- Can have multiple direct Author credits, independent of its Pack's credits.
- Can be marked or unmarked as a Favorite independently of its memberships.
- Has technical metadata and derived analysis tied to its source version.
  These are not user classifications.
- Has one current source file, represented separately from user organization.
  Separate copies are distinct Samples; managed moves and confirmed relinks
  preserve its UUID. Reimporting an already registered source reuses its Sample.
- External source changes preserve identity and user organization but invalidate
  derived analysis. Missing or externally moved files retain their Sample
  until an explicit removal or confirmed relink; do not merge by hash.

Memberships reference the same Sample ID; they do not create new Samples or
duplicate source audio.

### Sample Type — Agreed, Not Implemented

Each Sample has at most one optional type: Loop or One-Shot. An unset value means
unknown; classification is not required. This is independent of Category, Genre,
and Pack origin, and users may edit it. The vocabulary is fixed for this stage,
not a user-extensible collection of types.

- Loop: a phrase, pattern, or texture prepared to repeat as a musical unit.
- One-Shot: a sound intended to be triggered as one event, such as a hit, note,
  vocal, or effect.
- Unknown: unclassified or insufficient information, represented by an unset type.

Type describes intended musical use, not duration. A long impact may be a
One-Shot and a short phrase a Loop. BPM or tonality alone does not determine
type. Confirmed user choices survive reimport until an explicit change.

[Classification](features/classification.md#sample-type-suggestions) owns type
recognition, aliases, evidence priority, replacement/rejection review, and atomic
execution. [Search](features/search.md) owns confirmed-type filters. This planned
extension does not turn types into Categories or musical analysis results.

### Pack

A Pack represents a source package imported into Kiter, not a grouping manually
assembled in the app.

- Has its own stable ID and a required name, initially suggested from the
  selected folder and editable without renaming that folder.
- Can have an optional description and cover. Categories and Authors are
  optional; their absence must not block import.
- Groups Samples for which it is the origin Pack.
- Can have multiple Categories assigned directly to it.
- Can credit multiple Authors or collaborators. An Author can be credited on
  multiple Packs.
- Is distinct from the directory used to import it. A folder may supply a Pack,
  but its path is not the Pack's identity.

On folder import, the user explicitly chooses standalone Samples or one Pack
containing the discovered Samples in that folder and its subfolders. Subfolders
do not automatically become separate Packs. A new Pack requires at least one
associated Sample; an existing Pack can remain empty after removals or
reassignments. Missing source files do not remove its memberships.

Pack names may repeat. New groupings created inside Kiter are Collections,
not Packs.

Pack names use the same trimmed NFC, 1–120 Unicode code-point policy as
Collections. Descriptions share their optional NFC, 5,000-code-point policy.
Editing supplies name and description together; absent description clears it.
Reimport preserves stored presentation fields rather than applying import defaults.

[Import](features/import.md#implemented-internal-pack-contract) owns current
internal Pack review/query contracts and the distinct planned import workflow.

Pack Samples have no persisted manual order in this stage; order them by
name or path when listing. Collections retain their explicit membership order.

### Collection

A Collection is a user-created selection, independent of package origin.

- Has its own stable ID and a required name.
- Can have an optional description and cover.
- Contains an ordered list of Sample references, with no repeated Sample ID
  within the same Collection.
- Can combine Samples from several Packs and standalone Samples.
- Has no Authors or Categories of its own in this stage.
- Does not change a Sample's origin Pack, Categories, or Favorite mark.
- Can be created empty. Collection names may repeat.

The same Sample may appear once in each of several Collections. Removing it
from one Collection does not remove it from the others or from the Library.

Collection names follow the 1–120 Unicode code-point, trimmed NFC policy used by
Authors/Categories, including rejecting controls and line/paragraph separators
before trimming. Optional descriptions use NFC, allow CR/LF line breaks, reject
other control characters, and contain at most 5,000 code points including
whitespace. Whitespace-only descriptions become `null`; nonempty descriptions
retain their spacing. Editing supplies name and description together; an absent
description clears it. Names may repeat.

[Catalog Organization](features/catalog-organization.md#implemented-internal-contracts)
owns current bounded queries and reorder/impact execution contracts.

### Category

A Category represents an organizational classification, not a measurement
extracted from audio.

- Has a stable ID and required display name.
- Uses one flat, user-created and editable vocabulary shared by Samples and
  Packs, with no hierarchy or mandatory predefined categories.
- Samples and Packs can each have multiple Category assignments.
- Pack Categories do not automatically become its Samples' Categories.
- Category assignments are user-managed data, not disposable analysis output.

Category names must be unique ignoring case and leading/trailing whitespace.
Normalize Unicode to NFC and use locale-independent lowercasing for matching;
preserve accents and internal spaces.
Inherited display or filtering behavior must not be introduced implicitly.

Author and Category names are trimmed and normalized to NFC for storage, with
1–120 Unicode code points after normalization. Reject Unicode control characters
and line/paragraph separators before trimming. Preserve display case, accents,
and internal spaces. Author names remain non-unique.

[Catalog Organization](features/catalog-organization.md#implemented-internal-contracts)
owns implemented assignment/query/impact contracts; library-wide search has its
separate matching rules.

### Genre — Agreed, Not Implemented

Genre is a musical-style dimension separate from Category. For example, House
and Techno are Genres, while Kick, Snare, and Riser can be Categories.

- Samples and Packs can each have zero, one, or multiple Genres. Classification
  is optional, and there is no primary Genre or ranking among assigned Genres.
- Sample and Pack assignments are independent. A Pack's Genres may be suggested
  for its Samples, but assignment requires explicit acceptance; there is no
  automatic inheritance or propagation.
- Kiter provides an initial Genre vocabulary and allows user-created additions.
  Both are reusable across Samples and Packs in the same Library.
- Start with a curated, bounded selection of approximately 20–30 common Genres
  spanning electronic, urban, acoustic, and cinematic music rather than an
  exhaustive subgenre catalog. This scope does not limit user-created Genres.
- Supplied and user-created Genres can both be renamed and deleted. The initial
  vocabulary is a starting point, not a protected catalog. Application updates
  must respect user renames and deletions rather than silently restoring defaults;
  new catalog entries are offered for optional incorporation into an existing
  Library, never added automatically. The user chooses which new entries to add.
  Renamed entries are not modified, and deleted entries are not restored.
- Deleting a Genre requires reviewing its Sample and Pack uses and explicit
  confirmation. Remove the Genre and its assignments, preserving Samples, Packs,
  original audio, and all other organization. Replacement is not required.
- The vocabulary is flat. House and Tech House are independent entries; assigning
  or filtering by one does not implicitly include the other.
- Names are unique across supplied and user-created Genres under the Category
  matching policy: trimmed NFC and locale-independent lowercasing, preserving
  accents and internal spaces. Creating or renaming to an occupied name is
  rejected; it does not create a duplicate or merge existing Genres.
- Names follow the Category validation policy: required, trimmed NFC, and 1–120
  Unicode code points after normalization. Reject Unicode control characters and
  line/paragraph separators before trimming; preserve display case, accents, and
  internal spaces.

Genre assignments are user organization and must survive rescans and source or
origin changes. This agreed extension is not part of the current logical data
profiles or implemented 17-table schema below.

[Classification](features/classification.md#genre-seed) owns the approved initial
26-entry catalog and recognition/alias delivery. [Search](features/search.md) owns
Genre query matching, filters, and result navigation. Catalog-update tracking and
storage/IPC remain executable contracts; current Category operations do not
implement Genres.

### Author

An Author represents a declared credit, not a profile, account, or catalog owner.
It may represent the person using this installation or an external contributor.

- Has a stable ID and required artistic/credit name; no additional Author fields
  in this stage. Local profile fields belong to UserProfile.
- Can be credited on multiple Samples and Packs.
- A Sample or Pack can credit multiple Authors or collaborators.
- Credits do not establish copyright ownership, a license, or usage rights.

Credits do not distinguish author and collaborator roles in this stage. Author
names may repeat because different people can have the same name; show existing
name matches so the user can reuse an Author rather than accidentally duplicate
one. Do not merge Authors by name.

Sample and Pack credits are independent. Do not infer Sample authorship from
Pack credits, a profile link, file import, or Collection membership.

### Managed Image Asset

Packs and Collections optionally reference validated image copies managed by
Kiter; the same asset workflow supports the UserProfile avatar. Copying a
selected image never modifies the user's original.

- Use an asset ID rather than a renderer-supplied external path.
- Accept static PNG, JPEG, and WebP, at most 10 MiB and 4096 pixels per axis,
  inclusive; validate actual content, not just filename extensions.
- Replacing a cover creates a new immutable asset, not an edit to a shared image.
- Automatically clean up only unreferenced managed copies, never original
  images or copies still used by a Pack, Collection, or UserProfile.
- Failed publication or cleanup is explicit and recoverable; filesystem work
  must not be presented as an atomic database change.

## Relationships and Cardinalities

```text
One local UserProfile -> Preferences
UserProfile -> optional linked Author
UserProfile -> optional managed avatar
One local Library
  -> Samples
  -> Packs
  -> Collections

Sample -> zero or one origin Pack
Pack -> origin Samples
Collection <-> Samples through ordered, unique memberships
Sample <-> Categories through direct assignments
Pack <-> Categories through direct assignments
Sample <-> Genres through direct assignments
Pack <-> Genres through independent direct assignments
Pack <-> Authors through declared credits
Sample <-> Authors through independent declared credits
Sample -> Favorite mark

Source directories -> discovered locations -> catalog Samples
Sample -> technical metadata and derived waveform analysis
Pack / Collection -> cover reference
```

| Relationship               | Agreed rule                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Sample to Pack             | Zero or one origin Pack per Sample; a Pack can group multiple Samples.                   |
| Sample to Collection       | Many-to-many; ordered and unique within each Collection.                                 |
| Sample to Category         | Multiple direct assignments; independent of Pack Categories.                             |
| Pack to Category           | Multiple direct assignments; no automatic propagation to Samples.                        |
| Sample to Genre            | Zero or multiple direct assignments, with no primary Genre; independent of Pack Genres.  |
| Pack to Genre              | Zero or multiple direct assignments, with no primary Genre or automatic propagation.     |
| Pack to Author             | Multiple credits per Pack; Authors are reusable across Packs.                            |
| Sample to Author           | Multiple direct credits per Sample; no inheritance from Pack credits.                    |
| Sample to Favorite         | One boolean mark; independent of Pack or Collection membership.                          |
| UserProfile to Author      | Optional link identifying one's artistic credit identity, without automatic attribution. |
| UserProfile to Preferences | Exactly one settings record for the single local profile.                                |

The user can explicitly correct a Sample's origin by assigning an existing
Pack, changing Packs, or leaving it standalone. This never moves audio or
changes Collection memberships, direct Categories, or Favorites.

These relationships do not require a separate class, table, or package for
every concept.

## Logical Data Profiles

These profiles define information to preserve, not SQL tables, column types,
or the final IPC payloads. Required names must contain non-whitespace text.
Length limits and text validation must be agreed before implementing forms.

| Concept     | Required information                                                                       | Optional information / associations                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| UserProfile | Stable ID and presentation name.                                                           | Managed avatar reference and linked Author.                                                                                                      |
| Preferences | Profile reference and preview volume in the inclusive range 0 to 1.                        | No other persistent preferences in this stage.                                                                                                   |
| Sample      | Stable ID, source location reference, actual filename, availability, and Favorite boolean. | Presentation-name override, notes, zero or one origin Pack, direct Category/Author assignments, and Collection memberships.                      |
| Pack        | Stable ID, name, and the source-directory association used to recognize reimports.         | Description, cover reference, Category assignments, and Author credits. Origin Sample references follow the creation and empty-Pack rules above. |
| Collection  | Stable ID, name, and an ordered membership list, which can be empty.                       | Description and cover reference.                                                                                                                 |
| Category    | Stable ID and unique display name under the agreed matching policy.                        | Sample and Pack assignments.                                                                                                                     |
| Author      | Stable ID and name.                                                                        | Sample/Pack credits and optional UserProfile link; no credit roles in this stage.                                                                |

When no presentation-name override exists, display the actual Sample filename.
A rescan can refresh observed file information but must not replace an override
or notes. Unknown technical measurements remain optional, never invented.

Supporting records must represent registered source directories and their scan
outcomes, file availability, and explicitly excluded canonical locations.
Exclusion records preserve a removal decision, not the deleted Sample's former
Favorite mark or annotations. Their physical representation belongs to schema
design.

## Domain Operations and Rules

### Import and Rescan

- Import discovers and registers files without moving or modifying audio.
- Directory discovery and Pack registration are distinct concepts. Import
  offers an explicit choice between standalone Samples and one origin Pack.
- Rescanning must preserve user organization, Favorite marks, and memberships.
  It must not silently replace user edits with inferred data.
- Repeated discovery of the same canonical location reuses the existing Sample.
  Overlapping imported roots must not duplicate that catalog record.
- Same-name files are not necessarily the same Sample. Equal content does not
  authorize merging records or deleting files.
- Reimporting the same canonical folder already registered as a Pack reuses
  that Pack, preserves edited presentation data and organization, and registers
  new Samples. Missing sources retain their records and references.
- Importing standalone Samples into a Pack can establish their origin
  association. If a Sample already belongs to a different Pack, show the
  conflict and let the user explicitly keep its prior Pack or reassign it.
  Never silently change origin during import or rescan.
- Manual origin corrections must survive rescans. The detailed import
  conflict flow must reconcile those corrections with source-directory
  associations rather than treating folder location as membership authority.
- A new Pack must have at least one associated Sample after conflict
  resolution; discovered files alone do not satisfy that requirement.
- Explicitly excluded locations are not automatically registered again by a
  rescan or repeated folder import. Reinclusion requires an explicit action.

### Collections and Favorites

- Creating a Collection or adding a membership never copies or moves audio.
- Removing a membership leaves the Sample, its Pack, other Collections, and
  Favorite mark unchanged.
- Favoriting a Sample does not add it to a Collection.
- Adding a Sample to a Collection does not mark it as a Favorite.
- Only Samples can be favorited in this stage, not Packs or Collections.

### Removal and Deletion

- Removing a Pack from Kiter keeps its Samples in the Library as standalone
  Samples. Their IDs, direct Categories and Author credits, Favorite marks, and Collection
  memberships remain intact.
- Detached Pack Samples receive manual standalone protection on removal;
  later Pack registration requires reviewing them again.
- Removing a Collection removes its presentation data and memberships, not
  its Samples or their audio.
- Removing catalog organization is distinct from deleting source audio.
  Metadata removal must never cascade into filesystem deletion.
- A missing source does not by itself remove a Sample's identity, organization,
  or memberships.
- Removing a Sample from the catalog requires confirmation showing affected
  references. Delete its catalog record, Favorite mark, annotations, Pack
  association, Category/Author assignments, and Collection memberships, but keep its
  source audio. Preserve an exclusion for that canonical location so rescans
  do not undo the decision. Explicit reinclusion does not restore deleted data.
- Exclusions are Library-wide. Explicit reinclusion requires a registered
  containing root and verified supported readable audio, rejecting symlinks and
  changed canonical locations. It creates a new Sample/source associated with
  that root, manually standalone and without deleted organization; overlapping
  associations are rediscovered on rescan.
- Removing a Category or Author requires showing its uses and obtaining
  confirmation. Remove its assignments or credits, not the associated
  Samples, Packs, or files.
- Author removal also shows any UserProfile link and clears that link without
  removing the profile or its Preferences.
- Unregistering a source directory stops scanning it but retains its Samples
  and organization. Catalog retention alone does not authorize access to
  audio; playback and dragging still require an authorized location.
- Removing a cover reference schedules automatic cleanup only when no entity
  still uses that managed asset, including as a UserProfile avatar. Referenced images and original images remain
  untouched; cleanup failures are reported and retryable.

Derived caches can be rebuilt; user organization must not be treated as
disposable cache data.
Exact transactional impact checks, pagination, tokens, and managed-cleanup
integration belong to [Catalog Organization](features/catalog-organization.md#implemented-internal-contracts),
with image lifecycle infrastructure in Data Access.

### Rename, Relocate, Centralize, and Export

These are separately scoped future operations, not side effects of import or
organization.

- In-app renaming or relocation must preserve Sample IDs and all Pack,
  Collection, Category, and Favorite references.
- Centralization is a reviewed batch of file operations, not a new Sample
  identity. Changed root associations and destinations outside imported roots
  must be explicitly modeled and authorized.
- Export creates destination files without changing the original source.
  An exported copy is not automatically a new catalog Sample.
- Never silently overwrite or delete originals. Show sources, destinations,
  and conflicts before destructive actions.
- Report per-file outcomes on partial failure; do not present a partial batch
  as successful.

Use the recoverable planning workflow in
[Architecture](architecture.md#safe-file-operations-planned). Export layouts,
metadata inclusion, manifests, and conflict policies remain open.

## Supporting Concepts and Technical Boundaries

These concepts support the domain but are not additional top-level library
groupings. Their representation belongs to later technical planning.

| Concept                         | Responsibility                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Library root / source directory | A user-selected directory registered for discovery, with scan state and outcomes; not the Library itself or a Pack.           |
| File location                   | The expected source path, root associations, availability observations, and eventually an identified source version.          |
| Technical metadata              | Measurements from a known source version, such as duration, sample rate, channels, and format.                                |
| Waveform analysis               | Rebuildable visualization data associated with a Sample, source version, and analysis version.                                |
| Managed image asset             | Validated image copy referenced as a Pack/Collection cover or UserProfile avatar, with recoverable cleanup when unreferenced. |
| Organization suggestion         | A proposed classification, grouping, or file action, distinct from accepted user data.                                        |
| Task                            | A tracked operation with scope, progress, cancellation, and per-item outcomes.                                                |
| File operation plan             | Reviewable sources, destinations, conflicts, confirmation, and execution outcomes.                                            |

### Identity and Sources of Truth

- A durable Sample UUID identifies its catalog record, not its filename,
  content hash, or temporary audio URL.
- Filesystem observations describe disk state. Catalog data describes user
  organization and references. Neither silently overwrites the other.
- Technical metadata and analysis refer to a source version. User edits and
  automatic suggestions have separate provenance.
- Temporary session authorization identifiers must never become persisted
  membership, Favorite, or task references.

### Availability and Analysis

[Duration Analysis](features/duration-analysis.md) owns measurement, source-bound
invalidation, background scheduling, pause/restart, and retry policies.
[Search](features/search.md) owns unavailable-result inclusion and duration ranges.

Availability and analysis are independent. Planned availability meanings are
**available**, **missing**, and **inaccessible**. Planned analysis states are
**not requested**, **queued**, **running**, **ready**, **failed**, and **stale**;
these are not claims of existing runtime enums.

A listed Sample may have an undecodable codec. Metadata extraction, waveform
generation, preview playback, and DAW import have separate capabilities and
errors; do not collapse them into one `supported` flag.

Use seconds for duration, Hz for sample rate, positive integers for channel
count, and bytes for file size. Unknown values remain unknown, not zero.
Musical attributes such as BPM or key require a separately scoped analyzer and
provenance; filenames alone are not verified measurements.

A source change must invalidate its derived metadata and waveform. Relinking
requires user confirmation or an agreed reliable matching policy; reappearance
at an old path is not proof of unchanged content.

### Suggestions, Tasks, and Recovery

Suggestions are proposals, not accepted user data; rescans must not replace
confirmed organization. Rejected or stale proposals require renewed review.

- [Classification](features/classification.md) owns recognition, aliases, evidence,
  rejection memory, Sample-type suggestions, and standalone review/execution.
- [Import](features/import.md) owns discovery, origin review, target transactions,
  partial outcomes, and whole-batch retry.
- [Operation Execution](features/operation-execution.md) owns the shared queue,
  cancellation/exit, durable history, and verifiable restart recovery.

Those contracts are agreed but not implemented durable task support. Keep
filesystem plans separate from catalog transactions and never infer rollback
or success from a cancellation request or interruption.

## Implemented Catalog: Current Behavior and Limitations

The current implementation uses Drizzle over `better-sqlite3` with committed
migrations and a DB worker. Earlier development databases are not read, migrated,
or deleted. Full domain
workflows remain incremental; tables and types are not proof of delivered UI.

### Implemented Identity Policy

- Selected roots and discovered locations are canonicalized with `realpath`.
  A unique exact canonical path maps to one persistent Sample UUID.
- Reopening the same location recovers its ID and Favorite mark. Overlapping
  roots share that record through many-to-many root/Sample associations.
- Different locations remain different Samples even with equal names or
  content. Symlink discovery remains excluded by the scanner.
- Missing files retain IDs and Favorites. Successful rescans mark absent
  root associations not present without deleting catalog records. That discovery
  observation does not claim a new source-availability check.
- Imports observe size/mtime; detected changes increment the source revision
  without replacing its UUID or user data. Size/mtime equality is not content
  equality. Stronger analysis validation and confirmed relinking remain planned;
  external moves currently create a new record when imported.
- `favorite` is a persisted Sample boolean. Writes never modify audio. The
  current filter is limited to the selected folder.
- Folder selection is not restored after restart.
- Audio URLs are regenerated on import and remain session authorization
  capabilities; never persist them as Sample references.

See [Data Access](data-access.md#implemented-catalog-and-favorites) for the
existing schema and storage lifecycle, and [README](../../README.md) for
observable behavior. Approved future rules above do not imply those features
already exist.

## Remaining Decisions and Next Planning Stage

Before implementing each relevant feature, agree on:

- Deferred visual presentation/validation of agreed origin-conflict review and
  reinclusion workflows; behavior is owned by the Import/Catalog feature guides.
- The source-observation algorithm and stronger source-version validation for
  analysis. One source per Sample, distinct copies, and confirmed relinking
  are already agreed; multiple physical sources per Sample are outside scope.
- Profile/image IPC and UI, including local image selection and display.

The approved persistence direction is a clean SQLite catalog using Drizzle and
`better-sqlite3`, owned by a DB worker. The foundation
is implemented; most entity workflows and UI remain pending. Prototype schema
and records impose no compatibility or migration requirement. Keep versioning
and recovery for the new system, and never delete local data automatically.
See [Data Access](data-access.md#persistence-foundation).

The [organization schema](data-access.md#organization-schema)
maps these profiles to target tables, constraints, indexes, transactional
workflows, managed covers, and implementation order. The schema is implemented;
target workflow descriptions do not imply their features exist. Deliver the
remaining entity operations and covers on the new
foundation, preserving preview and native dragging. Persistent technical
metadata, cache invalidation, and waveform peaks follow as a separate module.
Keep durable user organization separate from rebuildable analysis.

Classification, Sample type, search, duration, import commits, and shared execution
business rules are agreed in their feature guides. Their executable contracts
remain to be delivered. Export, filesystem conflict policies, musical analysis,
and source-deletion verification require separately scoped decisions.
Kits, Tags, accounts, multiple Libraries, and named favorite lists
must not enter storage planning as already-approved entities.

Record approved decisions here as scope evolves. Add executable contracts and
tests in the owning feature; this document is not a substitute for runtime
validation.
