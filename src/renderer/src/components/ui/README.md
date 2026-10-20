# Kiter UI foundations

The current visual foundation is dark-only and uses the operating system's UI
font. Surfaces use neutral blacks and grays, with an off-white accent for primary
actions, focus and active states. Red remains reserved for errors. Shared colors,
control/surface radii and small text sizes live in
`../../assets/base.css`. Focus styling lives in `../../assets/main.css`.
Component styles remain beside their owners; feature behavior does not belong
in these primitives.

## Controls and surfaces

- `Button` defaults to `variant="secondary"` for ordinary actions. Use `primary`
  for the main action in a region or form, and `ghost` for low-emphasis actions.
  Variants preserve native button/link semantics, props and refs. Set `type="submit"`
  explicitly for form submission; navigation uses `as={Link}` or `as={NavLink}`.
- `Input`, `Select` and `Checkbox` retain native behavior. Text controls share
  border, background, text and focus colors. `aria-invalid="true"` marks invalid
  text/select controls. `Select` keeps its native picker rather than introducing
  custom keyboard behavior.
- `Dialog` and `Popover` share the panel surface, border and overlay shadow.
  Their existing modality, focus and dismissal behavior is unchanged.
- `Alert` composes `Dialog` for controlled confirmation with two footer buttons.
  Supply a title, description, explicit confirmation label and confirm/cancel
  callbacks. Optional children hold review details or feature-owned feedback.
  Cancel receives initial focus; Escape cancels and outside clicks do not dismiss.
  `pending` blocks both actions and dismissal; `confirmDisabled` blocks confirmation
  only. The caller owns async work, errors and closing after confirmed success.
- `Toast` provides success, info and error feedback without moving focus. Success
  and info expire after five seconds by default, preserving remaining time while
  hovered or focused. Errors stay until dismissed. The close button is accessible;
  Escape dismisses a focused toast without dismissing its surrounding modal.
  Treat each notice as immutable and mount a new keyed Toast for a new message.
  Mount a single `ToastProvider` around the app and call
  `const { showToast } = useToast()` from features. The provider owns session-only
  state and the private viewport; features do not import a store or mount a host.
  The viewport follows native dialogs so notifications stay visible and interactive
  above modal content, and survives route changes. `showToast` groups notices by
  optional operation identity and bounds the stack to five, removing only older
  transient notices to make room. Existing errors survive later successes;
  repeated failures for the same operation update that failure. When all five
  slots hold errors, additional independent notices are not added rather than
  evicting an unresolved error; feature-owned feedback remains authoritative.
  `useToast` requires a provider. Provider unmount clears its notifications and
  timers; no notification state is shared between separate providers.
- `Card` uses a quiet panel surface; selected cards and active sidebar links use
  the selection color. `Badge` is supporting information, not a primary action.

The accent identifies primary actions, focus and active states. The selection
surface and inset marker distinguish the current navigation destination without
relying on color alone. Disabled controls remain visibly muted; they do not imply
that a background operation is running.

This is the controls/navigation/surfaces pass, not a completed responsive design
system. Sample-row density, inspector geometry and a custom player transport
remain separate design work. Native audio controls currently inherit the dark
color scheme.
