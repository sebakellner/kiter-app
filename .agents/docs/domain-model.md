# Domain Model

Read this guide when changing entities, relationships, metadata, lifecycle
behavior, or domain validation. See [AGENTS.md](../../AGENTS.md) for product
scope, [Architecture](architecture.md) for technical ownership, and
[Common Guidelines](common-guidelines.md) for implementation conventions.

## Scope and Decision Status

This guide defines the agreed product vocabulary and organization rules for
Kiter's local library. It separates those decisions from the implemented
catalog and from questions that still require agreement.

- **Agreed domain:** one local Library, Sample, Pack, Collection, Category,
  Author, and sample favorite marks.
- **Implemented slice:** persistent sample IDs by canonical location, imported
  root associations, and sample favorites. The
  [shared contract](../../src/shared/ipc.ts) defines `AudioFile`,
  `CatalogSample`, `AudioSample`, `FavoriteState`, and drag errors.
- **Not implemented:** Packs, Collections, Categories, Authors, and the
  broader lifecycle rules described here.
- **Deferred design:** local storage layout, cache persistence, waveform
  peaks, managed assets, and directory organization. This guide establishes
  their domain constraints, not their schemas or storage strategy.

Fields below describe information responsibilities, not database columns or
mandatory form fields unless explicitly stated. Extend executable contracts
incrementally; do not replace working listing types with a speculative model.

## Product Vocabulary

| Concept | Meaning | Modeling decision |
| --- | --- | --- |
| Local user | The person using this installation of Kiter. | Implicit single user; no `User` entity, profile, login, or account in this stage. |
| Library | The complete local scope of imported samples, packs, collections, and their organization. | One Library with multiple source directories; not a separately identified entity in this stage. |
| Sample | A cataloged audio resource with its own identity and organization. | Core entity; it may be standalone or have one origin Pack. |
| Pack | An imported source package, such as a sample product from a producer or provider. | Core entity with presentation data, samples, categories, and declared authors. |
| Collection | A selection of samples assembled inside Kiter. | Core entity referencing samples from different Packs and standalone samples. |
| Category | A classification used to organize Samples and Packs. | Classification entity; assignments are independent for each target. |
| Author | A declared author, producer, provider, or collaborator credited on Packs. | Reusable entity, not the local user or an authorization principal. |
| Favorite | A personal mark on a Sample. | Sample state, not a separate grouping or named-list entity in this stage. |

Use **Pack**, not **Kit**, for imported source packages. Use **Author**, not
**Owner**, for declared credits. Older product documentation may still mention
Kits or Owners; it does not override the vocabulary and decisions in this guide.

Kits are outside the current model. A possible future conversion of Collections
into Kits does not make a Collection a Kit or define conversion behavior now.
Tags and named favorite lists also remain outside this agreed stage.

## Core Entities and Responsibilities

### Sample

A Sample represents an audio resource in the catalog, not a temporary playback
URL or merely a filename.

- Has a stable catalog ID, display data, a source location, and availability.
- Has an editable presentation name independent of its actual filename, and
  optional notes. Editing presentation data never renames source audio.
- Has zero or one origin Pack. A Sample without a Pack is a standalone Sample.
- Can belong to any number of Collections.
- Can have multiple Categories assigned directly to it.
- Can be marked or unmarked as a Favorite independently of its memberships.
- Has technical metadata and derived analysis tied to its source version.
  These are not user classifications.

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
Inherited display or filtering behavior must not be introduced implicitly.

### Author

An Author represents a declared credit, not the person using this installation
or the owner of its catalog.

- Has a stable ID and required name; no additional profile fields in this stage.
- Can be associated with multiple Packs.
- A Pack can be associated with multiple Authors or collaborators.
- Credits do not establish copyright ownership, a license, or usage rights.

Credits do not distinguish author and collaborator roles in this stage. Author
names may repeat because different people can have the same name; show existing
name matches so the user can reuse an Author rather than accidentally duplicate
one. Do not merge Authors by name.

Direct Sample-level credits remain outside this stage. Do not infer Sample
authorship from Pack credits.

## Relationships and Cardinalities

```text
One local Library
  -> Samples
  -> Packs
  -> Collections

Sample -> zero or one origin Pack
Pack -> origin Samples
Collection <-> Samples through ordered, unique memberships
Sample <-> Categories through direct assignments
Pack <-> Categories through direct assignments
Pack <-> Authors through declared credits
Sample -> Favorite mark

Source directories -> discovered locations -> catalog Samples
Sample -> technical metadata and derived waveform analysis
Pack / Collection -> cover reference
```

| Relationship | Agreed rule |
| --- | --- |
| Sample to Pack | Zero or one origin Pack per Sample; a Pack can group multiple Samples. |
| Sample to Collection | Many-to-many; ordered and unique within each Collection. |
| Sample to Category | Multiple direct assignments; independent of Pack Categories. |
| Pack to Category | Multiple direct assignments; no automatic propagation to Samples. |
| Pack to Author | Multiple credits per Pack; Authors are reusable across Packs. |
| Sample to Favorite | One boolean mark; independent of Pack or Collection membership. |

The user can explicitly correct a Sample's origin by assigning an existing
Pack, changing Packs, or leaving it standalone. This never moves audio or
changes Collection memberships, direct Categories, or Favorites.

These relationships do not require a separate class, table, or package for
every concept.

## Logical Data Profiles

These profiles define information to preserve, not SQL tables, column types,
or the final IPC payloads. Required names must contain non-whitespace text.
Length limits and text validation must be agreed before implementing forms.

| Concept | Required information | Optional information / associations |
| --- | --- | --- |
| Sample | Stable ID, source location reference, actual filename, availability, and Favorite boolean. | Presentation-name override, notes, zero or one origin Pack, Category assignments, and Collection memberships. |
| Pack | Stable ID, name, and the source-directory association used to recognize reimports. | Description, cover reference, Category assignments, and Author credits. Origin Sample references follow the creation and empty-Pack rules above. |
| Collection | Stable ID, name, and an ordered membership list, which can be empty. | Description and cover reference. |
| Category | Stable ID and unique display name under the agreed matching policy. | Sample and Pack assignments. |
| Author | Stable ID and name. | Pack credits; no credit roles in this stage. |

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
  Samples. Their IDs, direct Categories, Favorite marks, and Collection
  memberships remain intact.
- Removing a Collection removes its presentation data and memberships, not
  its Samples or their audio.
- Removing catalog organization is distinct from deleting source audio.
  Metadata removal must never cascade into filesystem deletion.
- A missing source does not by itself remove a Sample's identity, organization,
  or memberships.
- Removing a Sample from the catalog requires confirmation showing affected
  references. Delete its catalog record, Favorite mark, annotations, Pack
  association, Category assignments, and Collection memberships, but keep its
  source audio. Preserve an exclusion for that canonical location so rescans
  do not undo the decision. Explicit reinclusion does not restore deleted data.
- Removing a Category or Author requires showing its uses and obtaining
  confirmation. Remove its assignments or credits, not the associated
  Samples, Packs, or files.
- Unregistering a source directory stops scanning it but retains its Samples
  and organization. Catalog retention alone does not authorize access to
  audio; playback and dragging still require an authorized location.
- Shared cover-asset cleanup remains a separate retention decision. Removing
  a reference must not delete an image still used by another entity.

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

| Concept | Responsibility |
| --- | --- |
| Library root / source directory | A user-selected directory registered for discovery, with scan state and outcomes; not the Library itself or a Pack. |
| File location | The expected source path, root associations, availability observations, and eventually an identified source version. |
| Technical metadata | Measurements from a known source version, such as duration, sample rate, channels, and format. |
| Waveform analysis | Rebuildable visualization data associated with a Sample, source version, and analysis version. |
| Cover asset | Image data referenced by a Pack or Collection; storage, sharing, and retention remain to be designed. |
| Organization suggestion | A proposed classification, grouping, or file action, distinct from accepted user data. |
| Task | A tracked operation with scope, progress, cancellation, and per-item outcomes. |
| File operation plan | Reviewable sources, destinations, conflicts, confirmation, and execution outcomes. |

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

The current implementation covers only the initial catalog and Favorite slice:

### Implemented Identity Policy

- Selected roots and discovered locations are canonicalized with `realpath`.
  A unique exact canonical path maps to one persistent Sample UUID.
- Reopening the same location recovers its ID and Favorite mark. Overlapping
  roots share that record through many-to-many root/Sample associations.
- Different locations remain different Samples even with equal names or
  content. Symlink discovery remains excluded by the scanner.
- Missing files retain IDs and Favorites. Successful rescans mark absent
  associations unavailable without deleting catalog records.
- No automatic move/relink or source-version detection exists. An external
  move creates a new ID; replacing a file at the same location inherits that
  location record. This is an accepted initial limitation, not a content
  identity guarantee or the intended in-app relocation behavior.
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

- Pack sample-ordering behavior and presentation of package-import conflicts,
  including a reimport after manual origin corrections.
- Text length limits, comparison details for Category names, and validation of
  notes, descriptions, and imported cover images.
- The explicit reinclusion workflow for excluded locations, including how it
  interacts with overlapping registered roots.
- Identity beyond canonical location: copies, multiple physical locations,
  external changes, source-version detection, and confirmed relinking.
- Cover-asset sharing and retention after reference removal.

The approved persistence direction is SQLite with `better-sqlite3`, retaining
the catalog worker. This is not implemented: the current driver remains
`node:sqlite`. Plan and validate that driver replacement separately before
extending the schema, preserving the existing catalog and its IDs/Favorites.
See [Data Access](data-access.md#approved-persistence-direction-planned).

Next, map these logical profiles and rules to SQLite tables, constraints,
indexes, and versioned migrations. Plan directory layout, covers, cache limits
and invalidation, and waveform peaks separately. Keep durable user organization
separate from rebuildable analysis.

Export, file-conflict policies, automatic suggestions, durable task states,
retry behavior, and source-deletion verification require their own scoped
decisions. Kits, Tags, accounts, multiple Libraries, and named favorite lists
must not enter storage planning as already-approved entities.

Record approved decisions here as scope evolves. Add executable contracts and
tests in the owning feature; this document is not a substitute for runtime
validation.
