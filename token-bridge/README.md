# Token Bridge

A local bridge between the Kiter design tokens and Figma. `tokens/**/*.json` stays
canonical; the bridge only transports values in both directions.

The server is a dependency-free Node HTTP server that owns the canonical shapes.
The Figma plugin only reads and writes Figma. Nothing is ever deleted in Figma or
in the repository: a Figma change arrives as a pull request whose regenerated CSS
diff is the review artifact.

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
