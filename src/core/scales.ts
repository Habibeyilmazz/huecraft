// 11-step OKLCH color scales: brand (anchored on the input color), a neutral
// tinted toward the brand hue, and four status scales.

import { formatOklch, gamutMap, hexToOklch, oklchLuminance, oklchToHex, roundOklch, type Oklch } from './color.ts';

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export const SCALE_NAMES = ['brand', 'neutral', 'success', 'warning', 'danger', 'info'] as const;
export type ScaleName = (typeof SCALE_NAMES)[number];

export interface Swatch {
  step: Step;
  /** The sRGB-mapped color. */
  lch: Oklch;
  hex: string;
  /** CSS oklch() for wide-gamut screens, set only when P3 can show more chroma than sRGB. */
  p3: string | null;
  /** Relative luminance of the `p3` color, for checking contrast as P3 screens show it. */
  p3Luminance: number | null;
}
export interface Scale {
  name: ScaleName;
  swatches: Swatch[];
  /** Index of the swatch that equals the input color (brand scale only). */
  anchor: number | null;
}

// Lightness per step. Every chromatic scale shares one curve so the same step
// has comparable contrast across hues.
const CHROMATIC_L = [0.975, 0.94, 0.885, 0.81, 0.715, 0.63, 0.545, 0.47, 0.4, 0.335, 0.25];
const NEUTRAL_L = [0.985, 0.965, 0.925, 0.87, 0.71, 0.555, 0.445, 0.37, 0.27, 0.21, 0.145];
// Chroma relative to the peak: pale tints and deep shades carry less.
const CHROMA_SHAPE = [0.14, 0.28, 0.5, 0.74, 0.92, 1, 1, 0.92, 0.8, 0.68, 0.5];
const NEUTRAL_SHAPE = [0.5, 0.6, 0.8, 1, 1, 1, 1, 1, 0.9, 0.8, 0.7];

const STATUS_HUES = { success: 150, warning: 75, danger: 25, info: 245 } as const;
const STATUS_CHROMA = 0.19; // deliberately beyond sRGB at some steps; gamut mapping trims it
const MAX_CHROMA = 0.4;
/** Chroma of the neutral scale at tint = 1. */
export const MAX_NEUTRAL_CHROMA = 0.04;

function swatch(step: Step, target: Oklch): Swatch {
  const lch = gamutMap(target, 'srgb');
  const wide = gamutMap(target, 'p3');
  const richer = wide.c - lch.c > 0.004;
  return {
    step,
    lch,
    hex: oklchToHex(lch),
    p3: richer ? formatOklch(wide) : null,
    p3Luminance: richer ? oklchLuminance(roundOklch(wide)) : null,
  };
}

function build(name: ScaleName, lightness: number[], chroma: (i: number) => number, hue: number, anchor: number | null): Scale {
  return {
    name,
    anchor,
    swatches: STEPS.map((step, i) => swatch(step, { l: lightness[i]!, c: Math.min(MAX_CHROMA, chroma(i)), h: hue })),
  };
}

/**
 * The brand scale keeps the input color exactly: the step whose lightness is
 * nearest becomes the anchor, and the lightness curve is stretched piecewise so
 * the steps on either side still run evenly to the ends.
 */
export function brandScale(hex: string): Scale {
  const brand = hexToOklch(hex);
  const L = CHROMATIC_L;
  const last = L.length - 1;
  let anchor = 0;
  for (let i = 1; i < L.length; i++) {
    if (Math.abs(L[i]! - brand.l) < Math.abs(L[anchor]! - brand.l)) anchor = i;
  }
  const at = L[anchor]!;
  const lightness = L.map((l, i) => {
    if (i === anchor) return brand.l;
    if (i < anchor) return brand.l + ((l - at) * (L[0]! - brand.l)) / (L[0]! - at);
    return brand.l - ((at - l) * (brand.l - L[last]!)) / (at - L[last]!);
  });
  const scale = build('brand', lightness, (i) => (brand.c * CHROMA_SHAPE[i]!) / CHROMA_SHAPE[anchor]!, brand.h, anchor);
  // Pin the anchor to the exact input so rounding can never drift it.
  scale.swatches[anchor] = { step: STEPS[anchor]!, lch: brand, hex: oklchToHex(brand), p3: null, p3Luminance: null };
  return scale;
}

/** @param tint 0 (pure grey) .. 1 (strongly tinted toward the brand hue) */
export function neutralScale(brandHex: string, tint: number): Scale {
  const brand = hexToOklch(brandHex);
  // A grey brand has no hue to borrow.
  const chroma = brand.c < 0.01 ? 0 : tint * MAX_NEUTRAL_CHROMA;
  return build('neutral', NEUTRAL_L, (i) => chroma * NEUTRAL_SHAPE[i]!, brand.h, null);
}

export function statusScale(name: keyof typeof STATUS_HUES): Scale {
  return build(name, CHROMATIC_L, (i) => STATUS_CHROMA * CHROMA_SHAPE[i]!, STATUS_HUES[name], null);
}

export type Scales = Record<ScaleName, Scale>;

export function buildScales(brandHex: string, tint: number): Scales {
  return {
    brand: brandScale(brandHex),
    neutral: neutralScale(brandHex, tint),
    success: statusScale('success'),
    warning: statusScale('warning'),
    danger: statusScale('danger'),
    info: statusScale('info'),
  };
}
