// Color math: sRGB / Display P3 / OKLCH conversion, gamut mapping, WCAG 2 and
// APCA contrast, color-vision-deficiency matrices. No dependencies.

/** Gamma-encoded channel triple in 0..1. */
export type RGB = readonly [number, number, number];
export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrees 0..360
}
export type Gamut = 'srgb' | 'p3';

type Matrix = readonly [RGB, RGB, RGB];

const mul = (m: Matrix, [x, y, z]: RGB): RGB => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
];

/** Parses #rgb / #rrggbb, with or without the leading #. Returns a normalised `#rrggbb` or null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  return `#${h}`;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`Not a hex color: ${hex}`);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function rgbToHex(rgb: RGB): string {
  return `#${rgb
    .map((v) =>
      Math.round(clamp01(v) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// The sRGB transfer function; Display P3 uses the same curve.
export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

// Björn Ottosson's OKLab matrices (linear sRGB <-> LMS <-> Lab).
const RGB_TO_LMS: Matrix = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_LAB: Matrix = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const LAB_TO_LMS: Matrix = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LMS_TO_RGB: Matrix = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const SRGB_TO_P3: Matrix = [
  [0.8224621, 0.177538, 0],
  [0.0331941, 0.9668058, 0],
  [0.0170827, 0.0723974, 0.9105199],
];

export function linearSrgbToOklch(rgb: RGB): Oklch {
  const [l, m, s] = mul(RGB_TO_LMS, rgb);
  const [L, a, b] = mul(LMS_TO_LAB, [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)]);
  const c = Math.hypot(a, b);
  // Hue is meaningless for greys; pin it to 0 so output is stable.
  const h = c < 1e-5 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH to linear sRGB. Channels fall outside 0..1 when the color is out of the sRGB gamut. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): RGB {
  const rad = (h * Math.PI) / 180;
  const [l_, m_, s_] = mul(LAB_TO_LMS, [l, c * Math.cos(rad), c * Math.sin(rad)]);
  return mul(LMS_TO_RGB, [l_ ** 3, m_ ** 3, s_ ** 3]);
}

export const hexToOklch = (hex: string): Oklch =>
  linearSrgbToOklch(hexToRgb(hex).map(toLinear) as unknown as RGB);

/** OKLCH to linear RGB in the given gamut's primaries. */
export function oklchToLinear(lch: Oklch, gamut: Gamut): RGB {
  const srgb = oklchToLinearSrgb(lch);
  return gamut === 'p3' ? mul(SRGB_TO_P3, srgb) : srgb;
}

const EPS = 1e-4;
export const inGamut = (lch: Oklch, gamut: Gamut): boolean =>
  oklchToLinear(lch, gamut).every((v) => v >= -EPS && v <= 1 + EPS);

/**
 * Brings a color into gamut by reducing chroma only, so lightness (and therefore
 * contrast) and hue survive. Binary search for the highest in-gamut chroma.
 */
export function gamutMap(lch: Oklch, gamut: Gamut): Oklch {
  if (lch.l >= 1) return { l: 1, c: 0, h: lch.h };
  if (lch.l <= 0) return { l: 0, c: 0, h: lch.h };
  if (inGamut(lch, gamut)) return lch;
  let lo = 0;
  let hi = lch.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...lch, c: mid }, gamut)) lo = mid;
    else hi = mid;
  }
  return { ...lch, c: lo };
}

/** OKLCH to an sRGB hex, gamut-mapped first so nothing is clipped per channel. */
export function oklchToHex(lch: Oklch): string {
  const lin = oklchToLinearSrgb(gamutMap(lch, 'srgb'));
  return rgbToHex(lin.map((v) => toGamma(clamp01(v))) as unknown as RGB);
}

/** Gamma-encoded Display P3 channels (0..1) for a color already inside the P3 gamut. */
export const oklchToP3 = (lch: Oklch): RGB =>
  oklchToLinear(lch, 'p3').map((v) => toGamma(clamp01(v))) as unknown as RGB;

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** Rounds to the precision `formatOklch` prints, so math on the result matches the emitted CSS. */
export const roundOklch = ({ l, c, h }: Oklch): Oklch => ({ l: round(l, 4), c: round(c, 4), h: round(h, 2) });

/** CSS `oklch()` notation. */
export function formatOklch(lch: Oklch): string {
  const { l, c, h } = roundOklch(lch);
  return `oklch(${round(l * 100, 2)}% ${c} ${h})`;
}

const NUMBER = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(%|deg)?$/;
/** A CSS number, or a percentage of `full`; hues may carry `deg`. NaN when it is neither. */
function channel(part: string, full: number, unit: '%' | 'deg' = '%'): number {
  const m = NUMBER.exec(part);
  if (!m || (m[2] && m[2] !== unit)) return NaN;
  return m[2] === '%' ? (Number(m[1]) / 100) * full : Number(m[1]);
}

/**
 * Parses a brand color written as hex, `rgb(r g b)` or `oklch(l c h)` (spaces or
 * commas, no alpha) into `#rrggbb`, or null. An oklch() color outside sRGB loses
 * chroma until it fits, like every other color here.
 */
export function parseColor(input: string): string | null {
  const hex = normalizeHex(input);
  if (hex) return hex;
  // No adjacent \s* around a lazy group: that backtracks cubically, and a shared link can carry the input.
  const m = /^(rgb|oklch)\(([^()]*)\)$/i.exec(input.trim());
  const parts = m?.[2]!.trim().split(/\s*,\s*|\s+/);
  if (!m || parts?.length !== 3) return null;
  const [a, b, c] = parts as [string, string, string];
  const rgb = m[1]!.toLowerCase() === 'rgb';
  const values = rgb
    ? [channel(a, 255) / 255, channel(b, 255) / 255, channel(c, 255) / 255]
    : [channel(a, 1), channel(b, 0.4), channel(c, 0, 'deg')];
  if (values.some(Number.isNaN)) return null;
  const [x, y, z] = values as [number, number, number];
  // CSS clamps lightness, but oklch(54 0.25 293) is a typo for 54%, not a request for white.
  if (!rgb && (x < 0 || x > 1)) return null;
  return rgb ? rgbToHex([x, y, z]) : oklchToHex({ l: x, c: Math.max(0, y), h: z });
}

// ---- Contrast -----------------------------------------------------------

/** WCAG 2.x relative luminance of an sRGB hex. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as unknown as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Relative luminance of any OKLCH color, including ones outside sRGB: the
 * luminance weights are linear, so they hold for out-of-gamut channel values.
 */
export function oklchLuminance(lch: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(lch);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two relative luminances, 1..21. */
export const luminanceContrast = (la: number, lb: number): number =>
  (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

/** WCAG 2.x contrast ratio of two sRGB hex colors. Order of arguments does not matter. */
export const wcagContrast = (a: string, b: string): number => luminanceContrast(luminance(a), luminance(b));

/**
 * APCA lightness contrast (Lc), following the public APCA-W3 0.1.9 / 0.0.98G-4g
 * constants. Positive for dark text on a light background, negative for the
 * reverse. Reported for information; huecraft gates on WCAG 2.2 ratios.
 */
export function apcaContrast(text: string, background: string): number {
  const y = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((v) => v ** 2.4) as unknown as RGB;
    const lum = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return lum > 0.022 ? lum : lum + (0.022 - lum) ** 1.414; // soft clamp near black
  };
  const txt = y(text);
  const bg = y(background);
  if (Math.abs(bg - txt) < 0.0005) return 0;
  if (bg > txt) {
    const sapc = (bg ** 0.56 - txt ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (bg ** 0.65 - txt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

// ---- Color-vision deficiency ---------------------------------------------

export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
export const VISIONS: readonly Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

/**
 * Simulation matrices applied to linear RGB. Dichromacies are Machado, Oliveira
 * & Fernandes (2009) at severity 1.0; achromatopsia is plain luminance.
 */
export const CVD_MATRICES: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
  achromatopsia: [
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
  ],
};

/** How a hex color appears under the given vision type. */
export function simulateVision(hex: string, vision: Vision): string {
  if (vision === 'normal') return normalizeHex(hex) ?? hex;
  const lin = mul(CVD_MATRICES[vision], hexToRgb(hex).map(toLinear) as unknown as RGB);
  return rgbToHex(lin.map((v) => toGamma(clamp01(v))) as unknown as RGB);
}
