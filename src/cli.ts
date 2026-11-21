#!/usr/bin/env node
// huecraft CLI: prints the same tokens the web studio exports.

import { parseArgs } from 'node:util';
import { exportTokens, FORMATS, isFormat } from './core/export.ts';
import { STATUS_HUES } from './core/scales.ts';
import { buildTokens, hueClashes, LIMITS, parseRecipe, RATIOS, recipeInputFromParams, type Recipe } from './core/tokens.ts';

const USAGE = `huecraft <color> [options]
       huecraft <studio link> [options]

Turns one brand color into a design-token set and prints it to stdout.

  <color>            7c3aed, '#7c3aed', 'rgb(124 58 237)' or 'oklch(0.54 0.25 293)'
                     (quote anything with # or brackets; colors outside sRGB are brought into it)
  <studio link>      a link from the studio's "Copy link", or just its ?query part, in quotes;
                     its recipe is used and any option below overrides it

Options
  -f, --format <f>   ${Object.keys(FORMATS).join(' | ')}   (default: css)
      --tint <n>     neutral tint toward the brand hue, ${LIMITS.tint.min}..${LIMITS.tint.max}   (default: 0.3)
      --ratio <n>    type scale ratio: ${RATIOS.join(', ')}   (default: 1.25)
      --base <px>    body text size, ${LIMITS.base.min}..${LIMITS.base.max}   (default: 16)
      --unit <px>    spacing unit, ${LIMITS.unit.min}..${LIMITS.unit.max}   (default: 4)
      --radius <n>   corner roundness, ${LIMITS.radius.min}..${LIMITS.radius.max}   (default: 1)
      --level <l>    WCAG contrast target, AA | AAA   (default: AA)
      --success-hue <deg>, --warning-hue <deg>, --danger-hue <deg>, --info-hue <deg>
                     OKLCH hue of a status scale, 0..360
                     (defaults: ${Object.entries(STATUS_HUES).map(([s, h]) => `${s} ${h}`).join(', ')})
      --no-fix       keep preferred steps even where they miss the contrast target
  -h, --help         show this help

Examples
  huecraft 7c3aed --format tailwind > theme.css
  huecraft 'https://example.com/huecraft/?b=7c3aed&t=0.5&th=dark' --format scss
`;

function fail(message: string): never {
  process.stderr.write(`huecraft: ${message}\nRun "huecraft --help" for usage.\n`);
  process.exit(2);
}

/** A color, or a studio link (full URL or its `?query`) whose recipe fields are read. */
function recipeInput(arg: string): Partial<Record<keyof Recipe, string>> {
  let params: URLSearchParams;
  if (arg.startsWith('?')) params = new URLSearchParams(arg);
  else if (/^https?:\/\//i.test(arg)) {
    try {
      params = new URL(arg).searchParams;
    } catch {
      fail(`"${arg}" is not a valid link`);
    }
  } else return { brand: arg };
  const input = recipeInputFromParams(params);
  if (input.brand === undefined) fail('the link has no brand color (b=); copy it again with "Copy link" in the studio');
  return input;
}

function main(): void {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        format: { type: 'string', short: 'f', default: 'css' },
        tint: { type: 'string' },
        ratio: { type: 'string' },
        base: { type: 'string' },
        unit: { type: 'string' },
        radius: { type: 'string' },
        level: { type: 'string' },
        'success-hue': { type: 'string' },
        'warning-hue': { type: 'string' },
        'danger-hue': { type: 'string' },
        'info-hue': { type: 'string' },
        'no-fix': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    fail((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (positionals.length !== 1) fail(positionals.length ? 'expected exactly one color' : 'missing color');
  if (!isFormat(values.format)) fail(`unknown format "${values.format}" (use ${Object.keys(FORMATS).join(', ')})`);

  const input = recipeInput(positionals[0]!);
  const flags: Partial<Record<keyof Recipe, string | undefined>> = {
    tint: values.tint,
    ratio: values.ratio,
    base: values.base,
    unit: values.unit,
    radius: values.radius,
    level: values.level,
    fix: values['no-fix'] ? '0' : undefined,
    success: values['success-hue'],
    warning: values['warning-hue'],
    danger: values['danger-hue'],
    info: values['info-hue'],
  };
  for (const [key, value] of Object.entries(flags) as [keyof Recipe, string | undefined][]) {
    if (value !== undefined) input[key] = value;
  }
  const { recipe, errors } = parseRecipe(input);
  if (errors.length) fail(errors.join('\n          '));

  // A warning, not an error: the tokens are still valid, and stdout stays clean for redirection.
  for (const { a, b, degrees } of hueClashes(recipe)) {
    process.stderr.write(`huecraft: note: ${a} and ${b} hues are ${degrees}° apart and may read as one color (--${b}-hue moves ${b})\n`);
  }
  process.stdout.write(exportTokens(buildTokens(recipe), values.format));
}

main();
