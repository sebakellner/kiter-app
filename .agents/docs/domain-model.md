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

- Has its own stable ID and presentation data: name, cover, and other package
  information whose required fields remain to be agreed.
- Groups Samples for which it is the origin Pack.
- Can have multiple Categories assigned directly to it.
- Can credit multiple Authors or collaborators. An Author can be credited on
  multiple Packs; whether credits are required remains open.
- Is distinct from the directory used to import it. A folder may supply a Pack,
  but its path is not the Pack's identity.

Importing a directory does not by itself establish that every directory or
subdirectory is a Pack. Pack boundaries and import mapping require a separate
product decision. New groupings created inside Kiter are Collections, not Packs.

### Collection

A Collection is a user-created selection, independent of package origin.

- Has its own stable ID and a required name.
- Can have an optional description and cover.
- Contains an ordered list of Sample references, with no repeated Sample ID
  within the same Collection.
- Can combine Samples from several Packs and standalone Samples.
- Has no Authors or Categories of its own in this stage.
- Does not change a Sample's origin Pack, Categories, or Favorite mark.

The same Sample may appear once in each of several Collections. Removing it
from one Collection does not remove it from the others or from the Library.

### Category

A Category represents an organizational classification, not a measurement
extracted from audio.

- Has a stable ID and display name.
- Samples and Packs can each have multiple Category assignments.
- Pack Categories do not automatically become its Samples' Categories.
- Category assignments are user-managed data, not disposable analysis output.

Vocabulary, hierarchy, uniqueness, and whether some Categories apply only to
Samples or only to Packs remain open. Inherited display or filtering behavior
must not be introduced implicitly.

### Author

An Author represents a declared credit, not the person using this installation
or the owner of its catalog.

- Has a stable ID and display data.
- Can be associated with multiple Packs.
- A Pack can be associated with multiple Authors or collaborators.
- Credits do not establish copyright ownership, a license, or usage rights.

Credit roles and any direct Sample-level credits are not defined in this stage.
Do not infer Sample authorship from Pack credits without an agreed rule.

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

Whether empty Packs are valid and how Pack membership is edited remain open.
These relationships do not require a separate class, table, or package for
every concept.

## Domain Operations and Rules

### Import and Rescan

- Import discovers and registers files without moving or modifying audio.
- Directory discovery and Pack registration are distinct concepts. Do not
  assume a folder import must create a Pack or that a folder is a Collection.
- Rescanning must preserve user organization, Favorite marks, and memberships.
  It must not silently replace user edits with inferred data.
- Repeated discovery of the same canonical location reuses the existing Sample.
  Overlapping imported roots must not duplicate that catalog record.
- Same-name files are not necessarily the same Sample. Equal content does not
  authorize merging records or deleting files.

An imported package that encounters Samples already associated with another
Pack needs an explicit conflict policy; the one-origin-Pack rule must not be
resolved by silently reassigning Samples.

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
- Removal policies for Samples, source directories, Categories, Authors, and
  shared cover assets must be agreed before implementing those actions.

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

- Pack detection and boundaries during import, repeated package imports, and
  handling of Samples already assigned to a different Pack.
- Pack required fields, empty Packs, membership editing, ordering, and name
  uniqueness. Collection name uniqueness and empty Collections also remain open.
- Category vocabulary, applicable targets, hierarchy, naming, and removal.
- Author required fields, credit roles, naming, removal, and whether direct
  Sample credits are needed.
- Sample/catalog removal and source-directory removal with existing references.
- Identity beyond canonical location: copies, multiple physical locations,
  external changes, source-version detection, and confirmed relinking.

Once the domain baseline is established, plan local persistence, migrations,
directory layout, covers, cache limits and invalidation, and waveform peaks.
Keep durable user organization separate from rebuildable analysis.

Export, file-conflict policies, automatic suggestions, durable task states,
retry behavior, and source-deletion verification require their own scoped
decisions. Kits, Tags, accounts, multiple Libraries, and named favorite lists
must not enter storage planning as already-approved entities.

Record approved decisions here as scope evolves. Add executable contracts and
tests in the owning feature; this document is not a substitute for runtime
validation.
