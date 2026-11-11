# Design Tokens

Read this before changing token values, adding a token, or moving tokens
between the repository and Figma.

## Ownership

Design owns **values**. Engineering owns **structure**. The split follows the
existing folders almost exactly:

| What changes                          | Owner                  | Example                                       |
| ------------------------------------- | ---------------------- | --------------------------------------------- |
| A primitive value                     | Design                 | `color.slate.900`, `space.4`, `font.size.14`  |
| A semantic role's mapping             | Design and engineering | `color.action.primary` → `{color.yellow.400}` |
| Adding, removing, or renaming a token | Engineering            | a new `color.status-warning`                  |
| A token `$description`                | Engineering            | the intent notes on `color.slate`             |

A token is a contract before it is a value. `semantic/` is mostly relationships:
27 of its 44 tokens are color aliases with no value of their own. Changing an
alias changes intent, so it is reviewed like code.

## Source of truth

`tokens/**/*.json` is canonical. Everything else is derived:

```
tokens/**/*.json          DTCG, canonical, reviewed in pull requests
        │
        ├─ pnpm tokens ──►  src/styles/tokens.css     generated, never edited by hand
        │
        └─ projection ───►  Tokens Studio sets        consumed by design in Figma
```

`src/styles/tokens.css` is auto-generated from `config.json` (Style Dictionary).
Never edit it directly.

## The bridge

`pnpm tokens:bridge` starts a server on `127.0.0.1:4747` and the development
plugin at `figma/tokens-bridge/` talks to it. Both directions move one token
tree: the plugin only reads and writes Figma, and the server owns every
canonical shape.

| Action | Transport    | Effect                                                                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| Push   | `GET /push`  | project `tokens/`, create or update the variables in the `Kiter` collection, then the text and effect styles |
| Pull   | `POST /pull` | read the local variables, merge surgically into `tokens/`, then run `pnpm tokens` for the CSS                |

Nothing is ever deleted or renamed in Figma, and nothing is ever deleted from
the repository. A Figma change arrives as a pull request whose CSS diff is the
review artifact. Tokens Studio is no longer part of the sync path; its column
below records how the format behaves there, not how tokens travel.

## Canonical format

The repository uses the W3C DTCG format with `usesDtcg: true`:

- Every leaf has `$value` and `$type`. A leaf may have `$description`.
- `$description` on a **group** is documentation. It is never a token and it has
  no representation in Figma.
- Aliases use `{group.token}` and live only in `semantic/`, always pointing at a
  `primitives/` token. Primitives never reference each other.
- Composite types (`typography`, `shadow`, `border`) live in the file named after
  their group and reference primitives instead of inlining raw values, except in
  `primitives/` where raw values are the point.
- Values are structured, not CSS strings. Colors use the DTCG object form
  (`colorSpace`, `components`, optional `alpha`, optional `hex`); dimensions use
  `{ "value": 4, "unit": "px" }`.

## Consumer guarantees

Verified 2026-11-11 against Style Dictionary 5.8.0 and Tokens Studio for Figma
2.13.2. Re-verify this table when either version changes.

| Token shape                   | Repository | Style Dictionary 5.8.0 | Tokens Studio 2.13.2                                                               |
| ----------------------------- | ---------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `color` (object form)         | supported  | supported              | swatch renders, but the Figma variable is written as `0`; must be flattened        |
| `color` (alias string)        | supported  | supported              | supported                                                                          |
| `dimension` (`{value, unit}`) | supported  | supported              | renders in the plugin, but the Figma variable is written as `0`; must be flattened |
| `number`, `fontWeight`        | supported  | supported              | supported                                                                          |
| `fontFamily` (array)          | supported  | supported              | not a variable; materializes as a text style named after the font                  |
| `strokeStyle`                 | supported  | supported              | no equivalent type; appears under `Other`                                          |
| `typography` (composite)      | supported  | supported              | composite tokens are applied as text styles                                        |
| `shadow` (composite)          | supported  | supported              | nested objects are not applied; must be flattened to a CSS string                  |
| `border` (composite)          | supported  | supported              | see `shadow`; flatten before relying on it                                         |
| group `$description`          | supported  | ignored                | appears under `Other`                                                              |

## Vocabulary collisions

Tokens Studio's token type list predates DTCG. Its sections are not DTCG types:

| Tokens Studio section                                                               | DTCG type                        | Kiter tokens                                           |
| ----------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| `Color`                                                                             | `color`                          | 51                                                     |
| `Spacing`, `Sizing`, `Border Radius`, `Border Width`, `Font Size`, `Letter Spacing` | `dimension`                      | space, radius, border width, font size, letter spacing |
| `Line Height`, `Opacity`                                                            | `number`                         | font line height, opacity                              |
| `Font Family`, `Font Weight`                                                        | `fontFamily`, `fontWeight`       | 1, 3                                                   |
| `Border`, `Typography`, `Box Shadow`                                                | `border`, `typography`, `shadow` | 1, 11, 4                                               |
| `Text Case`, `Text Decoration`                                                      | `string`                         | unused                                                 |

**A token keeps its DTCG type in the projection.** `number` and `dimension` are
correct by the specification, so opacity and radii are deliberately not remapped
to `opacity`, `borderRadius`, or `spacing`. Remapping would add a rule in both
directions and would let a designer's edit silently change a token's declared
type. The resulting section placement in Tokens Studio is cosmetic.

Figma holds a single collection named `Kiter`, and a variable's name **is** the
token path with `/` separators: `color/slate/300`, `space/4`, `font/size/14`.
Figma never sees the `primitives` / `semantic` split; ownership of a returning
token is resolved by its path, never by a collection name.

## Projection to Figma

Three transformations, nothing else. All three are verified in Figma except the
shadow flattening, which is decided but still pending verification.

| #   | Transformation                                      | Example                                                                             |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Color object becomes a string                       | `{colorSpace, components, hex}` → `"#BFC0C2"`; with alpha → `"rgba(0, 0, 0, 0.28)"` |
| 2   | Dimension object becomes a unit string              | `{value: 16, unit: "px"}` → `"16px"`                                                |
| 3   | Group `$description` is dropped from the projection | stays authoritative in the repository                                               |

The string forms are chosen because the reverse direction can rebuild the object
form from them without guessing. Kiter's color components are exact 8-bit
`n / 255` values, so hex to components is lossless in both directions.

What the projection must **not** do:

- **Never drop a token.** Dropping one breaks every alias that references it. A
  useless Figma variable is cheaper than a broken reference.
- **Never remap types.** See Vocabulary collisions.
- **Never rewrite values it was not asked to rewrite.** Unchanged tokens must
  round-trip byte-identical, which is what the idempotency test checks.

The projection is generated. `tokens/**/*.json` stays in the repository format
regardless of what Figma needs.

The bridge then converts those flat values to what Figma actually stores: a
number for `FLOAT`, `{ r, g, b, a }` for `COLOR`, and a `{ alias: "<path>" }`
marker for a reference. The plugin never sees DTCG. Tokens that cannot be a
variable travel as styles instead: the `typography` composites become text
styles and the `shadow` tokens become effect styles. `border.control` and the
`font.family` array have no Figma representation at all.

## Bringing a Figma change back

The repository is canonical, so a Figma edit arrives as a pull request, never as
a direct write. The bridge automates the transport, not the decision.

1. Design edits variables in Figma and pulls from the plugin, which reads every
   local variable into raw values and posts them to the server.
2. The server inverse-projects them: raw numbers and color objects become DTCG
   objects again, aliases become `{group.token}` references, and the
   `fontFamily` fallback list is restored.
3. The result is merged **surgically** into `tokens/**/*.json`:
   - only paths the payload carries are updated
   - a token missing from the payload is never deleted
   - `$description` never comes from Figma
   - a path no file owns is reported and not written
   - every change is listed for review
4. `pnpm tokens` regenerates the CSS, and the resulting diff is the review
   artifact: it shows the change in the language the application speaks.
5. The pull request is reviewed like any other contract change.

Token identity is its **path**. The repository is the mapping table: a path that
exists today is updated where it already lives. Set names and Figma collection
names are display concerns and are never used to decide where a token belongs.

## Verification

```bash
pnpm tokens && git diff --exit-code src/styles/tokens.css   # the CSS is in sync
```

Manual import checklist for a full round of Tokens Studio: 110 tokens total,
**66 in `primitives`** and **44 in `semantic`**. A shortfall means a file did not
load completely.

The bridge has its own suite:

```bash
node --test tests/bridge/bridge.test.mjs tests/bridge/pull.test.mjs
```

The required test is idempotency: project, inverse project, and diff against the
original files. It must be empty, and a pull that changes nothing must write
nothing.

## Known limitations

- Styles are **push-only**. A designer edit of a text or effect style in Figma
  is overwritten by the next push and never pulled; only variables round-trip.
- `border.control` and the `font.family` array have no Figma representation, so
  Figma sees 108 of the 110 tokens. `border` has no style type and the family
  array only exists to compose the text styles.
- Figma holds whole pixels for line height, so `typography/section` becomes 23px
  where CSS renders 22.5px.
- Group `$description` never reaches Figma. Read it in the repository.
- Section placement in Tokens Studio does not match DTCG types, by decision.
- A pull that changes a token file can also change that file's key order and
  object wrapping: `JSON.parse` reorders integer-like keys and the repository
  uses `objectWrap: preserve`, so no serializer reproduces a file byte for byte.
  A pull that changes nothing writes nothing, and that is tested.
- Colors are 8-bit. An edit off the `n / 255` grid snaps to the nearest byte.

## Provenance

Verified 2026-11-11 against Style Dictionary 5.8.0, Tokens Studio for Figma
2.13.2, and the `tokens/` tree as committed on that date. Re-verify the consumer
table before trusting it after a tool upgrade.
