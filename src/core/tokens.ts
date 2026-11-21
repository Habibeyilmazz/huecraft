// The recipe (everything a user can choose) and the token set derived from it.

import { parseColor } from './color.ts';
import { FONT_STACKS, radiusScale, spaceScale, typeScale, type Dimension, type TypeStep } from './dimensions.ts';
import { buildScales, type Scales } from './scales.ts';
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
};

export const RATIOS = [1.067, 1.125, 1.2, 1.25, 1.333, 1.414, 1.5] as const;

/** Numeric limits, shared by the URL parser, the CLI and the form controls. */
export const LIMITS = {
  tint: { min: 0, max: 1, step: 0.05 },
  base: { min: 14, max: 20, step: 1 },
  unit: { min: 3, max: 6, step: 0.5 },
  radius: { min: 0, max: 2, step: 0.25 },
} as const;

// Short keys keep shared URLs compact.
const KEYS = { brand: 'b', tint: 't', ratio: 'r', base: 's', unit: 'u', radius: 'rd', level: 'lv', fix: 'fx' } as const;

/**
 * Validates untrusted recipe input (URL fragment, CLI flags). Every field falls
 * back to its default when missing; invalid values are reported in `errors`
 * and replaced by the default, so the result is always a usable recipe.
 */
export function parseRecipe(input: Partial<Record<keyof Recipe, string | undefined>>): { recipe: Recipe; errors: string[] } {
  const recipe = { ...DEFAULT_RECIPE };
  const errors: string[] = [];

  if (input.brand !== undefined) {
    const hex = parseColor(input.brand);
    if (hex) recipe.brand = hex;
    else errors.push(`brand: "${input.brand}" is not a color like #7c3aed, rgb(124 58 237) or oklch(0.54 0.25 293)`);
  }
  for (const key of ['tint', 'base', 'unit', 'radius'] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    const { min, max } = LIMITS[key];
    if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) recipe[key] = n;
    else errors.push(`${key}: "${raw}" must be a number from ${min} to ${max}`);
  }
  if (input.ratio !== undefined) {
    const n = Number(input.ratio);
    if ((RATIOS as readonly number[]).includes(n)) recipe.ratio = n;
    else errors.push(`ratio: "${input.ratio}" must be one of ${RATIOS.join(', ')}`);
  }
  if (input.level !== undefined) {
    const level = input.level.toUpperCase();
    if (level === 'AA' || level === 'AAA') recipe.level = level;
    else errors.push(`level: "${input.level}" must be AA or AAA`);
  }
  if (input.fix !== undefined) {
    if (input.fix === '1' || input.fix === '0') recipe.fix = input.fix === '1';
    else errors.push(`fix: "${input.fix}" must be 1 or 0`);
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
  return p;
}

export function recipeFromParams(params: URLSearchParams): { recipe: Recipe; errors: string[] } {
  const input: Partial<Record<keyof Recipe, string>> = {};
  for (const [field, key] of Object.entries(KEYS) as [keyof Recipe, string][]) {
    const value = params.get(key);
    if (value !== null) input[field] = value;
  }
  return parseRecipe(input);
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
  fonts: typeof FONT_STACKS;
}

export function buildTokens(recipe: Recipe): TokenSet {
  const scales = buildScales(recipe.brand, recipe.tint);
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
    fonts: FONT_STACKS,
  };
}
