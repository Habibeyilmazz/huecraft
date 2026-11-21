// Semantic color tokens for a light and a dark theme. Each token points at a
// scale step; with `fix` on, steps are walked until their contrast targets are
// met, so the themes are accessible by construction.

import { apcaContrast, wcagContrast } from './color.ts';
import { STEPS, type ScaleName, type Scales, type Step } from './scales.ts';

export type Theme = 'light' | 'dark';
export type Level = 'AA' | 'AAA';
/** A scale step, or plain white (the one color outside the scales). */
export type Ref = { scale: ScaleName; step: Step } | 'white';

export interface SemanticToken {
  name: string;
  ref: Ref;
  hex: string;
}
export interface PairCheck {
  fg: string;
  bg: string;
  /** text needs 4.5 (AA) / 7 (AAA); `ui` is the 3:1 non-text minimum (WCAG 1.4.11). */
  kind: 'text' | 'ui';
  required: number;
  ratio: number;
  apca: number;
  pass: boolean;
}
export interface ThemeTokens {
  theme: Theme;
  tokens: SemanticToken[];
  pairs: PairCheck[];
  shadows: { name: string; value: string }[];
}

const STATUSES = ['success', 'warning', 'danger', 'info'] as const;
const UI_MIN = 3;
export const textMin = (level: Level) => (level === 'AAA' ? 7 : 4.5);

export const refLabel = (ref: Ref) => (ref === 'white' ? 'white' : `${ref.scale}-${ref.step}`);
export const refVar = (ref: Ref) => `--color-${refLabel(ref)}`;

export function buildTheme(scales: Scales, theme: Theme, level: Level, fix: boolean): ThemeTokens {
  const light = theme === 'light';
  const T = textMin(level);
  const hexOf = (ref: Ref) => (ref === 'white' ? '#ffffff' : scales[ref.scale].swatches[STEPS.indexOf(ref.step)]!.hex);
  const at = (scale: ScaleName, index: number): Ref => ({ scale, step: STEPS[Math.min(10, Math.max(0, index))]! });
  const idx = (step: Step) => STEPS.indexOf(step);
  // Away from the page background: darker steps in light themes, lighter in dark.
  const away = light ? 1 : -1;

  const tokens: SemanticToken[] = [];
  const pairs: [fg: string, bg: string, kind: 'text' | 'ui'][] = [];
  const set = (name: string, ref: Ref) => {
    tokens.push({ name, ref, hex: hexOf(ref) });
    return ref;
  };
  const hex = (name: string) => tokens.find((t) => t.name === name)!.hex;

  /** First step from `start`, walking `dir`, where `ok` holds; the preferred step when not fixing. */
  const walk = (scale: ScaleName, start: number, dir: number, ok: (ref: Ref) => boolean): Ref => {
    if (!fix) return at(scale, start);
    for (let i = start; i >= 0 && i <= 10; i += dir) if (ok(at(scale, i))) return at(scale, i);
    return at(scale, dir > 0 ? 10 : 0); // nothing passes: take the extreme, the pair check reports it
  };
  const clears = (min: number, ...against: string[]) => (ref: Ref) =>
    against.every((name) => wcagContrast(hexOf(ref), hex(name)) >= min);

  // Text that sits on a solid fill: white or the darkest neutral, whichever reads better.
  const dark: Ref = at('neutral', 10);
  const onColor = (fill: Ref): Ref =>
    wcagContrast('#ffffff', hexOf(fill)) >= wcagContrast(hexOf(dark), hexOf(fill)) ? 'white' : dark;

  /** A solid fill with its label color, a hover step, a subtle tint and text for the tint. */
  const role = (name: string, scale: ScaleName, solidStart: number) => {
    const solid = set(name, walk(scale, solidStart, away, (ref) =>
      wcagContrast(hexOf(ref), hex('surface')) >= UI_MIN && wcagContrast(hexOf(onColor(ref)), hexOf(ref)) >= T,
    ));
    const on = set(`on-${name}`, onColor(solid));
    pairs.push([`on-${name}`, name, 'text'], [name, 'surface', 'ui']);
    if (name === 'primary') {
      // Hover moves away from the label color so it only gains contrast.
      const i = idx((solid as { step: Step }).step);
      const toward = on === 'white' ? 1 : -1;
      set('primary-hover', at(scale, i + toward < 0 || i + toward > 10 ? i - toward : i + toward));
      pairs.push(['on-primary', 'primary-hover', 'text']);
    }
    set(`${name}-subtle`, at(scale, light ? 1 : 9));
    set(`on-${name}-subtle`, walk(scale, light ? 7 : 2, away, clears(T, `${name}-subtle`)));
    pairs.push([`on-${name}-subtle`, `${name}-subtle`, 'text']);
  };

  set('bg', at('neutral', light ? 0 : 10));
  set('surface', light ? 'white' : at('neutral', 9));
  set('surface-raised', at('neutral', light ? 1 : 8));
  set('border', at('neutral', light ? 2 : 7)); // decorative divider, no contrast requirement
  set('border-strong', walk('neutral', light ? 4 : 6, away, clears(UI_MIN, 'bg', 'surface')));
  set('text', walk('neutral', light ? 9 : 0, away, clears(T, 'bg', 'surface', 'surface-raised')));
  set('text-muted', walk('neutral', light ? 5 : 4, away, clears(T, 'bg', 'surface', 'surface-raised')));
  pairs.push(
    ['text', 'bg', 'text'],
    ['text', 'surface', 'text'],
    ['text', 'surface-raised', 'text'],
    ['text-muted', 'bg', 'text'],
    ['text-muted', 'surface', 'text'],
    ['text-muted', 'surface-raised', 'text'],
    ['border-strong', 'surface', 'ui'],
    ['border-strong', 'bg', 'ui'],
  );

  // The brand's own step is the preferred button color when it sits mid-scale.
  const anchor = scales.brand.anchor ?? 6;
  role('primary', 'brand', Math.min(7, Math.max(4, anchor)));
  set('primary-text', walk('brand', light ? 6 : 4, away, clears(T, 'bg', 'surface', 'surface-raised')));
  set('ring', tokens.at(-1)!.ref); // focus ring reuses the link color
  pairs.push(
    ['primary-text', 'bg', 'text'],
    ['primary-text', 'surface', 'text'],
    ['primary-text', 'surface-raised', 'text'],
    ['ring', 'bg', 'ui'],
    ['ring', 'surface', 'ui'],
  );
  for (const status of STATUSES) role(status, status, light ? 6 : 5);

  const shadowRgb = light ? rgbTriplet(hexOf(dark)) : '0 0 0';
  const k = light ? 1 : 3.5;
  const layer = (y: number, blur: number, alpha: number) =>
    `0 ${y}px ${blur}px rgb(${shadowRgb} / ${Math.round(alpha * k * 100) / 100})`;
  const shadows = [
    { name: 'xs', value: layer(1, 2, 0.06) },
    { name: 'sm', value: `${layer(1, 2, 0.06)}, ${layer(2, 4, 0.06)}` },
    { name: 'md', value: `${layer(2, 4, 0.06)}, ${layer(6, 12, 0.08)}` },
    { name: 'lg', value: `${layer(4, 8, 0.06)}, ${layer(16, 32, 0.1)}` },
    { name: 'xl', value: `${layer(8, 16, 0.08)}, ${layer(32, 64, 0.12)}` },
  ];

  return {
    theme,
    tokens,
    shadows,
    pairs: pairs.map(([fg, bg, kind]) => {
      const required = kind === 'text' ? T : UI_MIN;
      const ratio = wcagContrast(hex(fg), hex(bg));
      return { fg, bg, kind, required, ratio, apca: apcaContrast(hex(fg), hex(bg)), pass: ratio >= required };
    }),
  };
}

function rgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}
