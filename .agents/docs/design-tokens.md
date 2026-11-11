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

Figma collections are created per token type, not per set. Figma never sees the
`primitives` / `semantic` split.

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

## Bringing a Figma change back

The repository is canonical, so a Figma edit arrives as a pull request, never as
a direct write. Today this loop is manual; the rules below are the contract any
automation must satisfy.

1. Design edits tokens in Tokens Studio and applies them.
2. Design exports the `primitives` and `semantic` sets as JSON.
3. The export is inverse-projected: `"#BFC0C2"` and `"16px"` and shadow strings
   become DTCG objects again, and the `fontFamily` fallback list is restored.
4. The result is merged **surgically** into `tokens/**/*.json`:
   - only leaves present in the export are updated
   - a token missing from the export is never deleted
   - `$description` never comes from Figma
   - every change is listed for review
5. `pnpm tokens` regenerates the CSS, and the resulting diff is the review
   artifact: it shows the change in the language the application speaks.
6. The pull request is reviewed like any other contract change.

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

Once the projection exists, the required test is idempotency: project, inverse
project, and diff against the original files. It must be empty.

## Known limitations

- `shadow` and `border` composites carry nested objects that Tokens Studio does
  not apply. Shadow is flattened to a CSS string; border flattening is not yet
  decided.
- `font.family` cannot be a usable variable. It stays in the projection because
  semantic typography aliases reference it.
- Group `$description` never reaches Figma. Read it in the repository.
- Section placement in Tokens Studio does not match DTCG types, by decision.
- The projection and inverse projection are manual today. No script exists yet,
  so a token edit that skips the loop can drift until `pnpm tokens` is run.

## Provenance

Verified 2026-11-11 against Style Dictionary 5.8.0, Tokens Studio for Figma
2.13.2, and the `tokens/` tree as committed on that date. Re-verify the consumer
table before trusting it after a tool upgrade.
