# Token Bridge

A local bridge between the Kiter design tokens and Figma. `tokens/**/*.json` stays
canonical; the bridge only transports values in both directions.

The server is a dependency-free Node HTTP server that owns the canonical shapes.
The Figma plugin only reads and writes Figma. A pull never deletes anything in
the repository: a Figma change arrives as a pull request whose regenerated CSS
diff is the review artifact. A push does overwrite the Figma variable set — see
[Stale variables](#stale-variables).

## Variable names

A repository token path never changes. Its Figma **variable name** does carry the
folder that owns the token:

| Token path             | Folder       | Variable name                   |
| ---------------------- | ------------ | ------------------------------- |
| `color.slate.300`      | `primitives` | `primitives/color/slate/300`    |
| `color.action.primary` | `semantic`   | `semantic/color/action/primary` |
| `space.4`              | `primitives` | `primitives/space/4`            |
| `border.width.1`       | `primitives` | `primitives/border/width/1`     |
| `border.control`       | `semantic`   | `semantic/border/control`       |
| `font.size.14`         | `primitives` | `primitives/font/size/14`       |

Figma groups variables by their first name segment, so the folder keeps
`color/`, `border/`, `opacity/`, `radius/` and `shadow/` from mixing a primitive
scale with a semantic role. An alias marker carries the folder that owns the
**target** token, so `semantic/color/status/error` points at
`primitives/color/red/400`.

A pull splits the first name segment off as the folder and accepts the name only
when that folder declares the remaining path in `tokens/**/*.json`. A name whose
folder does not own the path is reported and not written: the bridge never
guesses ownership, never creates a token, and never deletes or renames one. Text
and effect style names keep their current form (`typography/body`,
`shadow/black-28`); only variables and the bindings inside styles use the
prefixed name.

## Stale variables

A push carries the whole set, not a delta. A variable already in the Kiter
collection whose name the projected tree no longer produces is **parked**: it is
copied to `_stale/<YYYY-MM-DD>/<original name>` with its value and the original
is removed, so a rename in the repository cannot leave a dangling name behind.
Parking never touches another collection, never touches a name the tree still
produces, and never runs on an empty tree.

The push result reports `parked` and `parkedNames`, and the panel lists every
name it moved. Parking is reversible: the value is still under `_stale/`.

Deleting is a separate decision. `Purge parked variables` lists the parked names
older than **14 days**, and only a second click removes them. A name that is not
a parked variable of the Kiter collection is reported instead of deleted, and
text and effect styles are never parked or deleted.

## Endpoints

| Endpoint            | Direction    | Effect                                                                   |
| ------------------- | ------------ | ------------------------------------------------------------------------ |
| `GET /health`       | diagnostics  | repository root and token counts per folder                              |
| `GET /push`         | repo → Figma | project `tokens/` plus the text and effect styles the plugin creates     |
| `POST /pull`        | Figma → repo | merge local variables surgically into `tokens/`, then regenerate the CSS |
| `POST /pull-styles` | Figma → repo | match text styles by value and write only the composites that match      |

## Run the server

From the repository root (the server reads `tokens/` from the working directory):

```bash
pnpm tokens:bridge
```

It listens on `127.0.0.1:4747`. Override the port with `KITER_TOKENS_PORT`.

## Load the plugin

The plugin is a **Figma development plugin**: it is loaded from source and is not
published to the Figma community.

1. In Figma, choose **Plugins → Development → Import plugin from manifest…**
2. Select `token-bridge/figma/manifest.json`.
3. Keep the server running, then use **Push** or **Pull** in the plugin UI.

The manifest allows only `http://localhost:4747`.

## Tests

```bash
node --test token-bridge/src/*.test.mjs token-bridge/figma/*.test.mjs
```

They also run as part of `pnpm test:node`. `token-bridge/figma/sandbox.test.mjs`
executes `code.js` against a fake `figma` object to guard the plugin sandbox
contract.
