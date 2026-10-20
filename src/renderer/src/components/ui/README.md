# Kiter UI foundations

The current visual foundation is dark-only and uses locally bundled Instrument
Sans, with system fonts as fallback. Surfaces use neutral blacks and grays, with an off-white accent for primary
actions, focus and active states. Red remains reserved for errors. Shared colors,
control/surface radii and small text sizes live in
`../../assets/base.css`. Focus styling lives in `../../assets/main.css`.
Component styles remain beside their owners; feature behavior does not belong
in these primitives.

## Token conventions

The token sources live in [`tokens/`](../../../../../tokens), outside application
code. The root [`config.json`](../../../../../config.json) discovers primitive and
semantic JSON files for Style Dictionary. They use `$value`, `$type` and
`{token.path}` references. Run `pnpm tokens` from the repository root to generate
[`src/styles/tokens.css`](../../../../../src/styles/tokens.css). This file is
generated: edit the source JSON and regenerate rather than editing its CSS.
The renderer does not import it yet; application consumption remains separate
work, so the conventions below are not a claim that the current renderer already
follows them. The JSON tokens are the source of truth for these design decisions.

The interchange format follows the DTCG 2025.10
[Format Module](https://www.designtokens.org/tr/2025.10/format/) and
[Color Module](https://www.designtokens.org/tr/2025.10/color/). These are Final
Community Group Reports from the W3C Design Tokens Community Group, not W3C
Recommendations. Token naming, the 4px spacing scale and Kiter's palette remain
local design decisions, not requirements imposed by DTCG. The existing `.json`
filenames are retained; `.tokens.json` is a recommended, not mandatory, extension.

### DTCG value format

- Dimensions use an object such as `{ "value": 16, "unit": "px" }`, not a CSS
  string such as `"16px"`. Zero also requires an explicit unit.
- Colors use `colorSpace`, `components` and optional `alpha`/`hex`. The palette
  uses `srgb`, normalized components and an optional six-digit hex fallback;
  transparency is an alpha value, not the CSS keyword `transparent`.
- Font-family tokens use an ordered string array; font weights are numbers.
- Unitless line-height tokens use `$type: number` and font-size multipliers.
- Typography uses composite `$type: typography` tokens with `fontFamily`,
  `fontSize`, `fontWeight`, `letterSpacing` and `lineHeight` properties. The
  properties use these exact DTCG spellings, not the kebab-case token naming rule.
- Shadows use composite `$type: shadow` values with structured `color`,
  `offsetX`, `offsetY`, `blur`, `spread` and optional `inset`, not CSS strings.
- References such as `{color.slate.900}` remain strings and resolve to the entire
  referenced token value, including structured values.

```text
primitives: raw palette, dimensions and font values
    -> semantic: interface roles referencing primitives
        -> components: consume roles, not palette steps
```

- Use lowercase, kebab-case segments and dot-separated token paths. Do not put
  dots in individual JSON keys. Numeric palette and scale steps are identifiers,
  not CSS property names.
- Primitives contain raw values. Semantic aliases reference primitives directly;
  semantic composites reference primitives in each property. Do not duplicate
  raw values or reverse the dependency direction.
- Do not create a second primitive for the same value within a category merely
  because it serves another role. Different semantic aliases may share a
  primitive. Keep close palette values only when they serve distinct visual roles.
- Do not introduce component-specific tokens until a component has a real need
  that the shared roles cannot express. New token roles do not imply new states
  or behavior have been implemented.

### Spacing: a 4px layout grid

[`primitives/space.json`](../../../../../tokens/primitives/space.json) defines
`space.n = n * 4px`. Use the following supported steps rather than assuming every
integer is available:

| Token      | Value | Intended use                                          |
| ---------- | ----- | ----------------------------------------------------- |
| `space.0`  | 0px   | Resets                                                |
| `space.1`  | 4px   | Closely related items                                 |
| `space.2`  | 8px   | Control content and compact groups                    |
| `space.3`  | 12px  | Adjacent controls and list content                    |
| `space.4`  | 16px  | Panel content and form groups                         |
| `space.5`  | 20px  | Intermediate group separation                         |
| `space.6`  | 24px  | Workspace gutters and major groups                    |
| `space.7`  | 28px  | Intermediate panel or section spacing                 |
| `space.8`  | 32px  | Section separation                                    |
| `space.9`  | 36px  | Intermediate section spacing                          |
| `space.10` | 40px  | Spacious layouts when justified                       |
| `space.11` | 44px  | Intermediate large section spacing                    |
| `space.12` | 48px  | Large section separation, not default desktop padding |
| `space.14` | 56px  | Featured header and section separation                |
| `space.16` | 64px  | Large content groups in wide layouts                  |
| `space.20` | 80px  | Spacious introductory regions                         |
| `space.24` | 96px  | Exceptional large-layout separation                   |
| `space.32` | 128px | Maximum supported separation for spacious regions     |

Keep text left-aligned and space within a group smaller than space between
groups. Compose horizontal/vertical padding from these values; do not create a
token for every shorthand combination. `auto` stays a CSS keyword.
The 56–128px steps support featured or spacious layouts, not ordinary list rows,
form fields or compact windows. Reduce spacing to an appropriate supported step
when content is constrained; do not use large spacing to force empty viewport
height or fixed header dimensions.

The spacing scale has no exception or compatibility groups. Accessibility helper
offsets, borders and focus outlines are not layout spacing and need not be
multiples of four. Keep those values in their owning helper or geometry contract,
not in `space`. Review a control's total height, baseline and native behavior when
applying the scale; do not obtain control sizing by blindly rounding old padding.

### Radius: dimensions with semantic roles

[`primitives/radius.json`](../../../../../tokens/primitives/radius.json) defines
`radius.0`, `radius.4` and `radius.8` as literal 0px, 4px and 8px dimensions. Unlike
spacing steps, radius numbers are their pixel values, not multipliers. There is no
standard `radius` token type: use `$type: dimension` for primitives and aliases.

[`semantic/radius.json`](../../../../../tokens/semantic/radius.json) defines the
component-facing contract:

| Role             | Primitive        | Usage                                  |
| ---------------- | ---------------- | -------------------------------------- |
| `radius.none`    | `radius.0` (0px) | Rows, flush surfaces and square edges  |
| `radius.control` | `radius.4` (4px) | Buttons, fields, badges and menu items |
| `radius.surface` | `radius.8` (8px) | Dialogs, popovers, cards and toasts    |

The restrained 4/8px pairing distinguishes controls from containers without
rounding every region into a card. Do not add pill or circular radii until a
specific component needs them. Radius is an independent scale; sharing values
with spacing does not make spacing tokens appropriate for corner geometry.

### Color: name the job, not the shade

[`semantic/color.json`](../../../../../tokens/semantic/color.json) is the UI
palette contract. The six supplied HEX values are authoritative; RGB values in
DTCG are normalized from them. CMYK, HSB and HSL copies are not stored as competing
sources of truth.

| Supplied primitive | HEX       | Design role                                   |
| ------------------ | --------- | --------------------------------------------- |
| `color.slate.900`  | `#292D34` | Main workspace background                     |
| `color.white`      | `#FFFFFF` | Primary text                                  |
| `color.yellow.500` | `#FFC800` | Primary actions                               |
| `color.pink.500`   | `#FD71AF` | Invalid control borders; basis for error text |
| `color.cyan.500`   | `#49CCF9` | Keyboard focus                                |
| `color.violet.500` | `#7B68EE` | Basis for selected surfaces and markers       |

Keep the workspace predominantly slate and white. Yellow is the primary visual
accent; cyan, violet and pink identify focus, selection and errors rather than
decorate unrelated content. Layout, type and alignment do not change with the
palette. Asset-specific colors are not part of the interface token palette.

Supporting shades are explicit raw primitives derived by rounded sRGB channel
mixing, not runtime color calculations: slate 950 mixes 20% black into the base;
850/800/700/500/300 mix 5/10/16/50/70% white. Yellow 400, pink 400 and violet 400
mix 20% white into their supplied base colors. Violet 900 mixes 25% violet 500
with 75% slate 900. The original six HEX values remain unchanged.

| Role family       | Examples                                                                                               | Usage                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `color.surface`   | `page`, `soft`, `muted`, `field`, `selection`                                                          | Containers and selected backgrounds                        |
| `color.text`      | `default`, `secondary`, `on-action`                                                                    | Foregrounds; `on-action` is for light primary action fills |
| `color.action`    | `primary`, `primary-hover`, `secondary`, `secondary-hover`, `secondary-active`, `ghost`, `ghost-hover` | Interactive fills, not text colors                         |
| `color.border`    | `default`, `control`, `hover`, `danger`                                                                | Separators, input boundaries, hover and invalid states     |
| `color.focus`     | `ring`                                                                                                 | Visible keyboard focus                                     |
| `color.selection` | `indicator`                                                                                            | Selected-item marker, distinct from keyboard focus         |
| `color.status`    | `danger`                                                                                               | Error text, paired with explanatory content                |
| `color.backdrop`  | `inspector`, `dialog`                                                                                  | Scrims, not opaque surfaces                                |

Equal values do not imply equal roles: page and primary-action foreground are
both `#292D34`, but must remain independently themeable aliases. Focus and
selection must remain distinguishable without relying on color alone. Do not
invent success/warning hues or a disabled opacity without reviewing the actual
state. Before applying tokens, validate foreground/background pairs: 4.5:1 for
normal text and 3:1 for meaningful control boundaries and focus indicators against
their adjacent colors. Decorative separators are not control boundaries.

`color.status.danger` uses pink 400 (`#FD8DBF`) so small error text maintains at
least 4.5:1 against all defined opaque dark surfaces. The original pink 500 remains
the invalid-border color. `color.selection.indicator` uses violet 400 (`#9586F1`)
to maintain at least 3:1 against the selected surface. Do not use the original
violet as a small-text background with white text: that pair is only about 4.15:1.
`color.text.on-action` is for yellow primary fills, not every colored surface.
Focus rings should sit outside light action fills with a dark gap; cyan against
yellow alone is not a sufficient boundary. These are token-level contrast checks,
not a claim of completed rendered or cross-platform accessibility validation.

### Typography: explicit text roles

[`primitives/typography.json`](../../../../../tokens/primitives/typography.json)
owns raw values;
[`semantic/typography.json`](../../../../../tokens/semantic/typography.json) owns
role recipes. Each recipe supplies `fontFamily`, `fontSize`, `fontWeight`,
`letterSpacing` and `lineHeight` in one composite `$type: typography` token.
Apply all five properties together instead of assembling arbitrary combinations.
For example, `typography.body` contains `fontSize: "{font.size.14}"` and
`lineHeight: "{font.line-height.normal}"`. These properties are part of one
token's `$value`, not separate tokens addressable as `{typography.body.size}`.
When generating CSS, preserve `letterSpacing` separately: the CSS `font`
shorthand cannot express it. The configured Style Dictionary CSS platform uses
`expand: { include: ['typography'] }` before the `css` transform group to export
the five properties separately rather than lose letter spacing in a shorthand.

Use Instrument Sans for every text role, including controls and display styles.
The primitive `font.family.instrument-sans` defines the ordered stack
`Instrument Sans`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
System families are fallback only, not a second visual identity. Weights remain
400, 500 and 600; sizes, line-height multipliers and letter spacing are unchanged.

The renderer loads unmodified Latin and extended-Latin variable WOFF2 assets from
`@fontsource-variable/instrument-sans` through `assets/fonts.css`. Its local
`@font-face` definitions use the token's `Instrument Sans` family name and the
font's 400–700 weight range, with `font-display: swap`. Vite emits the referenced
assets into `out/renderer/assets`; there is no runtime dependency on Google Fonts
or another remote service. The SIL Open Font License and copyright notice are
copied from `public/licenses/instrument-sans-OFL.txt` into the renderer build.

`assets/base.css` applies the same family stack globally; buttons and inputs
inherit it. This font-only integration does not import the full generated token
CSS or change the current palette. The token source declares the family name,
while the local `@font-face` definitions load the actual font. Review native
controls, glyph coverage beyond Latin/extended Latin and fallback behavior on
each target platform. Display styles are reserved for featured introductions and
entity headers, not ordinary workspace text. Use
`font-variant-numeric: tabular-nums` where timing data needs stable alignment.

| Role                        | Font size | Line-height multiplier | Weight | Usage                                           |
| --------------------------- | --------- | ---------------------- | -----: | ----------------------------------------------- |
| `typography.caption`        | 12px      | 1.5 (`normal`)         |    400 | Supporting metadata and durations               |
| `typography.label`          | 12px      | 1.5 (`normal`)         |    500 | Field labels and compact group headings         |
| `typography.control`        | 13px      | 1.5 (`normal`)         |    500 | Buttons, compact inputs and selects             |
| `typography.body`           | 14px      | 1.5 (`normal`)         |    400 | Sample names, navigation and reading text       |
| `typography.body-strong`    | 14px      | 1.5 (`normal`)         |    600 | Selection and inline emphasis                   |
| `typography.section`        | 18px      | 1.25 (`tight`)         |    600 | Inspector, dialog and section headings          |
| `typography.title`          | 24px      | 1.25 (`tight`)         |    600 | View titles                                     |
| `typography.display.small`  | 32px      | 1.25 (`tight`)         |    600 | Compact featured Pack/Collection headers        |
| `typography.display.medium` | 40px      | 1.25 (`tight`)         |    600 | Featured entity or Home headers                 |
| `typography.display.large`  | 48px      | 1.25 (`tight`)         |    600 | One prominent introduction in a spacious layout |

Display is a semantic group, not a token by itself: reference an explicit style
such as `{typography.display.small}`. Sizes describe visual emphasis, not HTML
heading levels. Keep one dominant heading per region, allow long entity names to
wrap and select a smaller display style or `typography.title` in constrained
windows. No responsive switching is implemented by the token definitions alone.
The display styles retain the shared family, 600 weight and neutral letter
spacing; their distinction is scale, not decorative tracking or another font.

Font sizes do not follow the 4px spacing scale: 12/13/14px distinguish dense
metadata, controls and primary content. Line-height ratios are independent of
the layout grid and scale with font size: body is 14px * 1.5 = 21px, while title
is 24px * 1.25 = 30px. Control height and padding remain separate layout decisions.
The supported size primitives are 12/13/14/18/24/32/40/48px, weights are 400/500/600,
line-height multipliers are 1.25/1.5 and letter spacing is 0px. Every typography
primitive participates in a text role; there are no compatibility values.

Use sentence case, no automatic uppercase or decorative letter spacing. Keep
reading lines under roughly 80 characters and allow wrapping where the workflow
requires it. Do not use 12px captions for primary content, or fixed-height text
containers that clip at increased zoom. Validate actual font fallback, zoom,
native controls and truncation on macOS and Windows when migrating components;
the token definitions alone do not establish visual or accessibility support.

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

In the current renderer, the off-white accent identifies primary actions, focus
and active states. The target token palette separates these roles as documented
above. The selection
surface and inset marker distinguish the current navigation destination without
relying on color alone. Disabled controls remain visibly muted; they do not imply
that a background operation is running.

This is the controls/navigation/surfaces pass, not a completed responsive design
system. Sample-row density, inspector geometry and a custom player transport
remain separate design work. Native audio controls currently inherit the dark
color scheme.
