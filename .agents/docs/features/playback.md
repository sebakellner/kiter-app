# Playback

Read when changing shared preview, player transport, playback sequence snapshots,
last-Sample restoration, or playback/removal interactions. These are agreed planned
behaviors, not shipped controls. [UX Design](../ux-design.md) owns selection and
navigation; [Domain Model](../domain-model.md) owns Sample identity and source
authorization invariants. Visual/proportional-seek prototypes remain deferred.

## Player and Transport

The initial shell prototype keeps one audio element mounted across Home/Samples
navigation, with an empty state, native media controls, and an explicit Stop
action. Row preview retains its current play/stop behavior. The complete custom
transport and sequence contracts below remain planned.

- Keep one permanent global player mounted across navigation, including empty
  state. Show loaded Sample name, Play/Pause, Previous/Next, Stop, volume, mute,
  position, observed duration, Favorite, Locate, Loop, and automatic advance.
- Stop returns to zero while keeping the Sample loaded. Favorite acts on that
  Sample, not list selection. Locate opens it in Samples without interrupting
  audio; apply [Search navigation](search.md#navigation-and-results) and dirty
  draft rules.
- Use a seekable progress bar, not a player waveform. Keyboard-accessible seeking
  distinguishes unknown duration. Seeking paused changes position without playing.
- With seek focused, Left/Right uses a duration-relative step and fine alternative;
  Home/End seek start/end when known. Prototype bounds/gestures and never seek
  outside duration.
- Persist preview volume under Preferences. Mute stays session-only, preserving
  the saved level rather than writing zero; adjusting volume removes mute.
  Settings/player share one live preference, with feedback on persistence failure
  under [Profile and Settings](../ux-design.md#profile-and-settings--agreed).
- With no loaded identity show Choose a sample to preview and disabled transport.
  Existing inaccessible identities use unavailable state, not empty state.

## Sequence Semantics

- Explicit list preview establishes sequence over the entire filtered result in
  displayed order, not loaded pages. Resolve through bounded queries, not eager
  loading/decoding. Previous/Next can traverse without automatic advance.
- New preview starts Loop and automatic advance off. Toggling the loaded Sample
  pause/resume is not a new preview; ended playback restarts at zero without
  recreating sequence/modes. Selection alone never changes playback.
- Previous/Next starts the destination even when paused. Previous always means
  preceding Sample, regardless of elapsed time. Without sequence Loop disable
  Previous/Next at respective ends; with it allow wrapping.
- Default end behavior is stop. Without automatic advance, Loop repeats the
  current Sample; with advance, Loop repeats the sequence, otherwise stops at end.
- Navigation or source-list filter/search/sort changes disable automatic advance
  while current audio continues. Disable sequence Loop too rather than silently
  switching to single-Sample Loop. Retain original sequence for manual transport,
  identify its origin, and never implicitly re-enable advance on transport.
- Freeze order/membership when starting. Later additions/reordering do not insert
  or rearrange entries. Skip entries invalid for original context and report
  missing context. Ordinary mutable offset pagination cannot provide this snapshot.
- Unplayable entries show visible failure and skip to the next with bounded
  traversal, including with Loop, to prevent endless loops. Use player-local
  expandable reasons rather than global notices while visible. If none are
  playable, stop traversal and retain a visible error.
- Unqueryable/empty-valid sequence is discarded with transport/modes disabled and
  explanation that a new list preview is needed. Keep usable current audio; do
  not offer retry of that discarded sequence.

## Restart and Source Availability

- Persist the last Sample ID, never an audio URL. Restore paused at zero without
  sequence, position, mute, Loop, or advance. Restore volume before playback.
- Main reauthorizes source before preview/drag. Deleted identity means empty
  player; inaccessible existing source retains identity, known reason, Locate,
  and Check again, with no preview/drag until authorized. Failure is not deletion.
- Last-Sample restoration and bounded sequence mechanics require new contracts;
  only internal volume persistence exists today. Preview duration does not replace
  [persisted duration analysis](duration-analysis.md).

## Source Replacement Interactions — Agreed, Not Implemented

- A playing Sample requires explicit Stop preview within source-replacement
  review before confirmation. A paused Sample needs no extra Stop action.
- After successful replacement of the loaded Sample's source, revoke its old
  source authorization and load the new source paused at zero, without the prior
  sequence or its Loop/advance modes. Main must authorize the new source; if that
  fails, retain the Sample identity with an accurate unavailable state.
- Replacement failure leaves the prior Sample loaded/paused and never resumes
  audio automatically. An unrelated Sample's replacement does not reload the
  current player.
- [Catalog Organization](catalog-organization.md#source-relinking--agreed-baseline-not-implemented)
  owns source review, identity preservation, and per-item execution/recovery.

## Source Registration Access Changes — Agreed, Not Implemented

- Confirming source unregistration revokes preview/drag authorization for Samples
  not authorized through another registered root. Stop active audio if it loses
  access. Keep the loaded Sample identity in an unavailable state with a reason;
  lack of authorization is not proof that the file is missing or deleted.
- Overlapping registered coverage preserves playback only through main's normal
  authorization checks. Reactivation never automatically resumes stopped audio;
  reauthorize before subsequent preview/drag.
- [Catalog Organization](catalog-organization.md#source-registration-lifecycle--agreed-not-implemented)
  owns unregister/reactivation review and optional rescanning.

## Removal Interactions

- A playing Sample requires Stop preview before catalog removal confirmation;
  its review provides that action. A paused Sample needs no extra Stop.
- Successful removal unloads it and revokes preview/drag authorization. Failure
  leaves it loaded/paused and does not resume automatically.
- Deleting the Pack/Collection playback context keeps current surviving audio
  playing but releases sequence, disables Previous/Next, advance, and sequence
  Loop, and explains the missing context. It does not delete surviving Samples.
- Catalog review and removal semantics belong to
  [Catalog Organization](catalog-organization.md#catalog-removal-and-reinclusion).
