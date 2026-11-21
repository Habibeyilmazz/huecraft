import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToOklch, luminance, luminanceContrast, oklchLuminance, oklchToHex, wcagContrast } from './color.ts';
import { radiusScale, spaceScale, typeScale, VIEWPORT_MAX, VIEWPORT_MIN } from './dimensions.ts';
import { brandScale, buildScales, neutralScale, STEPS } from './scales.ts';
import { buildTokens, DEFAULT_RECIPE, parseRecipe, recipeFromParams, recipeToCommand, recipeToParams } from './tokens.ts';

// A spread of brand colors: every 30° of hue at three lightness levels, plus the awkward ones.
const BRANDS = [
  ...[0.35, 0.6, 0.85].flatMap((l) => Array.from({ length: 12 }, (_, i) => oklchToHex({ l, c: 0.2, h: i * 30 }))),
  '#000000', '#ffffff', '#808080', '#ffff00', '#7c3aed', '#fde047', '#00ff00', '#0000ff', '#ff0000', '#fef9c3', '#1e1b4b',
];

test('brand scale keeps the input color exactly and runs light to dark', () => {
  for (const brand of BRANDS) {
    const scale = brandScale(brand);
    assert.equal(scale.swatches.length, 11);
    assert.equal(scale.swatches[scale.anchor!]!.hex, brand, `${brand} is preserved at its anchor`);
    for (let i = 1; i < 11; i++) {
      assert.ok(scale.swatches[i]!.lch.l < scale.swatches[i - 1]!.lch.l, `${brand}: step ${STEPS[i]} is darker than ${STEPS[i - 1]}`);
    }
    for (const s of scale.swatches) assert.match(s.hex, /^#[0-9a-f]{6}$/);
  }
});

test('brand scale holds the hue; a mid-lightness brand anchors mid-scale', () => {
  const scale = brandScale('#7c3aed');
  assert.equal(STEPS[scale.anchor!], 600);
  const hue = hexToOklch('#7c3aed').h;
  for (const s of scale.swatches) assert.ok(Math.abs(s.lch.h - hue) < 1e-9);
  assert.equal(STEPS[brandScale('#ffffff').anchor!], 50);
  assert.equal(STEPS[brandScale('#000000').anchor!], 950);
});

test('neutral scale is tinted toward the brand hue, and pure grey at tint 0 or for a grey brand', () => {
  const tinted = neutralScale('#7c3aed', 0.5);
  const mid = hexToOklch(tinted.swatches[5]!.hex);
  assert.ok(mid.c > 0.01 && mid.c < 0.03);
  assert.ok(Math.abs(mid.h - hexToOklch('#7c3aed').h) < 6, 'hue survives 8-bit rounding closely');
  for (const scale of [neutralScale('#7c3aed', 0), neutralScale('#808080', 1)]) {
    for (const s of scale.swatches) assert.ok(s.hex[1] === s.hex[3] && s.hex[3] === s.hex[5] && s.hex[2] === s.hex[4] && s.hex[4] === s.hex[6], s.hex);
  }
});

test('P3 values appear only where sRGB had to give up chroma, and are never set on the anchor', () => {
  const scales = buildScales('#7c3aed', 0.3);
  assert.ok(scales.success.swatches.some((s) => s.p3), 'status greens exceed sRGB somewhere');
  assert.ok(scales.neutral.swatches.every((s) => s.p3 === null), 'neutrals fit in sRGB');
  assert.equal(scales.brand.swatches[scales.brand.anchor!]!.p3, null);
  for (const s of scales.success.swatches) if (s.p3) assert.match(s.p3, /^oklch\([\d.]+% [\d.]+ [\d.]+\)$/);
});

test('with fix on, every checked pair meets its contrast target for every brand, theme and level', () => {
  for (const brand of BRANDS) {
    for (const level of ['AA', 'AAA'] as const) {
      const tokens = buildTokens({ ...DEFAULT_RECIPE, brand, level, fix: true });
      for (const theme of ['light', 'dark'] as const) {
        for (const pair of tokens.themes[theme].pairs) {
          assert.ok(pair.pass, `${brand} ${level} ${theme}: ${pair.fg} on ${pair.bg} is ${pair.ratio.toFixed(2)}, needs ${pair.required}`);
        }
      }
    }
  }
});

test('pair checks report real ratios; fix off keeps preferred steps and lists the moves', () => {
  const fixed = buildTokens({ ...DEFAULT_RECIPE, brand: '#fde047', level: 'AAA', fix: true });
  const raw = buildTokens({ ...DEFAULT_RECIPE, brand: '#fde047', level: 'AAA', fix: false });
  const hex = (t: typeof fixed, name: string) => t.themes.light.tokens.find((tok) => tok.name === name)!.hex;
  for (const pair of fixed.themes.light.pairs) {
    const srgb = wcagContrast(hex(fixed, pair.fg), hex(fixed, pair.bg));
    assert.ok(pair.ratio <= srgb && pair.ratio > srgb - 0.5, 'the sRGB ratio, or slightly less where P3 lowers it');
  }
  assert.ok(raw.themes.light.pairs.some((p) => !p.pass), 'a yellow brand at AAA fails somewhere without fixing');
  assert.ok(raw.moves.length > 0);
  assert.deepEqual(raw.moves, fixed.moves, 'moves are reported whether or not fix is applied');
  // Every listed move names a token that really differs, and points at the fixed step.
  for (const move of raw.moves.filter((m) => m.theme === 'light')) {
    assert.notEqual(hex(raw, move.token), hex(fixed, move.token));
    assert.deepEqual(fixed.themes.light.tokens.find((t) => t.name === move.token)!.ref, move.to);
    assert.deepEqual(raw.themes.light.tokens.find((t) => t.name === move.token)!.ref, move.from);
  }
});

test('contrast holds for the P3 overrides too, not only the sRGB hex values', () => {
  // With this green, primary-text passes AA in sRGB at brand-600 but its P3 override does not.
  const tokens = buildTokens({ ...DEFAULT_RECIPE, brand: '#0dbb3e', tint: 0.5 });
  const p3Luminance = (name: string) => {
    const ref = tokens.themes.light.tokens.find((t) => t.name === name)!.ref;
    if (ref === 'white') return 1;
    const swatch = tokens.scales[ref.scale].swatches.find((s) => s.step === ref.step)!;
    if (!swatch.p3) return luminance(swatch.hex);
    // Recompute independently from the CSS string that gets exported.
    const [l, c, h] = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(swatch.p3)!.slice(1).map(Number);
    return oklchLuminance({ l: l! / 100, c: c!, h: h! });
  };
  let checkedP3 = 0;
  for (const pair of tokens.themes.light.pairs) {
    const wide = luminanceContrast(p3Luminance(pair.fg), p3Luminance(pair.bg));
    assert.ok(wide >= pair.required, `${pair.fg} on ${pair.bg} is ${wide.toFixed(3)} on P3 screens`);
    assert.ok(Math.abs(pair.ratio - Math.min(wide, wcagContrast(
      tokens.themes.light.tokens.find((t) => t.name === pair.fg)!.hex,
      tokens.themes.light.tokens.find((t) => t.name === pair.bg)!.hex,
    ))) < 1e-9);
    if (wide < pair.ratio + 1e-9) checkedP3++;
  }
  assert.ok(checkedP3 > 0, 'at least one pair is limited by its P3 rendering');
});

test('type scale: fluid sizes hit their min and max exactly at the viewport bounds', () => {
  const scale = typeScale(16, 1.25);
  assert.deepEqual(scale.map((s) => s.name), ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']);
  const base = scale[2]!;
  assert.equal(base.css, '1rem');
  assert.equal(scale[0]!.css, '0.75rem', 'small steps never drop under 12px');
  const xl = scale[4]!;
  assert.ok(Math.abs(xl.maxPx - 25) < 1e-9);
  assert.ok(xl.minPx < xl.maxPx);
  const m = /^clamp\(([\d.]+)rem, ([\d.-]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(xl.css);
  assert.ok(m, xl.css);
  const at = (vw: number) => Number(m[2]) * 16 + (Number(m[3]) / 100) * vw;
  assert.ok(Math.abs(at(VIEWPORT_MIN) - xl.minPx) < 0.02);
  assert.ok(Math.abs(at(VIEWPORT_MAX) - xl.maxPx) < 0.02);
  assert.ok(Math.abs(Number(m[1]) * 16 - xl.minPx) < 0.01 && Math.abs(Number(m[4]) * 16 - xl.maxPx) < 0.01);
});

test('space and radius scales', () => {
  const space = spaceScale(4);
  assert.deepEqual(space.slice(0, 4).map((s) => [s.name, s.css]), [['0_5', '0.125rem'], ['1', '0.25rem'], ['1_5', '0.375rem'], ['2', '0.5rem']]);
  assert.deepEqual(radiusScale(0).map((r) => r.css), ['0', '0', '0', '0', '0', '0', '9999px']);
  assert.equal(radiusScale(1).find((r) => r.name === 'md')!.css, '0.375rem');
  assert.equal(radiusScale(2).find((r) => r.name === 'md')!.px, 12);
});

test('recipes round-trip through URL params', () => {
  const recipe = { brand: '#7c3aed', tint: 0.65, ratio: 1.333, base: 18, unit: 4.5, radius: 0.25, level: 'AAA', fix: false } as const;
  const { recipe: back, errors } = recipeFromParams(new URLSearchParams(recipeToParams(recipe).toString()));
  assert.deepEqual(errors, []);
  assert.deepEqual(back, recipe);
  assert.deepEqual(recipeFromParams(new URLSearchParams('')).recipe, DEFAULT_RECIPE);
});

test('untrusted recipe input is validated field by field', () => {
  const { recipe, errors } = parseRecipe({
    brand: '<script>', tint: '7', ratio: '1.3', base: 'NaN', unit: '', radius: '-1', level: 'A', fix: 'yes',
  });
  assert.deepEqual(recipe, DEFAULT_RECIPE, 'every invalid field falls back to its default');
  assert.equal(errors.length, 8);
  const ok = parseRecipe({ brand: 'ABC', level: 'aaa', tint: '0', fix: '0' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.recipe, { ...DEFAULT_RECIPE, brand: '#aabbcc', level: 'AAA', tint: 0, fix: false });
});

test('recipeToCommand prints a CLI call that parses back to the same recipe', () => {
  assert.equal(recipeToCommand(DEFAULT_RECIPE), 'huecraft 0c7c86 --tint 0.3 --ratio 1.25 --base 16 --unit 4 --radius 1 --level AA');
  assert.match(recipeToCommand({ ...DEFAULT_RECIPE, fix: false }), / --no-fix$/);
});
