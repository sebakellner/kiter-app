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
  entries, and no hierarchy. Genre storage, executable contracts, initial catalog,
  and vocabulary lifecycle rules still require definition.
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

Internal Pack/member/import-candidate lists default to 50 items, maximum 100.
Packs sort by stored name then UUID; members by canonical path then UUID;
import candidates by Sample UUID. Reviews hash the completed scan, Pack
presentation, and exact candidate source revisions/origins in bounded batches.
Every conflicting candidate requires one explicit `keep` or `assign` decision;
extra, missing or repeated decisions are rejected. Manual standalone origins are
conflicts too; a manual origin already matching the target Pack remains manual.
Changed reviewed state returns `STALE_REVIEW` inside the confirmation transaction.
Internal preparation imports Samples first; canceling Pack confirmation leaves
those Samples cataloged with their previous origins.

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

Internal Collection and membership lists default to 50 items, maximum 100.
Collections sort by stored name then UUID; memberships sort by position. Adding
an existing member is idempotent without moving it; new members append after the
last position. Removal can leave gaps. Reorder requires every current Sample ID
exactly once and writes contiguous positions atomically, rejecting stale or
incomplete membership sequences without changing the previous order.

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

Internal classification lists and target-assignment lists use pages of 50,
with a maximum of 100, ordered by normalized name key then UUID. Partial search
uses the same locale-independent normalization, retains accents, and treats
search text literally. Use lists are separately paginated for Samples and Packs;
removal reviews include counts and any linked profile.

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

The approved initial catalog contains these 26 independent entries: House,
Tech House, Deep House, Techno, Trance, Drum and Bass, Dubstep, UK Garage,
Breakbeat, Disco, Hip Hop, Trap, R&B, Soul, Funk, Pop, Reggaeton, Dancehall,
Afrobeats, Rock, Jazz, Blues, Folk, Classical, Ambient, and Cinematic. This is
agreed seed content, not an implemented migration or recognition-alias catalog.

Catalog-update identity/tracking and storage/IPC contracts remain open. Suggestion
and reimport business rules are recorded under Suggestions, Tasks, and Recovery;
existing Author/Category operations do not implement Genre behavior.

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
- Internal Pack removal reviews presentation, cover, exact Sample origins, and
  Category/Author assignment IDs; confirmation rechecks them transactionally and
  returns `STALE_REVIEW` on change. Detached Samples receive manual standalone
  protection, so later Pack registration requires reviewing them again. Only
  unreferenced covers become `cleanup_pending`; physical cleanup is separate.
- Removing a Collection removes its presentation data and memberships, not
  its Samples or their audio.
- Collection removal requires a token from impact review, rechecking presentation,
  cover ID and exact ordered memberships inside the transaction. Changed state
  returns `STALE_REVIEW`. Removing the final cover reference marks the managed
  asset `cleanup_pending`, checking Packs, other Collections and profile avatars.
  Main's managed-image service performs physical cleanup separately and recoverably.
- Removing catalog organization is distinct from deleting source audio.
  Metadata removal must never cascade into filesystem deletion.
- A missing source does not by itself remove a Sample's identity, organization,
  or memberships.
- Removing a Sample from the catalog requires confirmation showing affected
  references. Delete its catalog record, Favorite mark, annotations, Pack
  association, Category/Author assignments, and Collection memberships, but keep its
  source audio. Preserve an exclusion for that canonical location so rescans
  do not undo the decision. Explicit reinclusion does not restore deleted data.
- Internal removal review hashes Sample presentation, Favorite/origin, the source
  observation/revision and exact Collection/Category/Author/root references in
  batches of 500. Reference reads are paginated by referenced UUID, default 50,
  maximum 100. Confirmation rechecks the token in an immediate transaction;
  changed reviewed state returns `STALE_REVIEW`. Exclusion and catalog deletion
  commit together; audio authorization is not granted by these internal APIs.
- Exclusions are Library-wide and list by canonical path in pages of 50, maximum 100. Explicit reinclusion selects an excluded canonical location and a registered
  containing root. Main verifies readable supported-extension audio and rejects
  symlinks and changed canonical locations. The transaction rechecks exclusion,
  registered containment and vacancy, clears the exclusion and creates a new
  Sample/source pair associated with that root. Its origin is manually standalone
  so a later Pack import requires review. Other overlapping root associations
  are rediscovered on rescan; no Pack or deleted organization is restored.
- Removing a Category or Author requires showing its uses and obtaining
  confirmation. Remove its assignments or credits, not the associated
  Samples, Packs, or files.
- Author removal also shows any UserProfile link and clears that link without
  removing the profile or its Preferences.
- Author/Category removal requires the review token returned by impact inspection.
  Recheck the entity name, exact Sample/Pack association IDs, and linked profile
  inside the removal transaction. Changed impact rejects the removal with
  `STALE_REVIEW`; inspect and confirm again. Matching counts alone are insufficient.
  A token identifies reviewed state, not UI confirmation or an authorization grant.
- Unregistering a source directory stops scanning it but retains its Samples
  and organization. Catalog retention alone does not authorize access to
  audio; playback and dragging still require an authorized location.
- Removing a cover reference schedules automatic cleanup only when no entity
  still uses that managed asset, including as a UserProfile avatar. Referenced images and original images remain
  untouched; cleanup failures are reported and retryable.

Derived caches can be rebuilt; user organization must not be treated as
disposable cache data.

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

The first import-classification feature may suggest Categories and Genres from
filenames and folder names. Author credits and musical BPM/tonality hints are
outside this first slice. Suggestions require user acceptance before assignment;
eligible path evidence includes the filename, the selected import root's name,
and descendant folder names along the file's relative path. Ancestors above the
selected root are excluded. Detailed normalization and evidence contracts remain
open; root-combination rules are agreed below. This feature is not implemented.
See [Architecture](architecture.md#classification-suggestions--agreed-direction-planned)
for the approved identity, recognition-engine, process, and delivery boundaries.

Recognition uses an app-supplied vocabulary for Categories and Genres. Reuse an
existing matching library entry; when a recognized value is absent, propose its
creation and assignment. Neither the entry nor its assignment is created until
the user accepts. This does not prepopulate the user-created Category vocabulary
or automatically restore deleted Genres. Detailed matching and executable
transaction contracts remain open; agreed atomicity rules are recorded below.

The approved initial Category recognition vocabulary contains 25 independent
terms: Drums, Kick, Snare, Clap, Hi-Hat, Cymbal, Tom, Percussion, Bass, 808,
Synth, Lead, Pad, Keys, Piano, Organ, Guitar, Strings, Brass, Woodwinds,
Vocals, FX, Riser, Impact, and Texture. Recognizing one term does not imply
another (for example, Piano does not automatically suggest Keys). These are
recognition terms, not automatically created Category records. Loop and One-Shot
are excluded from this vocabulary and reserved for a separate Sample-type dimension whose business rules and
implementation contracts still require agreement.

The approved initial recognition aliases are:

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

These variants define recognition behavior, not mandatory separate alias rows:
case and common-separator normalization should avoid redundant aliases. Do not
infer equivalences such as 808 to Bass or Keys to Piano. Normalization is agreed
in Architecture; initial alias delivery remains an implementation contract.

During import preparation, accepting a suggestion stages the proposed vocabulary
creation and assignment; it does not persist either immediately. Persist those
changes only after import confirmation, during execution. Closing preparation
retains its staged decisions for the session under the existing preparation
rules, without creating vocabulary or assignments. Target commit/failure rules
are agreed below; executable transaction contracts remain to be defined.

Rejecting a suggestion during import preparation also stages the decision rather
than persisting rejection memory immediately, including for existing Samples and
Packs. Persist rejections only during confirmed import execution. Discarding the
preparation saves neither acceptances nor rejections; closing it without
discarding retains staged decisions for the current session. Rejections commit
only with their target's successful classification transaction, as specified below.

Persist classification decisions atomically per Sample or Pack: its accepted
assignments, any vocabulary creation needed for those assignments, and explicit
rejections commit together or none of those changes commit. Failure must not
leave only part of that target's reviewed classification applied. This does not
roll back other targets already processed or establish folder/batch atomicity.
Shared vocabulary created by a previously committed target remains valid.
Import-stage and retry policies are agreed below; concrete commands remain open.

Revalidate reviewed classification decisions before execution. If relevant target
identity, evidence, or recognition rules changed, require fresh review of the
affected Sample or Pack rather than reinterpreting its decisions or silently
creating a replacement classification. Preserve staged decisions that remain
valid. Exact stale-review tokens and the import queue's existing fresh-review
orchestration require technical integration.

Names of existing library Categories and Genres, including user-created entries,
also act as complete-word/phrase recognition terms without requiring a duplicate
alias. Aliases provide additional variants. For example, an existing Dungeon
Synth Genre can be suggested from `dungeon_synth_pad.wav`. Creating an entry
enables recognition, not automatic classification or background proposals.

Offer a Sample's Pack Genres as suggestions both during import and when the user
explicitly requests classification. Combine them with path-derived proposals,
retaining the Pack as a distinct evidence source and deduplicating the proposed
Genre. Assignment still requires acceptance. Changing Pack Genres alone does not
start classification or generate background proposals for its Samples. During
import, use the origin that will result from the reviewed decision: the retained
Pack or destination Pack, including new Pack Genres accepted in preparation.
A Sample remaining standalone receives no Pack-derived suggestions. Changing the
origin decision requires refreshing and reviewing affected proposals before
confirmation. Pack Categories do not gain this suggestion behavior implicitly.
Execution dependencies between staged Pack Genres and Sample decisions still
require technical contracts.

For the Pack itself, derive import-classification suggestions only from the name
of the folder supplying that Pack, not from descendant folders, filenames, or
aggregated Sample classifications. Descendant path evidence remains eligible for
Sample suggestions under the rules above. Pack proposals also require acceptance;
Sample classifications do not propagate to the Pack. For an existing Pack with
multiple root associations, combine only the supplying root names included in
the operation: selected associated roots during reimport, or all registered
associated roots during explicit classification without reimport. Deduplicate
proposals while retaining evidence; do not inspect descendants or file contents.

Classification matching is local and deterministic, using complete words/phrases
and explicitly defined aliases, with common filename separators recognized.
For example, `RISERS` may map to Riser and `DnB` to Drum and Bass through explicit
aliases. Do not match arbitrary substrings or infer unknown abbreviations or
spelling corrections. Each proposal must retain the matching evidence so its
reason can be explained. Within the same classification dimension, prefer the
most specific recognized phrase over matches contained in the same text span:
`tech_house_kick.wav` suggests Tech House and Kick, not an additional House from
that phrase. Independent House evidence in another eligible folder may still
produce a House suggestion. This is phrase precedence, not Genre hierarchy.

Different eligible path components do not override one another. When a filename
and folder suggest different classifications, offer both with their respective
evidence rather than deciding which is correct. For example,
`Snares/kick_01.wav` may suggest Snare and Kick; users may accept either, both,
or neither. Most-specific-phrase precedence still applies within each text span.

Kiter supplies initial recognition aliases, and users may add their own aliases
for Categories and Genres, including user-created vocabulary entries. For
example, a custom `BD` alias may suggest Kick. Adding an alias enables suggestions
only; it never assigns classifications automatically or changes existing ones.
Each alias has one target within its classification dimension, across supplied
and custom aliases. Assigning an occupied alias to a different target in that
dimension requires explicit reassignment, never silent replacement or multiple
targets. The same alias may independently target one Category and one Genre.
An alias must not equal the name of a different entry within the same dimension.
Enforce this on alias creation/reassignment and on vocabulary creation/renaming;
require explicit conflict resolution rather than saving ambiguous rules. Category
and Genre namespaces remain independent. Recognition equivalence and conflict
handling follow the agreed Architecture rules.

Supplied aliases can be edited, explicitly reassigned, and deleted just like
custom aliases, subject to the same conflict rules. Application updates preserve
those changes and do not restore deleted aliases. Offer new supplied aliases
for optional incorporation rather than adding them automatically. Stable alias
identity, catalog-update tracking, and update-conflict contracts remain open.

Renaming a Category or Genre preserves its identity, assignments, and existing
aliases. Its new name becomes a recognition term; the previous name is not
automatically retained as an alias. Recognition through the old name requires
an explicit alias. Stable recognition-target mapping for app-supplied vocabulary
remains a technical contract to define.

Deleting a Category or Genre also deletes its attached aliases, both supplied
and custom. Include those aliases in the deletion impact review. They stop
generating suggestions and their terms become available for other targets;
reassignment is not required before deletion. This is agreed future alias
behavior, not part of existing Category removal operations. Recognition-catalog
rules may later propose creating the deleted classification again when eligible
evidence matches; deletion does not suppress those proposals. Re-creation always
requires explicit acceptance and does not restore deleted assignments or custom
aliases. This does not permit automatic restoration by catalog updates.

Recognition normalization is agreed in
[Architecture](architecture.md#recognition-normalization--agreed); remaining
tokenization edge cases require exact contracts. Recognition-conflict behavior is
agreed in [Architecture](architecture.md#recognition-ambiguity--agreed).
These rules concern classification suggestions, not the separately agreed
approximate library search.

Remember a rejected Category/Genre suggestion for a Sample or Pack while its
supporting evidence is unchanged. Reimport must not repeat the same rejected proposal from
the same evidence. New or changed supporting evidence may make it eligible for
review again; this never assigns it automatically. Confirmed assignments survive
reimport and are not replaced by suggestions. Evidence-equivalence rules are
agreed in [Architecture](architecture.md#evidence-equivalence-and-rejections--agreed);
exact evidence keys and rejection identity for missing vocabulary entries still
require technical contracts.
Alias or recognition-rule updates do not by themselves invalidate a rejection.
Offer the same classification again only when new or changed supporting path
evidence exists, including a distinct clue newly recognized by an updated rule.
Recognizing the same rejected clue through a changed rule is not new evidence;
unrelated rule updates must not reset rejection memory.

Manually removing a Category or Genre assignment does not record a suggestion
rejection. The same classification may be suggested again on reimport even when
its supporting evidence is unchanged. It still requires acceptance before being
assigned again; only an explicit suggestion rejection activates rejection memory.
These rejection, assignment-preservation, manual-removal, and unreviewed-proposal
rules apply equally to Samples and Packs, including existing Packs on reimport.

When explicitly requesting classification for selected Samples or Packs, users
may opt to include previously rejected suggestions even with unchanged evidence.
Viewing those proposals does not clear rejection memory. Accepting one stages
its assignment and replacement of its rejection, committed together only after
confirmation under the same per-target atomicity rules. Discarding that review
preserves the rejection; this is not a blanket reset of the selection's history.

Users may accept or reject classification suggestions individually or for an
explicit group of Samples and reviewed proposals. Group decisions affect only
those proposals and never replace existing assignments. This does not change
the individual keep/assign review required for Pack-origin conflicts. Batch
limits and exact stale-review checks remain to be defined; commit/failure policies
are agreed below.

Unreviewed classification suggestions do not block import confirmation. Import
without applying them or recording a rejection; they may be offered again on
reimport. Leaving a proposal unreviewed is distinct from explicitly rejecting it.

Users may also explicitly request classification suggestions for selected
existing Samples or Packs without reimporting their folders. Apply the same
evidence scope, review, rejection-memory, and assignment-preservation rules.
Changing aliases or recognition rules does not automatically reclassify the
library or generate background proposals. Root evidence and rule-update behavior
are agreed below; bounded execution and exact evidence keys need contracts.

Explicit classification without reimport also stages acceptances and rejections
for a separate confirmation before writing. Closing the review may retain it for
the current session; discarding it saves no decisions. Confirmed execution uses
the same per-Sample/Pack atomicity and stale-review rules as import classification.
Session retention does not imply recovery of unconfirmed reviews after restart.

Standalone batch classification continues after individual Sample/Pack write
failures and reports successful and failed targets separately. Retry failed
targets only after revalidation, requiring fresh review when relevant state
changed. Preserve successful targets; do not roll back the batch or call partial
completion a full success. This policy does not change import failure behavior.

When standalone classification includes Packs and Samples, allow accepted Pack
Genres in preparation to support proposals for selected member Samples. Commit
selected Packs before dependent Samples. If a Pack write fails, leave Samples
whose reviewed decisions depend on that change unprocessed; continue unrelated
targets. Selecting a Pack does not automatically select its Samples. Record
dependencies and blocked outcomes explicitly; dependency validation and execution
ordering require technical contracts.

Standalone batch classification supports cancellation between targets. Finish the
current Sample/Pack transaction, then start no further targets. Preserve committed
changes and report completed, failed, and unprocessed targets separately; a
cancellation request is not rollback or proof that the active target was skipped.
This does not introduce cancellation for confirmed imports.

Continuing a canceled or interrupted standalone classification creates a new
operation for failed and unprocessed targets only, preserving the original
result. Do not reapply completed targets. Require explicit user continuation,
revalidation, and fresh review of stale decisions; after interruption, reconcile
unverified outcomes before deciding which targets remain eligible. This does not
change import Retry, which prepares the whole original batch again.

Ordinary application exit during standalone classification requests a stop at
the next target boundary: finish the current transaction, start no further
targets, and retain completed changes. Persist a recoverable execution result
so outcomes remain available after restart. After forced termination, reconcile
confirmed outcomes and unverified states rather than assuming success or
rollback; never resume automatically. This durable result requirement is separate
from session-only unconfirmed reviews and requires storage/recovery contracts.

Keep standalone classification execution history across restarts until the user
explicitly deletes it; do not automatically expire or rotate those records.
Preserve summaries and per-target outcomes with paginated details. History cleanup
does not undo classifications or delete Samples, Packs, or audio. Storage limits,
cleanup eligibility during execution/recovery, and query contracts remain open.

Confirmed imports and standalone classification operations share one serial
execution queue, ordered by confirmation. Users may prepare and confirm further
operations while one executes; revalidate each queued operation before starting.
Do not execute import and standalone classification concurrently, even when their
targets differ. This is operation orchestration, not a generic queue for every
catalog mutation or a replacement for DB-worker serialization. Confirmed queued
classifications persist on exit like queued imports. After restart, show them as
pending without automatic execution; continuing requires user action and
revalidation, with fresh review if relevant state changed. Queue storage,
cross-operation recovery, and exact exit synchronization remain open contracts.

Apply the same advancement rules across the shared queue: after a terminal
failure/partial result or standalone cancellation, retain the outcome and continue
with the next operation. An operation requiring fresh review pauses advancement
until reviewed or removed. Pending operations may be removed, not edited or
reordered; changes require preparing another operation. An application exit
request during standalone classification stops after its current target and
exits without starting queued work. Confirmed import execution still blocks
ordinary exit until it finishes under its existing rule.

For each new imported file, create the Sample, its source record, and its reviewed
classification decisions in one atomic operation. If any part fails, that new
Sample and source are not incorporated and its classification changes do not
commit. Previously committed Samples remain intact. This is an agreed target
contract, not current import behavior.

Create a new Pack atomically with its first reviewed Sample-origin association,
the Pack's presentation/classification decisions, and the required writes for
that Sample, including its source/classification if newly imported. The first
association may reuse an existing Sample under its reviewed origin decision.
Do not commit a new empty Pack when that transaction fails. Process subsequent
Samples independently; a later failure preserves the partially populated Pack
and previously committed Samples and must be reported as partial import. This
does not make the entire folder atomic.

When reimporting an existing Pack, commit each Sample's source observation,
reviewed classification decisions, and explicitly reviewed origin decision in
one transaction. Failure leaves all those changes unapplied for that Sample,
without reverting previously committed Samples. Origin conflict decisions remain
individual and explicit. This target workflow replaces neither the currently
implemented Pack confirmation transaction nor its review checks until delivered.

Before processing an existing Pack's Samples, commit its reviewed classification
decisions atomically. If that Pack-level write fails, process none of its Samples
and follow the import batch failure policy. A later Sample failure preserves the
Pack's committed classification changes and reports them in the partial result.
New Packs retain their first-association transaction rule above. Exact
revalidation and execution-dependency contracts remain open.

During import, a classification-write failure stops the current import batch;
do not begin subsequent folders. Preserve previously committed catalog content
and classification outcomes, report incorporated content separately from failed
classification and unprocessed work, and never label the batch fully successful.
Per-target classification atomicity still applies; a folder is not an
all-or-nothing transaction. Retries follow the existing whole-batch rediscovery
and fresh-review import policy.

Explicit classification of existing Samples may use cataloged source/root path
names even when the audio is unavailable, including a disconnected drive. Mark
the evidence as coming from the registered location; it does not establish that
the file currently exists, is accessible, or has been analyzed. Keep the agreed
root-bounded evidence scope and classification review rules. This permission
does not bypass complete discovery requirements for a new import or authorize
audio access through a stored path.

When explicitly requesting suggestions for an existing Sample without reimport,
combine eligible path evidence from all its registered root associations. Respect
each root's boundary and deduplicate proposals for the same classification while
retaining their supporting evidence. Do not require choosing a single root or
prefer the most specific one. For example, registered Techno and nested Pack
roots may jointly support Techno and Kick suggestions for the same Sample.
During an import with overlapping selected roots, likewise combine eligible
evidence from all selected roots containing the included file, independently of
the root chosen for its Pack destination. Respect each selected root's boundary
and produce one proposal per classification with its supporting evidence.
Changing the Pack destination alone does not restrict evidence to that root.
Pack root-name aggregation follows the separate Pack evidence rules above.

Confirmed operation persistence, transactional outcome records, and restart
verification follow [Verifiable Execution Recovery](architecture.md#verifiable-execution-recovery--agreed-planned).
These guarantees are agreed, not implemented task persistence.

Suggestions remain reviewable and must not replace accepted classifications
during a rescan. Rejected or stale suggestions must not execute without renewed
review.

Proposed task states are **queued**, **running**, **completed**, **partial**,
**failed**, and **canceled**. A cancellation request is distinct from its final
outcome; already completed file changes remain completed.

Track item outcomes and use identified progress units. Interrupted work requires
reconciliation before retry; task unification must not merge conflicting
operations on the same file. Durable task persistence is not implemented.

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

- UI presentation of the agreed per-Sample keep/assign import-conflict review.
- UI presentation of explicit reinclusion for Library-wide excluded locations.
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

Export, file-conflict policies, automatic suggestions, durable task states,
retry behavior, and source-deletion verification require their own scoped
decisions. Kits, Tags, accounts, multiple Libraries, and named favorite lists
must not enter storage planning as already-approved entities.

Record approved decisions here as scope evolves. Add executable contracts and
tests in the owning feature; this document is not a substitute for runtime
validation.
