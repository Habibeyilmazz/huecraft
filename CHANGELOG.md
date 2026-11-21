# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Two rounds so far: a design and accessibility pass over the studio (screenshots at 1440, 1280, 1024, 820, 390 and
320px in both themes, a Tab walk of every panel, Windows contrast themes), and before it an independent first-run
review (a fresh clone, the README followed to the letter, then a read of the whole codebase).

### Changed in the design pass

- **Tables stack by the room they have.** The token table and the contrast table turn each row into a small grid
  when their region is too narrow, using container queries. Before, the contrast table scrolled sideways and cut
  its suggestions off on any screen under about 1400px, because the recipe rail takes 316px.
- **Phone layout.** Two-row top bar, a format switch that fits one line, the selected tab scrolled into view, the
  Apply button under the verdict, and a preview table that drops two columns instead of hiding Status off screen.
- **Tabs are sticky**, so a long panel does not have to be scrolled back up to switch view.
- **Keyboard.** Each color scale is one Tab stop with arrow keys, Home and End along its swatches (66 stops became
  6). A table region is a Tab stop only while it has something to scroll.
- **Windows contrast themes** (`forced-colors`) keep the swatches, samples and preview, and show which option of a
  switch is selected. Before, every swatch was blank there.
- Contrast: moved tokens are rows with a swatch for the old and the new step; the matrix keeps its row labels
  while it scrolls sideways.
- Smaller things: the rule beside the rail reaches the footer; the preview dashboard has no blank band under its
  table; radius tiles sit four and three; the dark theme says why its shadows are faint; the color error has an
  icon, plainer words and `role="alert"`; a `noscript` message; comments set back in the export; the license line
  moved to a footer.
- README screenshots refreshed from the running build, with two phone screenshots added
  (`npm run e2e -- --shots`).

### Added

- The brand color can be written as `rgb()` or `oklch()` as well as hex, in the studio and the CLI
  (`parseColor` in `core/color.ts`). It is still stored as sRGB hex; an `oklch()` color outside sRGB loses chroma.
- The design-tokens JSON now has a `shadow` group per theme. Shadows were in every other text format but not there.

### Fixed

- Pressing Enter in the brand color field submitted the recipe form and reloaded the studio with the default recipe.
- Typing a six-digit hex no longer flashes the three-digit color it passes through. Three digits apply on Enter or
  when the field is left.
- README: it said every export starts with a comment holding the recreate command. Only CSS, Tailwind and SCSS do;
  the design-tokens JSON has it in `$description` and the Figma payload has none. It now also says that Figma's
  variables endpoint is Enterprise only.

### Checked, nothing to change

- Quickstart from a fresh clone: `npm ci`, `npm run dev`, the compiled CLI and `npx github:Habibeyilmazz/huecraft`.
- 24,066 recipes (4,011 brand colors, three tints, AA and AAA): no failing pair with fixing on, the brand color
  always kept exactly, lightness always falling from 50 to 950.
- The Tailwind export compiles with Tailwind CSS 4.3.5 and the SCSS export with Dart Sass. Still done by hand.
- The action versions in the Pages workflow exist. The workflow itself has still never run.

## [0.1.0] - 2026-11-21

First release.

### Added

- Core token generator in `src/core`, with no dependencies: OKLCH conversion, chroma-only gamut mapping to sRGB and
  Display P3, WCAG 2 contrast, APCA Lc, color-vision matrices.
- Six 11-step color scales (brand anchored on the input color, tinted neutral, success, warning, danger, info).
- Semantic tokens for light and dark themes that are moved to the nearest step meeting WCAG AA or AAA, checked
  against both the sRGB values and the Display P3 overrides.
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
- The Tailwind and SCSS exports were compiled by hand with Tailwind 4.3 and Dart Sass; there is no automated
  check for that. The Figma payload has not been sent to the Figma API (it needs an Enterprise plan and a token).
- Status hues are fixed and the brand color is sRGB only. Both are design limits listed in the README, not bugs.
- GitHub Pages is not enabled. The Pages workflow is manual only.
- Ports: dev server 4140, preview 4141, e2e 4142.
- Layout rules that depend on width belong in the container queries in `chrome.css` ("Tables in a narrow
  workspace") when they concern the workspace, because the rail changes how much room it has. The media queries
  are for the page frame only.
- Not checked in the design pass: a real screen reader, a real phone, Firefox and Safari. Everything was looked at
  in headless Chromium.
