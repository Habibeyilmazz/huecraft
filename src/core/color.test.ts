import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apcaContrast,
  CVD_MATRICES,
  formatOklch,
  gamutMap,
  hexToOklch,
  inGamut,
  normalizeHex,
  oklchToHex,
  oklchToP3,
  simulateVision,
  wcagContrast,
} from './color.ts';

const near = (actual: number, expected: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('normalizeHex accepts short, long and hash-less forms and rejects junk', () => {
  assert.equal(normalizeHex('#7C3AED'), '#7c3aed');
  assert.equal(normalizeHex('7c3aed'), '#7c3aed');
  assert.equal(normalizeHex(' #abc '), '#aabbcc');
  for (const bad of ['', '#12', '#12345', 'red', '#gggggg', '#1234567', 'javascript:alert(1)']) {
    assert.equal(normalizeHex(bad), null, bad);
  }
});

test('hex to OKLCH matches published reference values', () => {
  // Reference values from the CSS Color 4 / oklch.com conversions.
  const cases: [string, number, number, number][] = [
    ['#ff0000', 0.628, 0.2577, 29.23],
    ['#00ff00', 0.8664, 0.2948, 142.5],
    ['#0000ff', 0.452, 0.3132, 264.05],
    ['#7c3aed', 0.5413, 0.2466, 293.01],
  ];
  for (const [hex, l, c, h] of cases) {
    const lch = hexToOklch(hex);
    near(lch.l, l, 0.001, `${hex} L`);
    near(lch.c, c, 0.001, `${hex} C`);
    near(lch.h, h, 0.1, `${hex} H`);
  }
  assert.deepEqual(hexToOklch('#ffffff').h, 0, 'grey hue is pinned to 0');
  near(hexToOklch('#ffffff').l, 1, 1e-6);
  near(hexToOklch('#000000').l, 0, 1e-6);
});

test('hex -> OKLCH -> hex round-trips exactly', () => {
  for (const hex of ['#000000', '#ffffff', '#7c3aed', '#0c7c86', '#ff0000', '#00ff00', '#0000ff', '#fde047', '#808080', '#123456']) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
});

test('gamut mapping keeps lightness and hue, only lowers chroma', () => {
  const wild = { l: 0.7, c: 0.37, h: 150 };
  assert.equal(inGamut(wild, 'srgb'), false);
  assert.equal(inGamut(wild, 'p3'), false);
  const srgb = gamutMap(wild, 'srgb');
  const p3 = gamutMap(wild, 'p3');
  assert.equal(srgb.l, wild.l);
  assert.equal(srgb.h, wild.h);
  assert.ok(inGamut(srgb, 'srgb') && inGamut(p3, 'p3'));
  assert.ok(srgb.c < p3.c && p3.c < wild.c, 'P3 keeps more chroma than sRGB');
  // The result sits on the gamut boundary, not well inside it.
  assert.equal(inGamut({ ...srgb, c: srgb.c + 0.002 }, 'srgb'), false);
  // In-gamut input is returned untouched; extremes collapse to white / black.
  const inside = { l: 0.6, c: 0.05, h: 200 };
  assert.equal(gamutMap(inside, 'srgb'), inside);
  assert.equal(oklchToHex({ l: 1.2, c: 0.3, h: 10 }), '#ffffff');
  assert.equal(oklchToHex({ l: -0.1, c: 0.3, h: 10 }), '#000000');
});

test('Display P3 conversion: sRGB red and the P3 red primary', () => {
  // sRGB red expressed in P3 is color(display-p3 0.9175 0.2003 0.1386).
  const [r, g, b] = oklchToP3(hexToOklch('#ff0000'));
  near(r, 0.9175, 0.001);
  near(g, 0.2003, 0.001);
  near(b, 0.1386, 0.001);
  // The P3 red primary is oklch(64.86% 0.2995 28.96): inside P3, outside sRGB.
  const p3Red = { l: 0.6486, c: 0.299, h: 28.96 };
  assert.equal(inGamut(p3Red, 'srgb'), false);
  assert.equal(inGamut(p3Red, 'p3'), true);
});

test('formatOklch prints CSS notation', () => {
  assert.equal(formatOklch({ l: 0.54129, c: 0.24661, h: 293.0094 }), 'oklch(54.13% 0.2466 293.01)');
});

test('WCAG contrast ratio', () => {
  assert.equal(wcagContrast('#000000', '#ffffff'), 21);
  assert.equal(wcagContrast('#ffffff', '#000000'), 21);
  assert.equal(wcagContrast('#336699', '#336699'), 1);
  near(wcagContrast('#767676', '#ffffff'), 4.54, 0.01); // the classic lightest AA grey
  near(wcagContrast('#777777', '#ffffff'), 4.48, 0.01);
  near(wcagContrast('#0000ff', '#ffffff'), 8.59, 0.01);
});

test('APCA Lc matches the APCA-W3 reference test values', () => {
  // text, background, expected Lc — from the apca-w3 package README.
  const cases: [string, string, number][] = [
    ['#888888', '#ffffff', 63.056469930209424],
    ['#ffffff', '#888888', -68.54146436644962],
    ['#000000', '#aaaaaa', 58.146262578561334],
    ['#aaaaaa', '#000000', -56.24113336839742],
    ['#112233', '#ddeeff', 91.66830811481631],
    ['#ddeeff', '#112233', -93.06770049484275],
    ['#112233', '#223344', 1.7512243099356113],
    ['#223344', '#112233', -1.6349191031377903],
  ];
  for (const [text, bg, expected] of cases) {
    const lc = apcaContrast(text, bg);
    // Values under the 10 Lc clip are reported as 0 by this implementation.
    if (Math.abs(expected) < 10) assert.equal(lc, 0);
    else near(lc, expected, 0.01, `${text} on ${bg}`);
  }
  near(apcaContrast('#000000', '#ffffff'), 106.04, 0.01);
  near(apcaContrast('#ffffff', '#000000'), -107.88, 0.01);
});

test('vision simulation: matrices preserve greys, dichromats lose red/green difference', () => {
  for (const [name, m] of Object.entries(CVD_MATRICES)) {
    for (const row of m) near(row[0] + row[1] + row[2], 1, 1e-5, name);
  }
  assert.equal(simulateVision('#808080', 'deuteranopia'), '#808080');
  assert.equal(simulateVision('#7C3AED', 'normal'), '#7c3aed');
  const grey = simulateVision('#ff0000', 'achromatopsia');
  assert.ok(grey[1] === grey[3] && grey[3] === grey[5]);
  // A red and a green of similar lightness: clearly different hues normally,
  // nearly the same hue for a protanope.
  const hueGap = (a: string, b: string) => {
    const d = Math.abs(hexToOklch(a).h - hexToOklch(b).h);
    return Math.min(d, 360 - d);
  };
  const red = '#d0312d';
  const green = '#4c9a2a';
  assert.ok(hueGap(red, green) > 90);
  assert.ok(hueGap(simulateVision(red, 'protanopia'), simulateVision(green, 'protanopia')) < 40);
});
