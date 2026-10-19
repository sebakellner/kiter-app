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
