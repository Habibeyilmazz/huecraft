// Non-color scales: fluid modular type, spacing, radius.

export const VIEWPORT_MIN = 360;
export const VIEWPORT_MAX = 1280;
const ROOT = 16; // px per rem
const MIN_TEXT_PX = 12;

export interface TypeStep {
  name: string;
  /** Size at and below VIEWPORT_MIN, px. */
  minPx: number;
  /** Size at and above VIEWPORT_MAX, px. */
  maxPx: number;
  /** CSS value: a rem length, or a clamp() that interpolates between the two. */
  css: string;
}

const rem = (px: number) => `${Math.round((px / ROOT) * 1e4) / 1e4}rem`;

const TYPE_STEPS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'] as const;

/**
 * Modular scale `base * ratio^n`. Steps above base are fluid: on small
 * viewports the ratio is eased toward 1 (65% of its distance) so headings do
 * not overpower a phone screen, growing linearly to the full ratio on desktop.
 * Sizes mix rem and vw, so browser zoom and user font settings still apply.
 */
export function typeScale(basePx: number, ratio: number): TypeStep[] {
  const smallRatio = 1 + (ratio - 1) * 0.65;
  return TYPE_STEPS.map((name, i) => {
    const n = i - 2;
    if (n <= 0) {
      const px = Math.max(MIN_TEXT_PX, basePx * ratio ** n);
      return { name, minPx: px, maxPx: px, css: rem(px) };
    }
    const minPx = basePx * smallRatio ** n;
    const maxPx = basePx * ratio ** n;
    const slope = (maxPx - minPx) / (VIEWPORT_MAX - VIEWPORT_MIN);
    const intercept = minPx - slope * VIEWPORT_MIN;
    const vw = Math.round(slope * 100 * 1e4) / 1e4;
    return { name, minPx, maxPx, css: `clamp(${rem(minPx)}, ${rem(intercept)} + ${vw}vw, ${rem(maxPx)})` };
  });
}

export interface Dimension {
  name: string;
  px: number;
  css: string;
}

const SPACE_MULTIPLES = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

export function spaceScale(unitPx: number): Dimension[] {
  return SPACE_MULTIPLES.map((m) => ({ name: String(m).replace('.', '_'), px: m * unitPx, css: rem(m * unitPx) }));
}

const RADII: [string, number][] = [['xs', 2], ['sm', 4], ['md', 6], ['lg', 10], ['xl', 16], ['2xl', 24]];

/** @param roundness 0 (square) .. 2 (very round) multiplier */
export function radiusScale(roundness: number): Dimension[] {
  const scaled = RADII.map(([name, px]) => {
    const v = Math.round(px * roundness * 2) / 2;
    return { name, px: v, css: v === 0 ? '0' : rem(v) };
  });
  return [...scaled, { name: 'full', px: 9999, css: '9999px' }];
}

export const FONT_STACKS = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
} as const;
