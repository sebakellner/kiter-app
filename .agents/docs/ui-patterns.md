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
