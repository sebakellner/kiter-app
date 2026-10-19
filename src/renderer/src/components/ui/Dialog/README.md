# Dialog

Controlled, unanchored modal surface backed by the native `<dialog>` element.
Use `Popover` for anchored surfaces.

```tsx
<Dialog open={open} onDismiss={requestClose} aria-labelledby={titleId}>
  <h2 id={titleId}>Create Collection</h2>
  <form onSubmit={submit}>
    {/* Fields and actions belong to the feature. */}
  </form>
</Dialog>
```

- Supply an accessible name through `aria-labelledby` or `aria-label`.
- `open` controls native modality and whether the content is mounted. Escape and
  native cancellation call `onDismiss`; they do not hide the surface by themselves.
  The owner can keep it open for dirty review or pending work.
- Native automatic dismissal is disabled, including the repeated-Escape path
  that can produce non-cancelable close requests in Chromium. Backdrop clicks
  never dismiss the dialog. Consumed Escape events do not dismiss an outer layer.
- Native focus containment stays within the modal. The browser chooses initial
  focus by default; `initialFocus` can reference a preferred descendant. Changing
  callbacks or children does not reopen the modal or reset focus. Closing or
  unmounting restores focus to the opener when it still exists.
- Native content attributes and keyboard handlers are supported. Direct native
  `open`, `closedby`, `onCancel` and `onClose` control is reserved for the primitive.
- Forms, React Hook Form/Zod integration, field errors, Enter/Cmd/Ctrl+Enter
  semantics, submission, dirty review, navigation and application-exit protection
  remain with the consuming feature. Dialog has no router, IPC or domain dependency.

Structural CSS centers the surface and bounds its size/scrolling. Feature-specific
form layout stays with the feature; this does not define a complete visual design.
