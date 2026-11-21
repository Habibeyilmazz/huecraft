#!/usr/bin/env node
// huecraft CLI: prints the same tokens the web studio exports.

import { parseArgs } from 'node:util';
import { exportTokens, FORMATS, isFormat } from './core/export.ts';
import { buildTokens, LIMITS, parseRecipe, RATIOS } from './core/tokens.ts';

const USAGE = `huecraft <color> [options]

Turns one brand color into a design-token set and prints it to stdout.

  <color>            hex color, e.g. 7c3aed or '#7c3aed' (quote the # in a shell)

Options
  -f, --format <f>   ${Object.keys(FORMATS).join(' | ')}   (default: css)
      --tint <n>     neutral tint toward the brand hue, ${LIMITS.tint.min}..${LIMITS.tint.max}   (default: 0.3)
      --ratio <n>    type scale ratio: ${RATIOS.join(', ')}   (default: 1.25)
      --base <px>    body text size, ${LIMITS.base.min}..${LIMITS.base.max}   (default: 16)
      --unit <px>    spacing unit, ${LIMITS.unit.min}..${LIMITS.unit.max}   (default: 4)
      --radius <n>   corner roundness, ${LIMITS.radius.min}..${LIMITS.radius.max}   (default: 1)
      --level <l>    WCAG contrast target, AA | AAA   (default: AA)
      --no-fix       keep preferred steps even where they miss the contrast target
  -h, --help         show this help

Example
  huecraft 7c3aed --format tailwind > theme.css
`;

function fail(message: string): never {
  process.stderr.write(`huecraft: ${message}\nRun "huecraft --help" for usage.\n`);
  process.exit(2);
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

  const { recipe, errors } = parseRecipe({
    brand: positionals[0],
    tint: values.tint,
    ratio: values.ratio,
    base: values.base,
    unit: values.unit,
    radius: values.radius,
    level: values.level,
    fix: values['no-fix'] ? '0' : '1',
  });
  if (errors.length) fail(errors.join('\n          '));

  process.stdout.write(exportTokens(buildTokens(recipe), values.format));
}

main();
