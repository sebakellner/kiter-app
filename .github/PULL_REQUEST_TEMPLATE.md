## What

<!-- What this PR delivers and why. Two or three bullets, not a changelog. -->

-

## Changes

| File | Change |
| ---- | ------ |
| ``   |        |

## Verification

<!-- Record the commands you actually ran and what they returned. Never mark a check you did not run. -->

- `pnpm typecheck` —
- `pnpm test` —
- `pnpm test:ui` — (when renderer behavior changed)
- Tested platforms: macOS ☐ · Windows ☐
- Not verified:

## Scope

**Out of scope:**

## Risk

<!--
One line, per the ODD Task Size rule: `Risk: none` or `Risk: item N (<reason>)`.
Item 1 data or irreversible effects · 2 security · 3 contracts others consume ·
4 concurrency · 5 delivery or environment · 6 no test would catch a regression.
A named item means the change needs its verification evidence above.
-->

Risk:

## Checklist

- [ ] Behavior changes update their owning guide under `.agents/docs/`
- [ ] New or changed commands, options and messages have updated help text and docs
- [ ] Source audio is never modified, and renames, moves or exports follow an explicit user action
- [ ] No local database is reset, deleted or rewritten destructively; migrations stay additive
- [ ] `odd/` working documents are not committed (the directory is git-ignored and local-only)
- [ ] Commits are Conventional Commits with no `Co-Authored-By` trailer
- [ ] Review workload is stated when the diff exceeds the advisory 400 authored lines
