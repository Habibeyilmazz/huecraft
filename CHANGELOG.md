# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-11-21

First release.

### Added

- Core token generator in `src/core`, with no dependencies: OKLCH conversion, chroma-only gamut mapping to sRGB and
  Display P3, WCAG 2 contrast, APCA Lc, color-vision matrices.
- Six 11-step color scales (brand anchored on the input color, tinted neutral, success, warning, danger, info).
- Semantic tokens for light and dark themes that are moved to the nearest step meeting WCAG AA or AAA.
- Fluid modular type scale, spacing, radius and shadow scales.
- Exports: CSS custom properties, Tailwind v4 `@theme`, W3C design-tokens JSON, Figma variables payload, SCSS.
- Web studio (`src/app`): recipe controls, palette, live preview, contrast table and matrix, type and space
  specimens, export with copy and download, color-vision simulation, state in the URL.
- CLI (`src/cli.ts`, compiled to `dist-cli/` by `npm ci`).
- Unit tests (`npm test`), Playwright and axe end-to-end checks (`npm run e2e`), CI workflow, manual GitHub Pages
  workflow.

### Notes for the next contributor

- The studio is plain TypeScript and DOM, no framework. `main.ts` owns state and events, `views.ts` fills the output
  regions, `preview.ts` and `preview.css` are the sample UI and may only use exported custom properties.
- The studio chrome (`chrome.css`) is achromatic on purpose. Keep hue out of it.
- Imports use `.ts` extensions so Node can run the sources directly; `tsconfig.cli.json` rewrites them for the CLI
  build.
- The Tailwind and SCSS exports were compiled once by hand with Tailwind 4.3 and Dart Sass; there is no automated
  check for that. The Figma payload has not been sent to the Figma API.
- GitHub Pages is not enabled. The Pages workflow is manual only.
- Ports: dev server 4140, preview 4141, e2e 4142.
