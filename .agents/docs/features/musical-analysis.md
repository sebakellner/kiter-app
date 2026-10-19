# Musical Analysis

Read when changing automatic BPM/tonality detection, manual musical edits,
confidence, source invalidation, or effective musical values. These business rules
are agreed, not implemented analyzer capabilities. [Domain Model](../domain-model.md)
owns source identity and the distinction between observed, estimated, and edited
data; [Search](search.md) owns musical filters and [Export](export.md) owns manifests.

## Automatic and Manual Layers

- Detect BPM and tonality locally in background after import, gradually including
  existing Samples. Do not block import or preview on analysis. Estimates are
  usable automatically without requiring user acceptance, but must be visibly
  identified as estimates rather than confirmed facts.
- Keep automatic results and manual decisions separate per attribute. The
  effective value is the manual decision when present, otherwise a valid automatic
  estimate. Reanalysis updates only the automatic layer and never overwrites edits.
- A manual decision can specify a value, Unknown, or Not applicable. Manual Unknown
  suppresses automatic use without deleting the estimate; Not applicable is an
  explicit user decision, never inferred from failure, Instrument, or Loop/One-Shot.
  Use automatic explicitly clears the manual decision and exposes any valid
  estimate, or Unknown when none exists.
- Edit these decisions in the inspector's atomic metadata Save/Cancel draft with
  names, notes, and classifications. Preserve the shared validation/conflict and
  dirty-draft rules. Bulk musical editing is outside this initial delivery.
- Persist estimates with analyzer/version, source version, confidence and relevant
  ambiguity/provenance. Do not infer verified measurements from filenames. A
  source change invalidates automatic results; stale estimates are not effective.
- Preserve manual decisions across rescans, origin changes, and source changes.
  After source replacement/change, identify decisions made against a previous
  source version and offer review; keep them effective until explicitly changed.

## Values and Uncertainty

- BPM is any positive finite number, including decimals, without an arbitrary
  musical min/max. Unknown and Not applicable are not numeric zero. Define
  representational precision before delivery without silently rounding accepted
  values into different meanings or inventing measured precision.
- Tonality uses one of 12 pitch classes and one mode: Major/Ionian, Minor/Aeolian,
  Dorian, Phrygian, Lydian, Mixolydian, or Locrian. Equivalent enharmonic tonic
  names identify the same pitch class, not distinct keys; synonymous mode names
  identify one mode. Do not add Camelot/Open Key notation in this delivery.
- The manual vocabulary does not establish analyzer capabilities. Declare which
  modes the chosen analyzer can actually estimate; never fabricate mode detection
  from a major/minor-only result. Exact canonical spelling is a display contract.
- Treat BPM and tonality independently: one may be known while the other is not.
  Not every Sample has a reliable pulse or tonal center; neither Instrument nor
  duration nor Sample type proves one exists.
- Low-confidence or unresolved ambiguous automatic results leave the effective
  automatic value Unknown. Detail may expose uncertain candidates, including
  half/double-tempo ambiguity, without activating them as effective metadata.
  Users may enter a manual value. Confidence is not certainty or a universally
  comparable percentage; analyzer-specific acceptance criteria require validation
  on representative audio before estimates are enabled.

## Scheduling, Failure, and Presentation

- Use the background analysis lifecycle owned by
  [Duration Analysis](duration-analysis.md#scheduling-and-lifecycle): bounded and
  deduplicated work, explicit-request priority, persistent analysis pause,
  automatic restart of pending analysis unless paused, controlled retries, and
  safe shutdown. Musical analysis is not a confirmed file/catalog operation in
  the shared serial queue; it must respect its coordination and backup barriers.
- Support explicit analyze/reanalyze. Keep source-unavailability and extraction/
  analyzer failures separate; no indefinite same-version retries. Source changes
  and verified renewed access follow the duration retry policy. A musical failure
  does not fail a completed import, duration analysis, waveform, or preview.
- Show the effective BPM/tonality in selected row fields and inspector with
  automatic/manual provenance. Expose estimate confidence, source/version context,
  ambiguity, and manual override separately in detail; do not present a manual
  value as analyzer-verified or a stale estimate as current.
- Search uses effective values and explicit state/provenance filters. Optional
  export manifests may include effective musical values and their provenance;
  never embed these values into source audio.

## Remaining Delivery Contracts

Choose and validate a local analyzer and its codecs/mode coverage, calibrated
acceptance/ambiguity criteria, numeric representation, canonical tonic spelling,
schema/migrations, source/result tokens, bounded scheduling budgets, worker
placement, atomic inspector commands, IPC, query indexes, manifest representation,
and visual controls. Validate detection with representative audio; a chosen library
or passing mock does not establish accuracy or supported modes. No analyzer or
confidence threshold is approved solely by these product rules.
