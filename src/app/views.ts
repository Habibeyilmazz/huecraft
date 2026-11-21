// Renders the token set into the workspace panels. Each function fills output
// regions only; the controls around them live in index.html and keep focus.

import { wcagContrast } from '../core/color.ts';
import { VIEWPORT_MAX, VIEWPORT_MIN } from '../core/dimensions.ts';
import { STEPS, SCALE_NAMES, type Scale, type ScaleName, type Status } from '../core/scales.ts';
import { refLabel, refVar, textMin, type PairCheck, type Ref, type SemanticToken, type Theme } from '../core/semantic.ts';
import { hueClashes, type TokenSet } from '../core/tokens.ts';

const el = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** Black or white, whichever reads better on the given color. */
const inkOn = (hex: string) => (wcagContrast('#000000', hex) >= wcagContrast('#ffffff', hex) ? '#000000' : '#ffffff');
const fmtRatio = (ratio: number) => (Math.floor(ratio * 100) / 100).toFixed(2); // floor: never round a 4.496 up to a pass
const px = (v: number) => `${Math.round(v * 10) / 10}px`;

// The two data tables become stacked grids in a narrow workspace (chrome.css). Explicit roles keep
// them tables for screen readers in browsers that drop the semantics with the layout.
const headCell = (label: string) => `<th scope="col" role="columnheader">${label}</th>`;
const refDot = (ref: Ref) => `<span class="dot" style="background:${ref === 'white' ? '#fff' : `var(${refVar(ref)})`}"></span>`;

// ---- Palette ----------------------------------------------------------------

function scaleNote(scale: Scale, tokens: TokenSet): string {
  if (scale.name === 'brand') return `Your color is step ${STEPS[scale.anchor!]}.`;
  if (scale.name === 'neutral') {
    const grey = scale.swatches.every((s) => s.lch.c < 0.001);
    return grey ? 'Pure grey.' : `Tinted ${Math.round(tokens.recipe.tint * 100)}% toward the brand hue.`;
  }
  const near = hueClashes(tokens.recipe).find((c) => c.b === scale.name || c.a === scale.name);
  const other = near && (near.b === scale.name ? near.a : near.b);
  return `Hue ${tokens.recipe[scale.name as Status]}°.${other ? ` Close to ${other === 'brand' ? 'the brand' : other}.` : ''}`;
}

export function renderPalette(tokens: TokenSet): void {
  el('scales').innerHTML = SCALE_NAMES.map((name) => {
    const scale = tokens.scales[name];
    const chips = scale.swatches.map((s, i) => {
      const anchor = i === scale.anchor;
      return `<button type="button" class="chip${anchor ? ' is-anchor' : ''}" data-copy="${s.hex}" tabindex="${i ? -1 : 0}"
        style="background:var(--color-${name}-${s.step});color:${inkOn(s.hex)}">
        <span class="chip-step"><span class="visually-hidden">Copy ${name} </span>${s.step}</span>
        ${s.p3 ? '<span class="chip-tag" title="Wide-gamut screens get a more saturated version of this step">P3</span>' : ''}
        <span class="chip-hex">${s.hex}${anchor ? '<span class="visually-hidden">, your brand color</span>' : ''}</span>
      </button>`;
    });
    return `<section class="scale" aria-labelledby="scale-${name}">
      <div class="scale-head"><h3 id="scale-${name}">${title(name)}</h3><p>${scaleNote(scale, tokens)}</p></div>
      <div class="strip-box"><div class="strip" role="toolbar" aria-label="${title(name)} steps">${chips.join('')}</div></div>
    </section>`;
  }).join('');

  const cell = (tok: SemanticToken) =>
    `<td role="cell"><span class="dot" style="background:${tok.hex}"></span><span>${refLabel(tok.ref)} <span class="num quiet">${tok.hex}</span></span></td>`;
  el('semantic-table').innerHTML = `
    <thead role="rowgroup"><tr role="row">${['Token', 'Light theme', 'Dark theme'].map(headCell).join('')}</tr></thead>
    <tbody role="rowgroup">${tokens.themes.light.tokens.map((tok, i) =>
      `<tr role="row"><th scope="row" role="rowheader" class="num">--color-${tok.name}</th>${cell(tok)}${cell(tokens.themes.dark.tokens[i]!)}</tr>`).join('')}
    </tbody>`;
}

// ---- Contrast -----------------------------------------------------------------

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8.5 3.2 3.2L13 4.8"/></svg>';
const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>';

/** What APCA's published guidance says a text pair at this Lc is good for. */
function apcaWords(lc: number): string {
  if (lc >= 75) return 'body text';
  if (lc >= 60) return 'medium text';
  if (lc >= 45) return 'large text';
  if (lc >= 30) return 'incidental text only';
  return 'too low for text';
}

export function renderContrast(tokens: TokenSet, theme: Theme, matrix: { fg: ScaleName; bg: ScaleName }): void {
  const { recipe, themes, moves } = tokens;
  const current = themes[theme];
  const hex = (name: string) => current.tokens.find((t) => t.name === name)!.hex;
  const fails = (t: Theme) => themes[t].pairs.filter((p) => !p.pass).length;
  const total = current.pairs.length;
  const failing = fails('light') + fails('dark');
  const themeMoves = moves.filter((m) => m.theme === theme);
  const count = (t: Theme) => (fails(t) ? `${fails(t)} of ${total} fail` : `all ${total} pass`);

  el('verdict').innerHTML = `
    <h3>${failing ? `${failing} color ${failing === 1 ? 'pair misses' : 'pairs miss'} ${recipe.level}` : `Every color pair meets ${recipe.level}`}</h3>
    ${!recipe.fix && moves.length ? '<button type="button" class="btn btn-solid" data-action="apply-fixes">Apply the suggested fixes</button>' : ''}
    <p class="verdict-counts">Light theme: ${count('light')}. Dark theme: ${count('dark')}.</p>
    <p>Text needs ${textMin(recipe.level)} to 1, and fills, borders and focus rings need 3 to 1 (WCAG 2.2). Each ratio
    is the lower of how the pair renders in sRGB and on a Display P3 screen. The table shows the ${theme} theme; switch
    themes in the top bar. APCA values are for reference and do not affect the result.</p>`;

  const suggestion = (pair: PairCheck): string => {
    if (pair.pass) return '';
    const fixes = themeMoves.filter((m) => m.token === pair.fg || m.token === pair.bg);
    if (recipe.fix || !fixes.length) return `No step in this scale reaches ${pair.required} to 1 here.`;
    return fixes.map((m) => `Use ${refLabel(m.to)} for ${m.token}`).join(', ') + '.';
  };
  el('pairs-table').innerHTML = `
    <thead role="rowgroup"><tr role="row">${['Sample', 'Pair', 'WCAG ratio', 'Needs', 'APCA', 'Result', '<span class="visually-hidden">Suggestion</span>'].map(headCell).join('')}</tr></thead>
    <tbody role="rowgroup">${current.pairs.map((pair) => {
      const sample = pair.kind === 'text'
        ? `<span class="sample" style="background:${hex(pair.bg)};color:${hex(pair.fg)}" aria-hidden="true">Aa</span>`
        : `<span class="sample" style="background:${hex(pair.bg)}" aria-hidden="true"><i class="sample-ui" style="border-color:${hex(pair.fg)}"></i></span>`;
      const lc = Math.round(Math.abs(pair.apca));
      return `<tr role="row">
        <td role="cell" class="c-sample">${sample}</td>
        <th scope="row" role="rowheader" class="c-pair">${pair.fg} <span class="quiet">on</span> ${pair.bg}</th>
        <td role="cell" class="c-ratio num">${fmtRatio(pair.ratio)}</td>
        <td role="cell" class="c-needs num quiet">${pair.required}</td>
        <td role="cell" class="c-apca"><span class="num">Lc ${lc}</span> <span class="quiet">${pair.kind === 'text' ? apcaWords(lc) : ''}</span></td>
        <td role="cell" class="c-result">${pair.pass ? `<span class="result">${CHECK} Pass</span>` : `<span class="result result-fail">${CROSS} Fails</span>`}</td>
        <td role="cell" class="c-hint quiet">${suggestion(pair)}</td>
      </tr>`;
    }).join('')}</tbody>`;

  el('moves').innerHTML = themeMoves.length
    ? `<div class="moves">
        <h3>${recipe.fix ? `Moved to reach ${recipe.level} in the ${theme} theme` : `Suggested moves for the ${theme} theme`}</h3>
        <ul>${themeMoves.map((m) => `<li><code>--color-${m.token}</code>
          <span><span class="visually-hidden">${recipe.fix ? 'moved' : 'would move'} from </span>${refDot(m.from)}${refLabel(m.from)}
          <span class="quiet">to</span> ${refDot(m.to)}${refLabel(m.to)}</span></li>`).join('')}</ul>
      </div>`
    : '';

  const fg = tokens.scales[matrix.fg].swatches;
  const bg = tokens.scales[matrix.bg].swatches;
  const need = textMin(recipe.level);
  el('matrix').innerHTML = `
    <caption class="visually-hidden">Rows are ${matrix.fg} text steps, columns are ${matrix.bg} background steps</caption>
    <thead><tr><td></td>${bg.map((b) => `<th scope="col">${b.step}</th>`).join('')}</tr></thead>
    <tbody>${fg.map((f) => `<tr><th scope="row">${f.step}</th>${bg.map((b) => {
      const ratio = wcagContrast(f.hex, b.hex);
      const tag = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'Large' : 'Fail';
      return `<td class="${ratio >= need ? '' : 'is-low'}"><span class="mx-sample" style="background:${b.hex};color:${f.hex}" aria-hidden="true">Aa</span><span class="mx-ratio">${fmtRatio(ratio)}</span><span class="mx-tag">${tag}</span></td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
}

// ---- Type and space -------------------------------------------------------------

export function renderScale(tokens: TokenSet): void {
  const type = [...tokens.type].reverse().map((s) => `<li>
      <code>--text-${s.name}</code>
      <span class="spec-sample" style="font-size:var(--text-${s.name})">Ride north first</span>
      <span class="spec-meta">${s.minPx === s.maxPx ? px(s.maxPx) : `${px(s.minPx)} to ${px(s.maxPx)}`}</span>
    </li>`).join('');
  const space = tokens.space.map((s) => `<li>
      <code>--space-${s.name}</code><span class="spec-meta">${px(s.px)}</span><i style="width:${s.px}px"></i>
    </li>`).join('');
  const radius = tokens.radius.map((r) => `<li>
      <i style="border-radius:var(--radius-${r.name})"></i><code>${r.name}</code>
    </li>`).join('');
  const shadow = tokens.themes.light.shadows.map((s) => `<li>
      <i style="box-shadow:var(--shadow-${s.name})"></i><code>${s.name}</code>
    </li>`).join('');

  el('scale-view').innerHTML = `
    <p class="panel-note">Sizes above the body size are fluid: they grow from the smaller value on a ${VIEWPORT_MIN}px wide
    screen to the larger one at ${VIEWPORT_MAX}px, using clamp(). Everything is in rem, so browser zoom still works.</p>
    <div class="pv spec">
      <section class="pv-card spec-type" aria-labelledby="spec-type"><h3 id="spec-type">Type scale, ratio ${esc(String(tokens.recipe.ratio))}</h3><ol>${type}</ol></section>
      <section class="pv-card spec-space" aria-labelledby="spec-space"><h3 id="spec-space">Spacing</h3><ol>${space}</ol></section>
      <div style="display:grid;gap:var(--space-5);align-content:start">
        <section class="pv-card spec-radius" aria-labelledby="spec-radius"><h3 id="spec-radius">Radius <code>--radius-*</code></h3><ol class="spec-tiles">${radius}</ol></section>
        <section class="pv-card spec-shadow" aria-labelledby="spec-shadow"><h3 id="spec-shadow">Shadows <code>--shadow-*</code></h3><ol class="spec-tiles">${shadow}</ol>
          <p class="pv-muted spec-dark-note">The dark theme uses stronger shadows, and they still read faintly on a dark page. Lift things there with a lighter surface as well.</p></section>
      </div>
    </div>`;
}

// ---- Export -------------------------------------------------------------------

/** Shows the exported text, with comments set back so the declarations read first. */
export function renderCode(code: string, hasComments: boolean): void {
  const html = esc(code);
  el('code').innerHTML = hasComments ? html.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '<span class="quiet">$&</span>') : html;
}
