# Contributing

Thanks for looking. huecraft is small on purpose: `src/core` has no dependencies and is shared by the studio and the CLI.

## Setup

```bash
npm ci
npm run dev          # studio on http://localhost:4140
```

Node.js 22.18 or newer.

## Before you open a pull request

```bash
npm run typecheck
npm test             # unit tests, node:test
npm run build && npm run e2e   # Playwright + axe; needs `npx playwright install chromium`
```

CI runs the same checks.

- Color math or token logic changes need a unit test next to the code (`src/core/*.test.ts`).
- Keep `src/core` free of dependencies and of DOM or Node APIs.
- UI changes must stay keyboard-usable and keep the axe audit clean in both themes.
- Describe only what works in the README and CHANGELOG; add a line under "Unreleased" in `CHANGELOG.md`.

## Reporting bugs

Use the bug template and include the share link (or the CLI command), the browser and what you expected.
