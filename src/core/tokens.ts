// The recipe (everything a user can choose) and the token set derived from it.

import { hexToOklch, parseColor } from './color.ts';
import { fontStacks, radiusScale, spaceScale, typeScale, type Dimension, type Fonts, type TypeStep } from './dimensions.ts';
import { buildScales, STATUS_HUES, STATUSES, type Scales, type Status } from './scales.ts';
import { buildTheme, type Level, type Ref, type Theme, type ThemeTokens } from './semantic.ts';

export interface Recipe {
  /** Brand color, `#rrggbb`. */
  brand: string;
  /** How far the neutral scale leans toward the brand hue, 0..1. */
  tint: number;
  /** Type scale ratio. */
  ratio: number;
  /** Body text size, px. */
  base: number;
  /** Spacing unit, px. */
  unit: number;
  /** Corner roundness multiplier, 0..2. */
  radius: number;
  /** WCAG conformance level the text pairs must reach. */
  level: Level;
  /** Move tokens to the nearest step that meets the contrast target. */
  fix: boolean;
  /** OKLCH hue of each status scale, degrees. */
  success: number;
  warning: number;
  danger: number;
  info: number;
  /** Font family names put in front of the system stacks, '' for none. */
  font: string;
  heading: string;
}

export const DEFAULT_RECIPE: Recipe = {
  brand: '#0c7c86',
  tint: 0.3,
  ratio: 1.25,
  base: 16,
  unit: 4,
  radius: 1,
  level: 'AA',
  fix: true,
  ...STATUS_HUES,
  font: '',
  heading: '',
};

const HUE = { min: 0, max: 360, step: 1 } as const;

export const RATIOS = [1.067, 1.125, 1.2, 1.25, 1.333, 1.414, 1.5] as const;

/** Numeric limits, shared by the URL parser, the CLI and the form controls. */
export const LIMITS = {
  tint: { min: 0, max: 1, step: 0.05 },
  base: { min: 14, max: 20, step: 1 },
  unit: { min: 3, max: 6, step: 0.5 },
  radius: { min: 0, max: 2, step: 0.25 },
  success: HUE,
  warning: HUE,
  danger: HUE,
  info: HUE,
} as const;

// Short keys keep shared URLs compact.
const KEYS = { brand: 'b', tint: 't', ratio: 'r', base: 's', unit: 'u', radius: 'rd', level: 'lv', fix: 'fx',
  success: 'hs', warning: 'hw', danger: 'hd', info: 'hi', font: 'f', heading: 'fh' } as const;

/**
 * A font family name as typed, tidied, or null if it could break out of a quoted CSS
 * string, a shell argument or a comment. Letters and digits of any script, spaces,
 * hyphens and underscores; up to 48 characters. '' means "system fonts".
 */
export function parseFontName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name === '' || /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,47}$/u.test(name) ? name : null;
}

/**
 * Quotes an untrusted value for an error message. Control and bidi characters are
 * escaped so a crafted link cannot drive the terminal the CLI prints to, and long
 * values are cut short.
 */
export function quote(value: string): string {
  const shown = value.length > 80 ? `${value.slice(0, 80)}…` : value;
  return `"${shown.replace(/[\0-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}

/**
 * Validates untrusted recipe input (URL query string, CLI flags). Every field falls
 * back to its default when missing; invalid values are reported in `errors`
 * and replaced by the default, so the result is always a usable recipe.
 */
export function parseRecipe(input: Partial<Record<keyof Recipe, string | undefined>>): { recipe: Recipe; errors: string[] } {
  const recipe = { ...DEFAULT_RECIPE };
  const errors: string[] = [];

  if (input.brand !== undefined) {
    const hex = parseColor(input.brand);
    if (hex) recipe.brand = hex;
    else errors.push(`brand: ${quote(input.brand)} is not a color like #0c7c86, rgb(12 124 134) or oklch(0.536 0.0892 204.98)`);
  }
  for (const key of ['tint', 'base', 'unit', 'radius', ...STATUSES] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    const { min, max } = LIMITS[key];
    // A plain decimal only: Number() alone would take "0x10" and " 16 ".
    if (/^-?(\d+(\.\d+)?|\.\d+)$/.test(raw) && n >= min && n <= max) recipe[key] = n;
    else errors.push(`${key in STATUS_HUES ? `${key} hue` : key}: ${quote(raw)} must be a number from ${min} to ${max}`);
  }
  if (input.ratio !== undefined) {
    const n = Number(input.ratio);
    if ((RATIOS as readonly number[]).includes(n)) recipe.ratio = n;
    else errors.push(`ratio: ${quote(input.ratio)} must be one of ${RATIOS.join(', ')}`);
  }
  if (input.level !== undefined) {
    const level = input.level.toUpperCase();
    if (level === 'AA' || level === 'AAA') recipe.level = level;
    else errors.push(`level: ${quote(input.level)} must be AA or AAA`);
  }
  for (const key of ['font', 'heading'] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    const name = parseFontName(raw);
    if (name !== null) recipe[key] = name;
    else errors.push(`${key === 'font' ? 'font' : 'heading font'}: ${quote(raw)} must be a font family name: letters, digits, spaces and hyphens, up to 48 characters`);
  }
  if (input.fix !== undefined) {
    if (input.fix === '1' || input.fix === '0') recipe.fix = input.fix === '1';
    else errors.push(`fix: ${quote(input.fix)} must be 1 or 0`);
  }
  return { recipe, errors };
}

export function recipeToParams(recipe: Recipe): URLSearchParams {
  const p = new URLSearchParams();
  p.set(KEYS.brand, recipe.brand.slice(1));
  p.set(KEYS.tint, String(recipe.tint));
  p.set(KEYS.ratio, String(recipe.ratio));
  p.set(KEYS.base, String(recipe.base));
  p.set(KEYS.unit, String(recipe.unit));
  p.set(KEYS.radius, String(recipe.radius));
  p.set(KEYS.level, recipe.level);
  p.set(KEYS.fix, recipe.fix ? '1' : '0');
  for (const status of STATUSES) p.set(KEYS[status], String(recipe[status]));
  if (recipe.font) p.set(KEYS.font, recipe.font);
  if (recipe.heading) p.set(KEYS.heading, recipe.heading);
  return p;
}

/** The recipe fields a shared link sets, unvalidated (for `parseRecipe`). Other parameters are ignored. */
export function recipeInputFromParams(params: URLSearchParams): Partial<Record<keyof Recipe, string>> {
  const input: Partial<Record<keyof Recipe, string>> = {};
  for (const [field, key] of Object.entries(KEYS) as [keyof Recipe, string][]) {
    const value = params.get(key);
    if (value !== null) input[field] = value;
  }
  return input;
}

export function recipeFromParams(params: URLSearchParams): { recipe: Recipe; errors: string[] } {
  return parseRecipe(recipeInputFromParams(params));
}

/** The CLI invocation that reproduces a recipe; printed in export headers. */
export function recipeToCommand(recipe: Recipe): string {
  return [
    `huecraft ${recipe.brand.slice(1)}`,
    `--tint ${recipe.tint}`,
    `--ratio ${recipe.ratio}`,
    `--base ${recipe.base}`,
    `--unit ${recipe.unit}`,
    `--radius ${recipe.radius}`,
    `--level ${recipe.level}`,
    ...STATUSES.filter((s) => recipe[s] !== STATUS_HUES[s]).map((s) => `--${s}-hue ${recipe[s]}`),
    ...(recipe.font ? [`--font '${recipe.font}'`] : []), // parseFontName keeps quotes out
    ...(recipe.heading ? [`--heading-font '${recipe.heading}'`] : []),
    ...(recipe.fix ? [] : ['--no-fix']),
  ].join(' ');
}

/** A token the contrast fixer moved (or would move) off its preferred step. */
export interface Move {
  theme: Theme;
  token: string;
  from: Ref;
  to: Ref;
}

export interface TokenSet {
  recipe: Recipe;
  scales: Scales;
  themes: Record<Theme, ThemeTokens>;
  /** Differences between the preferred steps and the contrast-fixed ones, whether or not `fix` is on. */
  moves: Move[];
  type: TypeStep[];
  space: Dimension[];
  radius: Dimension[];
  fonts: Fonts;
}

export function buildTokens(recipe: Recipe): TokenSet {
  const scales = buildScales(recipe.brand, recipe.tint, recipe);
  const moves: Move[] = [];
  const themes = {} as Record<Theme, ThemeTokens>;
  for (const theme of ['light', 'dark'] as const) {
    const preferred = buildTheme(scales, theme, recipe.level, false);
    const fixed = buildTheme(scales, theme, recipe.level, true);
    themes[theme] = recipe.fix ? fixed : preferred;
    fixed.tokens.forEach((token, i) => {
      const from = preferred.tokens[i]!;
      if (from.hex !== token.hex) moves.push({ theme, token: token.name, from: from.ref, to: token.ref });
    });
  }
  return {
    recipe,
    scales,
    themes,
    moves,
    type: typeScale(recipe.base, recipe.ratio),
    space: spaceScale(recipe.unit),
    radius: radiusScale(recipe.radius),
    fonts: fontStacks(recipe.font, recipe.heading),
  };
}

/** Hues closer than this read as the same color family. */
export const CLASH_DEGREES = 30;
/** Below this chroma the brand is close enough to grey that its hue does not show. */
const GREY_CHROMA = 0.05;

export interface Clash {
  a: 'brand' | Status;
  b: Status;
  /** Hue distance, degrees. */
  degrees: number;
}

/**
 * Status scales whose hue sits close to the brand's or to another status's, so a
 * danger badge could pass for a brand button or a warning for an error.
 */
export function hueClashes(recipe: Recipe): Clash[] {
  const brand = hexToOklch(recipe.brand);
  const hues: ['brand' | Status, number][] = STATUSES.map((s) => [s, recipe[s]]);
  if (brand.c >= GREY_CHROMA) hues.unshift(['brand', brand.h]);
  const clashes: Clash[] = [];
  hues.forEach(([a, ha], i) => {
    for (const [b, hb] of hues.slice(i + 1)) {
      const d = Math.abs(ha - hb) % 360;
      const degrees = Math.round(Math.min(d, 360 - d));
      if (degrees < CLASH_DEGREES) clashes.push({ a, b: b as Status, degrees });
    }
  });
  return clashes;
}
