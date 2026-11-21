import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportTokens, FORMATS, isFormat, type Format } from './export.ts';
import { buildTokens, DEFAULT_RECIPE, LIMITS, parseRecipe, RATIOS, recipeFromParams, recipeToCommand, recipeToParams } from './tokens.ts';

const tokens = buildTokens({ ...DEFAULT_RECIPE, brand: '#7c3aed' });

test('CSS: scales, both themes, a P3 block, and every var() points at a declared property', () => {
  const css = exportTokens(tokens, 'css');
  assert.match(css, /--color-brand-600: #7c3aed;/);
  assert.match(css, /\[data-theme="dark"\] \{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /@media \(color-gamut: p3\) \{[\s\S]*--color-success-\d+: oklch\(/);
  assert.match(css, /--text-xl: clamp\(/);
  const declared = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
  const used = [...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  assert.ok(used.length > 50);
  for (const name of used) assert.ok(declared.has(name), `${name} is declared`);
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length, 'balanced braces');
});

test('Tailwind v4: an @theme block using Tailwind namespaces', () => {
  const tw = exportTokens(tokens, 'tailwind');
  assert.match(tw, /@import "tailwindcss";\n\n@theme \{/);
  assert.match(tw, /--color-primary: var\(--color-brand-600\);/);
  assert.match(tw, /--spacing: 0\.25rem;/);
  assert.match(tw, /--text-base: 1rem;/);
  assert.match(tw, /@layer base \{\n {2}\[data-theme="dark"\]/);
  assert.equal((tw.match(/\{/g) ?? []).length, (tw.match(/\}/g) ?? []).length);
});

test('design tokens JSON: DTCG types, color objects, and aliases that resolve', () => {
  const doc = JSON.parse(exportTokens(tokens, 'json'));
  assert.equal(doc.color.$type, 'color');
  assert.deepEqual(doc.color.brand['600'].$value, { colorSpace: 'srgb', components: [0.4863, 0.2275, 0.9294], hex: '#7c3aed' });
  assert.deepEqual(doc.space['4'].$value, { value: 1, unit: 'rem' });
  assert.match(doc.fontSize.xl.$extensions['huecraft.fluid'], /^clamp\(/);
  assert.deepEqual(doc.fontFamily.sans.$value.slice(0, 2), ['system-ui', '-apple-system']);
  // Shadows carry the same layers as the CSS export: 0 2px 4px ..., 0 6px 12px rgb(0 0 0 / 0.28).
  assert.equal(doc.shadow.dark.$type, 'shadow');
  assert.deepEqual(doc.shadow.dark.md.$value[1], {
    color: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000', alpha: 0.28 },
    offsetX: { value: 0, unit: 'px' },
    offsetY: { value: 6, unit: 'px' },
    blur: { value: 12, unit: 'px' },
    spread: { value: 0, unit: 'px' },
  });
  assert.match(exportTokens(tokens, 'css'), /--shadow-md: 0 2px 4px rgb\(0 0 0 \/ 0\.21\), 0 6px 12px rgb\(0 0 0 \/ 0\.28\);/);
  assert.equal(doc.shadow.light.xl.$value.length, 2);
  for (const theme of ['light', 'dark']) {
    for (const [name, tok] of Object.entries<{ $value: string }>(doc.semantic[theme])) {
      if (name.startsWith('$')) continue;
      const path = /^\{(.+)\}$/.exec(tok.$value)![1]!.split('.');
      const target = path.reduce((node, key) => node?.[key], doc);
      assert.ok(target?.$value?.hex, `${theme}.${name} -> ${tok.$value} resolves to a color`);
    }
  }
});

test('Figma payload: every variable has a value per mode and every alias target exists', () => {
  const doc = JSON.parse(exportTokens(tokens, 'figma'));
  const ids = new Set(doc.variables.map((v: { id: string }) => v.id));
  assert.equal(ids.size, doc.variables.length, 'ids are unique');
  const modes: Record<string, string[]> = { primitives: ['primitives-value'], semantic: ['semantic-light', 'semantic-dark'] };
  for (const v of doc.variables) {
    for (const mode of modes[v.variableCollectionId]!) {
      const entry = doc.variableModeValues.find((m: { variableId: string; modeId: string }) => m.variableId === v.id && m.modeId === mode);
      assert.ok(entry, `${v.id} has a ${mode} value`);
      if (entry.value?.type === 'VARIABLE_ALIAS') assert.ok(ids.has(entry.value.id), `${entry.value.id} exists`);
    }
  }
  for (const v of doc.variables) assert.doesNotMatch(v.name, /[.{}]/, 'Figma rejects these characters in names');
  const brand = doc.variableModeValues.find((m: { variableId: string }) => m.variableId === 'primitives/brand/600');
  assert.deepEqual(brand.value, { r: 0.4863, g: 0.2275, b: 0.9294, a: 1 });
});

test('SCSS: maps for scales, themes and dimensions', () => {
  const scss = exportTokens(tokens, 'scss');
  assert.match(scss, /\$color-brand: \(\n {2}50: #[0-9a-f]{6},/);
  assert.match(scss, /\$theme-dark: \(\n {2}'bg': #[0-9a-f]{6}, \/\/ neutral-950/);
  assert.match(scss, /\$space: \(\n {2}'0-5': 0\.125rem,/);
  assert.equal((scss.match(/\(/g) ?? []).length, (scss.match(/\)/g) ?? []).length);
});

test('every format is non-empty and isFormat guards the names', () => {
  for (const format of Object.keys(FORMATS)) {
    assert.ok(isFormat(format));
    assert.ok(exportTokens(tokens, format as keyof typeof FORMATS).length > 500);
  }
  assert.equal(isFormat('toString'), false);
  assert.equal(isFormat('xml'), false);
});

test('fonts and line heights reach every format, and the recreate command brings the fonts back', () => {
  const typed = buildTokens({ ...DEFAULT_RECIPE, brand: '#7c3aed', font: 'Source Sans 3', heading: 'Fraunces' });
  const css = exportTokens(typed, 'css');
  assert.match(css, /--font-sans: 'Source Sans 3', system-ui,/);
  assert.match(css, /--font-heading: 'Fraunces', 'Source Sans 3', system-ui,/);
  assert.match(css, /--text-base: 1rem;\n {2}--text-base--line-height: 1\.5;/);
  assert.match(css, /^\/\* .* --font 'Source Sans 3' --heading-font 'Fraunces' \*\/$/m);
  const tw = exportTokens(typed, 'tailwind');
  assert.match(tw, /--text-4xl--line-height: 1\.16;/, 'Tailwind applies it with text-4xl');
  assert.match(tw, /--font-heading: 'Fraunces',/);

  const doc = JSON.parse(exportTokens(typed, 'json'));
  assert.deepEqual(doc.fontFamily.heading.$value.slice(0, 3), ['Fraunces', 'Source Sans 3', 'system-ui']);
  assert.deepEqual(doc.lineHeight.base, { $value: 1.5 });
  assert.equal(doc.lineHeight.$type, 'number');

  const figma = JSON.parse(exportTokens(typed, 'figma'));
  const value = (id: string) => figma.variableModeValues.find((m: { variableId: string }) => m.variableId === id)?.value;
  assert.equal(value('primitives/line-height/base'), 24, 'px, as Figma wants');
  assert.equal(value('primitives/font-family/sans'), 'Source Sans 3');
  assert.equal(value('primitives/font-family/heading'), 'Fraunces');
  assert.equal(figma.variables.find((v: { id: string }) => v.id === 'primitives/font-family/sans').resolvedType, 'STRING');
  const plainFigma = JSON.parse(exportTokens(tokens, 'figma'));
  assert.ok(!plainFigma.variables.some((v: { id: string }) => v.id.includes('font-family')), 'no brand font, no font variable');

  const scss = exportTokens(typed, 'scss');
  assert.match(scss, /\$font-heading: 'Fraunces',/);
  assert.match(scss, /\$line-height: \(\n {2}'xs': 1\.5,/);
});

const CLI = fileURLToPath(new URL('../cli.ts', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('CLI prints the same output as the library and accepts the color with or without #', () => {
  const expected = exportTokens(tokens, 'scss');
  assert.equal(execFileSync(process.execPath, [CLI, '#7c3aed', '--format', 'scss'], { encoding: 'utf8' }), expected);
  assert.equal(run('7C3AED', '-f', 'scss').stdout, expected);
  assert.equal(run('7c3aed', '-f', 'SCSS').stdout, expected);
  assert.equal(run('rgb(124, 58, 237)', '-f', 'scss').stdout, expected);
  assert.equal(run('oklch(54.13% 0.2466 293.01)', '-f', 'scss').stdout, expected);
  assert.match(run('7c3aed').stdout, /^\/\* Generated by huecraft/);
  assert.match(run('7c3aed', '--level', 'AAA', '--no-fix').stdout, /--level AAA --no-fix \*\//);});

test('--fix overrides fx=0 from a link; --fix with --no-fix is refused', () => {
  const link = '?b=7c3aed&fx=0';
  assert.match(run(link).stdout, /--no-fix \*\//);
  assert.doesNotMatch(run(link, '--fix').stdout, /--no-fix/);
  assert.equal(run(link, '--fix').stdout, run('7c3aed').stdout);
  assert.equal(run('7c3aed', '--fix', '--no-fix').status, 2);
});

test('CLI status hue flags change the scales; a clash is a note on stderr, not a failure', () => {
  const moved = run('dc2626', '--danger-hue', '350', '-f', 'json');
  assert.equal(moved.status, 0);
  assert.equal(moved.stderr, '');
  assert.match(moved.stdout, /--danger-hue 350/);
  const clash = run('dc2626', '-f', 'json');
  assert.equal(clash.status, 0);
  assert.match(clash.stderr, /^huecraft: note: brand and danger hues are 2° apart/);
  assert.notEqual(JSON.parse(clash.stdout).color.danger['600'].$value, JSON.parse(moved.stdout).color.danger['600'].$value);
  const bad = run('7c3aed', '--info-hue=-1');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /info hue: "-1" must be a number from 0 to 360/);
});

test('CLI takes a studio link or its query string, and options override the link', () => {
  const recipe = { ...DEFAULT_RECIPE, brand: '#7c3aed', tint: 0.5, ratio: 1.333, level: 'AAA' as const, fix: false, danger: 10 };
  const query = `?${recipeToParams(recipe)}&th=dark&cv=protanopia&tab=export`;
  const expected = exportTokens(buildTokens(recipe), 'css');
  assert.equal(run(`https://example.com/huecraft/${query}`).stdout, expected);
  assert.equal(run(`HTTP://localhost:4140/${query}#x`).stdout, expected);
  assert.equal(run(query).stdout, expected);
  assert.equal(run(query, '--tint', '0.1', '--level', 'AA').stdout, exportTokens(buildTokens({ ...recipe, tint: 0.1, level: 'AA' }), 'css'));
  // Fields the link leaves out take their defaults, like in the studio.
  assert.equal(run('?b=7c3aed', '-f', 'scss').stdout, exportTokens(tokens, 'scss'));
  for (const [link, message] of [
    ['https://example.com/?t=0.5', /no brand color/],
    ['?b=7c3aed&t=9', /tint: "9" must be a number from 0 to 1/],
    ['http://[nope/?b=7c3aed', /is not a valid link/],
  ] as const) {
    const result = run(link);
    assert.equal(result.status, 2, link);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
  }
});

test('CLI takes --font and --heading-font, alone or over a link, and refuses unsafe names', () => {
  const expected = exportTokens(buildTokens({ ...DEFAULT_RECIPE, brand: '#7c3aed', font: 'Source Sans 3', heading: 'Fraunces' }), 'css');
  assert.equal(execFileSync(process.execPath, [CLI, '7c3aed', '--font', 'Source Sans 3', '--heading-font', 'Fraunces'], { encoding: 'utf8' }), expected);
  assert.equal(execFileSync(process.execPath, [CLI, '?b=7c3aed&f=Inter&fh=Fraunces', '--font', 'Source Sans 3'], { encoding: 'utf8' }), expected);
  const bad = run('7c3aed', '--font', "Inter'; }");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /font: "Inter'; }" must be a font family name/);
});

test('CLI rejects bad input with exit code 2 and a message on stderr', () => {
  for (const args of [[], ['nope'], ['7c3aed', '--format', 'xml'], ['7c3aed', '--tint', '9'], ['7c3aed', '--bogus'], ['7c3aed', 'ffffff']]) {
    const result = run(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^huecraft: /);
  }
  assert.match(run().stderr, /unquoted # starts a shell comment/);
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^huecraft <color> \[options\]/);
});

test('cli: a crafted link cannot write terminal control or bidi characters to stderr', () => {
  for (const link of ['?b=%1B]0;title%07%1B[2Jx', '?b=7c3aed&t=%C2%9B31m', '?b=7c3aed&lv=%E2%80%AEAA', `?b=${'z'.repeat(5000)}`]) {
    const { status, stderr } = run(link);
    assert.equal(status, 2);
    assert.doesNotMatch(stderr, /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e]/, link);
    assert.ok(stderr.length < 600, `${link.slice(0, 20)}: stderr ${stderr.length} chars`);
  }
  assert.match(run('?b=%1B[2J').stderr, /"\\u001b\[2J"/);
});

test('random recipes: link round trip, no NaN or undefined in any export, JSON formats parse', () => {
  let seed = 1; // fixed LCG so a failure reproduces
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const onGrid = (key: 'tint' | 'base' | 'unit' | 'radius' | 'success' | 'warning' | 'danger' | 'info') => {
    const { min, max, step } = LIMITS[key];
    return String(min + Math.floor(rand() * (Math.round((max - min) / step) + 1)) * step);
  };
  for (let i = 0; i < 60; i++) {
    const { recipe, errors } = parseRecipe({
      brand: `#${Math.floor(rand() * 0x1000000).toString(16).padStart(6, '0')}`,
      tint: onGrid('tint'), base: onGrid('base'), unit: onGrid('unit'), radius: onGrid('radius'),
      success: onGrid('success'), warning: onGrid('warning'), danger: onGrid('danger'), info: onGrid('info'),
      ratio: String(RATIOS[Math.floor(rand() * RATIOS.length)]), level: rand() < 0.5 ? 'AA' : 'AAA', fix: rand() < 0.5 ? '1' : '0',
      font: rand() < 0.5 ? 'Ünï 日本' : '', heading: rand() < 0.5 ? 'Foo-Bar' : '',
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(recipeFromParams(recipeToParams(recipe)).recipe, recipe);
    const tokens = buildTokens(recipe);
    for (const format of Object.keys(FORMATS) as Format[]) {
      const out = exportTokens(tokens, format);
      assert.doesNotMatch(out, /NaN|undefined|Infinity|\[object/, `${format} for ${recipeToCommand(recipe)}`);
      if (format === 'json' || format === 'figma') JSON.parse(out);
    }
  }
});
