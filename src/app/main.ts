import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { CVD_MATRICES, formatOklch, hexToOklch, oklchToHex, parseColor, VISIONS, type Vision } from '../core/color.ts';
import { exportTokens, FORMATS, isFormat, type Format } from '../core/export.ts';
import { SCALE_NAMES, type ScaleName } from '../core/scales.ts';
import type { Theme } from '../core/semantic.ts';
import {
  buildTokens, DEFAULT_RECIPE, LIMITS, RATIOS, recipeFromParams, recipeToParams, type Recipe, type TokenSet,
} from '../core/tokens.ts';
import { PREVIEW_HTML } from './preview.ts';
import { renderCode, renderContrast, renderPalette, renderScale } from './views.ts';

const TABS = ['palette', 'preview', 'contrast', 'scale', 'export'] as const;
type Tab = (typeof TABS)[number];

const FORMAT_NOTES: Record<Format, string> = {
  css: 'Custom properties on :root, a dark theme for [data-theme="dark"] and the system setting, and wide-gamut overrides.',
  tailwind: 'An @theme block for your stylesheet. Colors become utilities such as bg-primary, text-text-muted and bg-brand-600.',
  json: 'W3C Design Tokens Community Group format (2025.10). Semantic tokens are aliases, and they and the shadows are grouped by theme.',
  figma: 'Request body for the Figma REST API endpoint POST /v1/files/:file_key/variables. Two collections: Primitives, and Semantic with Light and Dark modes.',
  scss: 'Sass maps for each scale, both themes and the type, space and radius scales.',
};
// Short names for the format switch, so all five fit on one line of a phone. The note under it says the rest.
const FORMAT_TABS: Record<Format, string> = { css: 'CSS', tailwind: 'Tailwind', json: 'JSON', figma: 'Figma', scss: 'SCSS' };
const RATIO_NAMES = ['Minor second', 'Major second', 'Minor third', 'Major third', 'Perfect fourth', 'Augmented fourth', 'Perfect fifth'];
const PRESETS: [name: string, hex: string][] = [
  ['Petrol', '#0c7c86'], ['Violet', '#7c3aed'], ['Cobalt', '#2456e6'], ['Raspberry', '#c81e5b'],
  ['Moss', '#4d7c2a'], ['Marigold', '#f2a900'], ['Ember', '#d9480f'], ['Graphite', '#2b2f36'],
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const radios = (name: string) => [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];

// ---- State, mirrored in the query string so any palette is a shareable link ----

interface State {
  recipe: Recipe;
  theme: Theme;
  vision: Vision;
  tab: Tab;
  format: Format;
  matrix: { fg: ScaleName; bg: ScaleName };
}

function readUrl(): Pick<State, 'recipe' | 'theme' | 'vision' | 'tab'> {
  const params = new URLSearchParams(location.search);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = params.get(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };
  return {
    recipe: recipeFromParams(params).recipe, // invalid fields fall back to defaults
    theme: pick<Theme>('th', ['light', 'dark'], matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    vision: pick('cv', VISIONS, 'normal'),
    tab: pick('tab', TABS, 'palette'),
  };
}

function stateUrl(): string {
  const params = recipeToParams(state.recipe);
  params.set('th', state.theme);
  if (state.vision !== 'normal') params.set('cv', state.vision);
  if (state.tab !== 'palette') params.set('tab', state.tab);
  return `${location.origin}${location.pathname}?${params}`;
}

const state: State = { ...readUrl(), format: 'css', matrix: { fg: 'neutral', bg: 'brand' } };
let tokens: TokenSet;

// ---- One-time DOM setup -------------------------------------------------------------

const tokenStyle = document.head.appendChild(document.createElement('style'));

// SVG filters for color-vision simulation. feColorMatrix works in linear RGB by default,
// which is the space the matrices are defined in.
document.body.insertAdjacentHTML(
  'beforeend',
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(CVD_MATRICES)
    .map(([name, m]) => `<filter id="cvd-${name}"><feColorMatrix type="matrix" values="${m.map((row) => `${row.join(' ')} 0 0`).join(' ')} 0 0 0 1 0"/></filter>`)
    .join('')}</defs></svg>`,
);

$('preview').innerHTML = PREVIEW_HTML;
// The preview is a specimen: its links and form go nowhere.
$('preview').addEventListener('click', (e) => {
  if ((e.target as Element).closest('a')) e.preventDefault();
});
$('preview').addEventListener('submit', (e) => e.preventDefault());

for (const key of ['tint', 'base', 'unit', 'radius'] as const) {
  const input = $<HTMLInputElement>(key);
  Object.assign(input, { min: LIMITS[key].min, max: LIMITS[key].max, step: LIMITS[key].step });
  input.addEventListener('input', () => change({ [key]: Number(input.value) }));
}
$('ratio').innerHTML = RATIOS.map((r, i) => `<option value="${r}">${r} ${RATIO_NAMES[i]}</option>`).join('');
$('presets').innerHTML = PRESETS.map(([name, hex]) =>
  `<button type="button" class="preset" data-hex="${hex}" style="background:${hex}" aria-label="${name}, ${hex}" title="${name}"></button>`).join('');
$('formats').insertAdjacentHTML('beforeend', Object.entries(FORMAT_TABS).map(([id, label]) =>
  `<label><input type="radio" name="format" value="${id}" /><span>${label}</span></label>`).join(''));
for (const id of ['matrix-fg', 'matrix-bg']) {
  $(id).innerHTML = SCALE_NAMES.map((n) => `<option value="${n}">${n[0]!.toUpperCase() + n.slice(1)}</option>`).join('');
}

// On small screens the secondary recipe groups fold away so the palette is close to the top.
const narrow = matchMedia('(max-width: 960px)');
const foldRecipe = () => ($<HTMLDetailsElement>('more').open = !narrow.matches);
narrow.addEventListener('change', foldRecipe);
foldRecipe();

// ---- Rendering ----------------------------------------------------------------------

let toastTimer = 0;
function toast(message: string): void {
  $('live').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($('live').textContent = ''), 2600);
}

async function copy(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Copying was blocked by the browser. Select the text and copy it by hand.');
  }
}

function syncControls(): void {
  const { recipe } = state;
  const hexInput = $<HTMLInputElement>('brand-hex');
  $<HTMLInputElement>('brand-picker').value = recipe.brand;
  // Do not rewrite the hex field under the caret while someone is typing in it.
  if (document.activeElement !== hexInput) {
    hexInput.value = recipe.brand;
    hexInput.removeAttribute('aria-invalid');
    $('brand-error').hidden = true;
  }
  $('brand-oklch').textContent = formatOklch(hexToOklch(recipe.brand));
  for (const preset of document.querySelectorAll<HTMLElement>('.preset')) {
    preset.setAttribute('aria-pressed', String(preset.dataset.hex === recipe.brand));
  }
  $<HTMLInputElement>('tint').value = String(recipe.tint);
  $('tint-out').textContent = `${Math.round(recipe.tint * 100)}%`;
  $<HTMLInputElement>('base').value = String(recipe.base);
  $('base-out').textContent = `${recipe.base}px`;
  $<HTMLInputElement>('unit').value = String(recipe.unit);
  $('unit-out').textContent = `${recipe.unit}px`;
  $<HTMLInputElement>('radius').value = String(recipe.radius);
  $('radius-out').textContent = `${Math.round(recipe.radius * 100)}%`;
  $<HTMLSelectElement>('ratio').value = String(recipe.ratio);
  $<HTMLInputElement>('fix').checked = recipe.fix;
  for (const r of radios('level')) r.checked = r.value === recipe.level;
  for (const r of radios('theme')) r.checked = r.value === state.theme;
  for (const r of radios('format')) r.checked = r.value === state.format;
  $<HTMLSelectElement>('vision').value = state.vision;
  $<HTMLSelectElement>('matrix-fg').value = state.matrix.fg;
  $<HTMLSelectElement>('matrix-bg').value = state.matrix.bg;
}

function render(): void {
  tokens = buildTokens(state.recipe);
  // The page is styled by the same CSS the Export tab hands out.
  tokenStyle.textContent = exportTokens(tokens, 'css');
  document.documentElement.dataset.theme = state.theme;
  // Filter the bar and the layout rather than <body>, so the fixed toast stays pinned to the viewport.
  for (const id of ['bar', 'layout']) $(id).style.filter = state.vision === 'normal' ? '' : `url(#cvd-${state.vision})`;

  syncControls();
  const brand = tokens.scales.brand;
  $('mini-ramp').innerHTML = brand.swatches
    .map((s, i) => `<i style="background:var(--color-brand-${s.step})"${i === brand.anchor ? ' class="is-anchor"' : ''}></i>`)
    .join('');

  for (const tab of TABS) {
    const selected = tab === state.tab;
    $(`tab-${tab}`).setAttribute('aria-selected', String(selected));
    $(`tab-${tab}`).tabIndex = selected ? 0 : -1;
    $(`panel-${tab}`).hidden = !selected;
  }
  renderPalette(tokens);
  renderContrast(tokens, state.theme, state.matrix);
  renderScale(tokens);
  renderCode(exportTokens(tokens, state.format), state.format !== 'json' && state.format !== 'figma');
  $('format-note').innerHTML = `<strong>${FORMATS[state.format].label}.</strong> ${FORMAT_NOTES[state.format]}`;

  const bars = [200, 400, 600, 800, 950].map((step, i) => {
    const hex = brand.swatches.find((s) => s.step === step)!.hex;
    return `<rect x="${i * 6 + 1}" y="5" width="6" height="22" fill="${hex}"/>`;
  });
  $<HTMLLinkElement>('favicon').href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${bars.join('')}</svg>`)}`;
}

let frame = 0;
let urlTimer = 0;
/** Coalesces bursts of input (slider drags) into one render per frame. */
function schedule(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
  // Browsers rate-limit history.replaceState, so the URL trails behind a little.
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => history.replaceState(null, '', stateUrl()), 250);
}

function change(patch: Partial<Recipe>): void {
  Object.assign(state.recipe, patch);
  schedule();
}

// ---- Events ---------------------------------------------------------------------------

// Enter in the color field would submit the form and reload the page without the recipe.
$('recipe').addEventListener('submit', (e) => e.preventDefault());
$<HTMLInputElement>('brand-picker').addEventListener('input', (e) => change({ brand: (e.target as HTMLInputElement).value }));
const hexInput = $<HTMLInputElement>('brand-hex');
function useTypedColor(): boolean {
  const hex = parseColor(hexInput.value);
  if (hex) {
    hexInput.removeAttribute('aria-invalid');
    $('brand-error').hidden = true;
    change({ brand: hex });
  }
  return hex !== null;
}
hexInput.addEventListener('input', () => {
  // Three hex digits are usually the first half of six, so they wait until the field is committed.
  if (!/^\s*#?[0-9a-f]{3}\s*$/i.test(hexInput.value)) useTypedColor();
});
// Report a bad value once the field is committed, not on every keystroke.
hexInput.addEventListener('change', () => {
  if (useTypedColor()) return;
  hexInput.setAttribute('aria-invalid', 'true');
  $('brand-error').hidden = false;
});
hexInput.addEventListener('blur', () => {
  if (parseColor(hexInput.value)) hexInput.value = state.recipe.brand;
});
$('presets').addEventListener('click', (e) => {
  const hex = (e.target as HTMLElement).closest<HTMLElement>('.preset')?.dataset.hex;
  if (hex) change({ brand: hex });
});
$('random').addEventListener('click', () => {
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  change({ brand: oklchToHex({ l: rand(0.45, 0.72), c: rand(0.1, 0.24), h: rand(0, 360) }) });
});
$('ratio').addEventListener('change', (e) => change({ ratio: Number((e.target as HTMLSelectElement).value) }));
$('fix').addEventListener('change', (e) => change({ fix: (e.target as HTMLInputElement).checked }));
for (const r of radios('level')) r.addEventListener('change', () => change({ level: r.value as Recipe['level'] }));
$('reset').addEventListener('click', () => {
  state.recipe = { ...DEFAULT_RECIPE };
  schedule();
  toast('Recipe reset');
});

for (const r of radios('theme')) {
  r.addEventListener('change', () => {
    state.theme = r.value as Theme;
    schedule();
  });
}
$('vision').addEventListener('change', (e) => {
  state.vision = (e.target as HTMLSelectElement).value as Vision;
  schedule();
});
$('share').addEventListener('click', () => {
  history.replaceState(null, '', stateUrl());
  void copy(stateUrl(), 'Link copied');
});

const tabs = TABS.map((tab) => $(`tab-${tab}`));
/** On a phone the tab strip scrolls sideways; centre the selected tab so its neighbours show. */
function revealTab(): void {
  const tab = $(`tab-${state.tab}`);
  $('tabs').scrollLeft = tab.offsetLeft - ($('tabs').clientWidth - tab.offsetWidth) / 2;
}
function selectTab(tab: Tab, focus = false): void {
  state.tab = tab;
  render();
  revealTab();
  history.replaceState(null, '', stateUrl());
  if (focus) $(`tab-${tab}`).focus();
}
tabs.forEach((button, i) => {
  button.addEventListener('click', () => selectTab(TABS[i]!));
  button.addEventListener('keydown', (e) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    selectTab(TABS[(to + TABS.length) % TABS.length]!, true);
  });
});

// Each scale is one tab stop; the arrow keys move along its swatches.
$('scales').addEventListener('keydown', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
  if (!chip) return;
  const chips = [...chip.parentElement!.querySelectorAll<HTMLElement>('.chip')];
  const i = chips.indexOf(chip);
  const next = chips[{ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: chips.length - 1 }[e.key] ?? -1];
  if (!next) return;
  e.preventDefault();
  chip.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});
$('scales').addEventListener('click', (e) => {
  const hex = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]')?.dataset.copy;
  if (hex) void copy(hex, `Copied ${hex}`);
});
$('verdict').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-action="apply-fixes"]')) {
    change({ fix: true });
    toast('Fixes applied');
    $('panel-contrast').focus(); // the button is about to disappear; keep focus in the panel
  }
});
for (const key of ['fg', 'bg'] as const) {
  $(`matrix-${key}`).addEventListener('change', (e) => {
    state.matrix[key] = (e.target as HTMLSelectElement).value as ScaleName;
    schedule();
  });
}
$('formats').addEventListener('change', (e) => {
  const value = (e.target as HTMLInputElement).value;
  if (isFormat(value)) state.format = value;
  schedule();
});
$('copy-code').addEventListener('click', () => void copy(exportTokens(tokens, state.format), `${FORMATS[state.format].label} copied`));
$('download-code').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([exportTokens(tokens, state.format)], { type: 'text/plain' }));
  link.download = FORMATS[state.format].file;
  link.click();
  URL.revokeObjectURL(link.href);
  toast(`Saved ${link.download}`);
});

// Back/forward and hand-edited URLs.
window.addEventListener('popstate', () => {
  Object.assign(state, readUrl());
  render();
  revealTab();
});

render();
revealTab();
