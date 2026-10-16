# UI Patterns

Read this guide when changing interactions, forms, dialogs, or user feedback.
See [UX Design](ux-design.md) for shell, views, navigation, and workflow decisions,
[Component Organization](component-organization.md) for component ownership,
and [Common Guidelines](common-guidelines.md) for English-first wording.

## Basic Rules

- Reuse UI primitives from `components/ui/` as they are introduced. Keep
  Sample, Pack, Collection, and task behavior in their owning features.
- Use semantic controls, visible focus, accessible names, and keyboard access.
  Native dragging should complement other interactions, not replace them.
- Distinguish loading, empty data, no search results, and errors. Preserve the
  last valid state when an operation fails.
- Show pending state and prevent conflicting submissions. Report success only
  after completion; partial results must remain distinguishable.
- Keep preview coordinated through one player. Do not let selection, playback,
  favorite status, and drag state implicitly change each other.
- Forms preserve recoverable input on failure. Dialogs restore focus on close
  and must not discard changes without an explicit policy.
- Before file mutations, show the affected sources, destinations, and conflicts
  and obtain confirmation. See [Architecture](architecture.md#safe-file-operations-planned).
- For long tasks, show progress and whether cancellation is available.
  Do not imply cancellation reverses already completed file changes.

## Forms and Inspector Drafts — Agreed, Planned

- Edit catalog presentation, not source files. Explicit Save/Cancel handles dirty
  drafts; never save on blur. Category assignments and Author credits share the
  text draft, independent on Samples/Packs. Save is atomic across that draft;
  invalid, failed, or stale data preserves all recoverable edits.
- Before changing inspector target, navigating, or closing dirty inspector, offer
  Save and continue, Discard and continue, or Stay. Transition only after successful
  save; failed validation/storage keeps draft and context. Cancel requests discard
  confirmation and restores last saved values only after confirmation.
- Covers/avatars are independent selection/preview/confirmation workflows, not
  included in text Save. Resolve dirty text first; confirmed image edits survive
  later text-draft discard. Manual origin correction is similarly separate under
  [Catalog Organization](features/catalog-organization.md#manual-origin-correction).
- Validate on blur and complete Save; after error, update feedback during
  correction. Domain contracts own field validation.
- Create Collections/Categories/Authors in minimal dialogs, then open detail after
  success, never before completion. Pack creation follows [Import](features/import.md).
  Escape requests dismissal with dirty protection; outside click does not dismiss.
- Assignment selectors can create missing Categories/Authors in nested dialogs.
  Return to selector, adding the entity to parent's draft rather than navigating;
  the created record persists if parent draft is discarded. Collection destination
  picker has its own equivalent exception in Catalog Organization.
- Cmd/Ctrl+Enter submits focused form. Enter alone keeps text/control semantics,
  including multiline newline and selector choice, rather than generic submission.
- Pending save shows Saving, disables editing/transition and duplicate submission
  until outcome. Existing audio continues, but overlay focus still governs player
  interaction. Failure restores editing with draft intact.
- Independent assignment changes conflict with a dirty inspector: preserve edits
  and compare affected saved values with proposals, choosing values per field
  without losing unrelated edits. Revalidate before atomic Save; reconciliation
  does not bypass stale-state checks. Clean inspectors may refresh normally.
- Existing combined metadata Save commands and visual conflict controls are not
  implied by these agreements. Shell exit/focus rules belong to
  [UX Design](ux-design.md#keyboard-focus-and-overlays--agreed).

## Feedback and Short Operations — Agreed, Planned

- Prefer local Favorite/Saved feedback; use a toast for easy-to-miss outcomes,
  such as membership removal, only after completion.
- Recoverable errors stay near the action; if context disappears, keep global
  notice with details. Field errors attach to fields and preserve drafts.
- Info/success without required action starts at five seconds, paused on hover/
  focus; validate accessibility. Errors/action-required notices never auto-dismiss.
- Partial batches provide persistent summary/counts and View results on request,
  not automatic result dialogs. Result retention/access belongs to
  [Operation Execution](features/operation-execution.md#history-and-result-access).
- Short batches stay pending in initiating context, block duplicate/conflicting
  controls only, and retain result access if user navigates. This does not bypass
  metadata form wait or import focus rules.
- Group/update notices per operation, never merging independent failures or
  erasing a failure with another success.
- No-results retains query/filter chips with targeted Clear actions, distinct from
  empty/loading/error. Refresh failure preserves prior valid data with update
  failure and Retry; without prior data retain criteria and show load error.
- Expanded errors contain explanation, affected entities, next action, and
  copyable operation/error reference, never stack/internal payloads. Follow privacy
  rules for copied diagnostics.
- Announce without stealing focus: success nonintrusively, errors as errors, and
  keyboard-accessible actions. Modals follow shell focus rules.
- Stale query data permits selected individual actions with current-state checks;
  destructive review is always fresh. Disable result-wide Select all until query
  is valid again. [Search](features/search.md) owns catalog-change refresh behavior.
