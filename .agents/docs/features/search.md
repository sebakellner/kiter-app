# Search

Read when changing global/local library search, searchable fields, filters,
ranking, approximate matching, or result pagination. This guide owns those
contracts. [Domain Model](../domain-model.md) owns entity meanings;
[Classification](classification.md) owns recognition, which is not search.

## Status

The following baseline is agreed, not implemented library-wide queries or UI.
Current renderer remains folder-scoped. Validate initial thresholds/limits on real
libraries before delivery. Visual design/prototypes remain deferred.

## Query Scope and Matching

- Global search covers Samples, Packs, Collections, Categories, Authors, and
  Genres, with bounded grouped suggestions and full mixed results.
- Empty global search waits for input, without listing the library/query history.
  One character does not query; textual search starts at two. Query history is
  not persistent; navigation context is session-only.
- Search entity names, Sample filenames/relative source paths, notes/descriptions,
  and the explicit relationships below. Do not infer musical properties from audio.
- Samples match directly assigned Category/Author/Genre names and origin Pack
  name, not that Pack's classifications/credits. Packs match direct Category,
  Author, and Genre names. Collections, Categories, Authors, and Genres match their
  own text, not expansion through members/uses. Pending suggestions never count.
- Recognition aliases do not expand queries or activate filters.
- Match case/accent-insensitively with substrings; all query words must match,
  potentially in different searchable fields.
- First delivery is plain text: no AND/OR operators, minus exclusions, quoted
  exact phrases, or `genre:techno` filters. Punctuation parsing remains a technical
  contract, not implicit advanced syntax.
- Include matching unavailable Samples with accurate known availability. Inspect
  and organize them normally; main must verify authorized access for preview/drag.

## Relevance and Approximation

- Rank exact names first, then name prefixes/substrings, other text/relation
  matches, then approximate matches. Explain non-obvious reasons.
- Approximate only query words of at least four characters, allowing one insertion,
  deletion, substitution, or adjacent transposition (`tehcno` to techno). Do not
  approximate numbers/short terms such as 808, FX, or BD. All words still match.
- Within a tier: fewer approximately matched words, lower total edit distance,
  normalized name alphabetically, entity type, then stable ID. Do not boost
  Favorites, recent use, or import recency. Same data/query gives reproducible order.

## Filters and Local Search

- Mixed results filter by entity type. Samples-only results additionally offer
  Genre, Category, Author, Sample type, source roots, origin Pack/standalone,
  format, observed duration, and effective musical values below. Packs-only results
  offer direct Genre/Category/Author filters. Never apply Sample filters to other
  entities or expand by members.
- Returning to mixed results disables specific filters but retains their session
  configuration. Local search uses the same matching fields/relations for the
  owning view/tab, constrained to its scope.
- Samples/Favorites offer the same Sample filters above. Genre also filters Pack
  lists. Values within each group combine with OR; different groups use AND.
  Categories/Authors require at least one direct assignment in their own group,
  not inheritance. Availability is not an initial filter.
- Confirmed Sample types filter as Loop, One-Shot, or Unknown, selectable with OR.
  Free-text loop never implicitly activates that filter. Suggestions are excluded.
- Apply filter changes immediately, with removable active chips and Clear all.
  Empty local search keeps other filters. Keep input focus, reject stale responses,
  and never preview automatically because a query changed.

### Duration Range

- Use catalog-queryable observations, not transient preview/waveform duration.
  [Duration Analysis](duration-analysis.md) owns measurement and invalidation.
- Minimum/maximum are optional inclusive bounds. Accept decimal seconds or
  minutes:seconds (`1.5`, `1:30`) and normalize to seconds. Empty means no limit,
  not zero; reject negative/nonfinite bounds and inverted ranges without applying
  an invalid query.
- Compare stored values without rounding; display rounding cannot change matches.
  Unknown is not zero; a range excludes unknowns unless explicitly included.

### Musical Values

- [Musical Analysis](musical-analysis.md) owns effective BPM/tonality: a manual
  decision takes precedence over a valid automatic estimate. Filter the same
  effective values shown in the app, including usable automatic estimates; do
  not query stale/uncertain candidates as effective metadata.
- BPM bounds are optional, positive finite, and inclusive; compare without display
  rounding and reject inverted/invalid ranges without applying them. Unknown and
  Not applicable are excluded by numeric ranges unless explicitly included.
- Tonality filters offer tonic pitch classes and modes. Values within each group
  combine with OR; tonic/mode groups combine with AND and with other Sample
  filters. Match enharmonic equivalents exactly by pitch class; do not infer
  harmonic compatibility. Unknown/Not applicable need explicit inclusion.
- Offer state and automatic/manual provenance filters per musical attribute.
  Define combinations against effective values consistently, including manual
  Unknown/Not applicable. Free text does not implicitly activate musical filters.

## Navigation and Results

- Suggestions are grouped by entity; full results mix types by relevance with
  clear identification. Open an entity directly or view all results.
- Sample suggestions navigate to Samples, locating/selecting without autoplay.
  Clear local search/filters that would hide it. Locating from suggestions or
  player creates a history entry, even already in Samples; Back restores prior
  context. Resolve dirty drafts under [UX Design](../ux-design.md).
- Sample rows in full results keep normal selection/preview behavior: name previews,
  selection alone does not. Stable unavailable identities remain inspectable.
- Activating a Genre opens Samples filtered by it; support querying directly
  associated Packs. This adds no primary sidebar destination.

## Query Architecture and Catalog Changes

- Main validates requests; DB worker queries catalog through bounded operations.
  Never transfer the complete library to renderer. Use indexes, stable ordering,
  and pagination; introduce full-text indexing only when requirements justify it.
- Wait 250 ms after typing stops. At most five suggestions per entity type; full
  pages default to 50, maximum 100 per request. Reject obsolete responses in the
  owning renderer context. Validate these initial limits on representative data.
- Preserve last valid results with explicit refresh failure and Retry. Without
  prior results, show load error while retaining query/filters.
- Relevant catalog changes expose available updates without automatic reordering.
  Invalid pagination cannot append a different catalog version: require refresh,
  restarting at page one with same query/filters and valid selection preserved.
  This is not a retained complete query snapshot.
- Actions validate authoritative current state; stale results can support
  individual actions, but disable result-wide Select all until the query is valid.
  [UX Design](../ux-design.md#list-context-and-selection-restoration--agreed) owns
  selection/history behavior and separate Select all/playback snapshots.

## Remaining Technical Contracts

Define exact tokenization/plain-text punctuation, normalized sorting and entity
type order, cursor/version tokens, invalidation scope, indexed queries, bounded
approximate execution, IPC/error contracts, and duration parsing/storage access.
Validate agreed matching/ranking with real examples; passing development checks
does not establish large-library scalability.
