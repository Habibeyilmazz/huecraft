# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Feature round: status hues

- **Added: status hues are part of the recipe.** Four sliders under "Status hues" in the studio, `--success-hue`,
  `--warning-hue`, `--danger-hue` and `--info-hue` in the CLI, and `hs`, `hw`, `hd`, `hi` in shared links. Links
  without them keep the old fixed hues (150°, 75°, 25°, 245°). The export header lists only the hues that were moved.
  Why this one: picking a red, blue or green brand (the most common brand colors) gave a danger, info or success
  scale that looked like the brand, and there was no way to change it.
- **Added: hue clash warning** (`hueClashes` in `core/tokens.ts`). A status within 30° of a saturated brand or of
  another status is named under the sliders and on its palette row; the CLI writes a note to stderr and still exits 0.
  It warns only; nothing is moved automatically.
- Unit tests: hues are validated and round-trip, every pair still passes at every hue in 30° steps on five brands
  and both levels, clashes wrap around 0°, a near-grey brand never clashes, CLI flags and note. One more end-to-end
  check drives the slider.
- **Fixed: the brand color field clipped `oklch()` input** (65px wide at desktop). It now has the first line of the
  group to itself; the picker and "Surprise me" sit under it, in the same order for Tab as on screen.
- README screenshots refreshed for the new field layout. None of them shows the status sliders, which sit below
  the fold. The Pages workflow has still never run. Commits from here credit Opus 5.5, as the session's attribution note says.

Two rounds so far: a design and accessibility pass over the studio (screenshots at 1440, 1280, 1024, 820, 390 and
320px in both themes, a Tab walk of every panel, Windows contrast themes), and before it an independent first-run
review (a fresh clone, the README followed to the letter, then a read of the whole codebase).
A third round was a security pass, below.

### Security pass

- **Fixed: a shared link could freeze the studio.** `?b=rgb(` followed by a few thousand spaces made the color
  parser backtrack cubically (13 s at 4,000 characters, the CLI too). `parseColor` is linear now; a unit test and an
  end-to-end check load such inputs against a time limit.
- **Added a Content Security Policy** (a meta tag, since GitHub Pages sends no headers): only the site's own script
  runs; inline styles and `data:` fonts are allowed because the studio and Vite's build use them. An end-to-end
  check confirms an injected `<script>` and an inline `onerror` do not run and that no tab trips the policy. The
  axe check now runs with the policy bypassed, because axe is injected inline.
- **Workflows:** every action pinned to a commit SHA (tag in a comment), `persist-credentials: false` on checkout,
  and two CI steps that fail on an unpinned action or on an `npm audit` advisory of moderate or worse. The Pages
  build no longer calls `configure-pages`, which needs Pages access the read-only build job does not have. The Pages
  workflow has still never run.
- Checked, nothing to change: every `innerHTML` sink takes escaped or fixed text; URL errors are dropped, never
  shown; the URL's theme, vision and tab values are allow-listed; the CLI only writes to stdout; `npm audit` is
  clean; no secrets or personal data in the git history (the one email is the synthetic `fernhill.example`).

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
