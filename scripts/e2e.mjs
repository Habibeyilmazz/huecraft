// End-to-end check of the built app in headless Chromium.
//   node scripts/e2e.mjs            run the checks against `vite preview`
//   node scripts/e2e.mjs --shots    also refresh docs/screenshots/
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4142;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.argv.includes('--shots');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const browser = await chromium.launch();
let failed = false;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview did not start on port ${PORT}; run "npm run build" first`);
}

async function open(query = '', viewport = { width: 1440, height: 900 }, contextOptions = {}) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'], ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + query);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, close: () => context.close() };
}

const cssVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const settle = (page) => page.waitForTimeout(350); // one frame for the render, 250ms for the URL

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}\n     ${String(error.message ?? error).split('\n').join('\n     ')}`);
  }
}

try {
  await waitForServer();

  await check('loads with the default recipe and no console errors', async () => {
    const { page, errors, close } = await open();
    assert.equal(await page.locator('#scales .chip').count(), 66);
    assert.equal(await page.locator('#scales .chip.is-anchor').getAttribute('data-copy'), '#0c7c86');
    assert.equal(await cssVar(page, '--color-brand-600'), '#0c7c86');
    assert.equal(await page.locator('#semantic-table tbody tr').count(), 30);
    assert.deepEqual(errors, []);
    await close();
  });

  await check('typing a brand color rebuilds the tokens and the URL; junk is rejected with a message', async () => {
    const { page, close } = await open();
    await page.fill('#brand-hex', '#7c3aed');
    await settle(page);
    assert.equal(await page.locator('#scales .chip.is-anchor').getAttribute('data-copy'), '#7c3aed');
    assert.equal(await cssVar(page, '--color-primary'), '#7c3aed');
    assert.match(page.url(), /[?&]b=7c3aed(&|$)/);
    assert.equal(await page.inputValue('#brand-picker'), '#7c3aed');

    await page.fill('#brand-hex', 'zzz');
    await page.locator('#brand-hex').blur();
    assert.equal(await page.locator('#brand-hex').getAttribute('aria-invalid'), 'true');
    assert.ok(await page.locator('#brand-error').isVisible());
    assert.equal(await cssVar(page, '--color-primary'), '#7c3aed', 'tokens keep the last valid color');
    await close();
  });

  await check('recipe controls change the exported variables', async () => {
    const { page, close } = await open();
    await page.locator('#base').fill('18');
    await page.selectOption('#ratio', '1.5');
    await page.locator('#radius').fill('0');
    await page.locator('#tint').fill('0');
    await settle(page);
    assert.equal(await cssVar(page, '--text-base'), '1.125rem');
    assert.equal(await cssVar(page, '--radius-md'), '0');
    const neutral = await cssVar(page, '--color-neutral-500');
    assert.ok(neutral.slice(1, 3) === neutral.slice(3, 5) && neutral.slice(3, 5) === neutral.slice(5, 7), `${neutral} is grey`);
    assert.match(page.url(), /s=18/);
    await page.click('#reset');
    await settle(page);
    assert.equal(await cssVar(page, '--text-base'), '1rem');
    await close();
  });

  await check('theme switch restyles the preview instantly', async () => {
    const { page, close } = await open('?tab=preview&th=light');
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.pv')).backgroundColor);
    const light = await bg();
    await page.locator('input[name="theme"][value="dark"]').check({ force: true });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.notEqual(await bg(), light);
    const [r, g, b] = (await bg()).match(/\d+/g).map(Number);
    assert.ok(r + g + b < 90, `dark background, got ${await bg()}`);
    await close();
  });

  await check('a shared link restores the whole state; applying fixes clears the failures', async () => {
    const { page, close } = await open('?b=fde047&lv=AAA&fx=0&th=dark&tab=contrast&cv=protanopia&t=0.5');
    assert.equal(await page.locator('#tab-contrast').getAttribute('aria-selected'), 'true');
    assert.ok(await page.locator('#panel-contrast').isVisible());
    assert.ok(await page.locator('input[name="level"][value="AAA"]').isChecked());
    assert.equal(await page.locator('#fix').isChecked(), false);
    assert.equal(await page.inputValue('#vision'), 'protanopia');
    assert.equal(await page.inputValue('#tint'), '0.5');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.match(await page.evaluate(() => document.getElementById('layout').style.filter), /cvd-protanopia/);
    assert.match(await page.locator('#verdict h3').innerText(), /pairs? miss(es)? AAA/);
    assert.ok((await page.locator('#pairs-table .result-fail').count()) > 0);

    await page.click('[data-action="apply-fixes"]');
    await settle(page);
    assert.equal(await page.locator('#verdict h3').innerText(), 'Every color pair meets AAA');
    assert.equal(await page.locator('#pairs-table .result-fail').count(), 0);
    assert.ok(await page.locator('#fix').isChecked());
    assert.match(page.url(), /fx=1/);
    await close();
  });

  await check('hostile or broken URL parameters fall back to defaults', async () => {
    const { page, errors, close } = await open('?b=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&t=99&r=abc&lv=%22%3E&tab=nope&cv=x&th=x');
    assert.equal(await cssVar(page, '--color-brand-600'), '#0c7c86');
    assert.equal(await page.locator('#tab-palette').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    assert.deepEqual(errors, []);
    await close();
  });

  await check('tabs work from the keyboard', async () => {
    const { page, close } = await open();
    await page.focus('#tab-palette');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-preview');
    assert.ok(await page.locator('#panel-preview').isVisible());
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-export');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-palette');
    await close();
  });

  await check('contrast matrix follows its two selects', async () => {
    const { page, close } = await open('?tab=contrast');
    assert.equal(await page.locator('#matrix tbody td').count(), 121);
    await page.selectOption('#matrix-fg', 'brand');
    await page.selectOption('#matrix-bg', 'brand');
    await settle(page);
    // The diagonal of a scale against itself is always 1.00.
    assert.equal(await page.locator('#matrix tbody tr:nth-child(3) td:nth-of-type(3) .mx-ratio').innerText(), '1.00');
    await close();
  });

  await check('export: every format renders, copy and download work', async () => {
    const { page, close } = await open('?tab=export&b=7c3aed');
    const code = () => page.locator('#code').innerText();
    assert.match(await code(), /^\/\* Generated by huecraft\. Recreate with: huecraft 7c3aed /);
    const expectations = {
      tailwind: /@theme \{/,
      json: /"\$type": "color"/,
      figma: /"variableCollections"/,
      scss: /\$color-brand: \(/,
      css: /:root \{/,
    };
    for (const [format, pattern] of Object.entries(expectations)) {
      await page.locator(`input[name="format"][value="${format}"]`).check({ force: true });
      await settle(page);
      assert.match(await code(), pattern, format);
      if (format === 'json' || format === 'figma') JSON.parse(await code());
    }
    await page.click('#copy-code');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), (await page.locator('#code').textContent()));
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-code')]);
    assert.equal(download.suggestedFilename(), 'tokens.css');
    await close();
  });

  await check('copy link and copy swatch put the right text on the clipboard', async () => {
    const { page, close } = await open('?b=2456e6&tab=palette');
    await page.click('#share');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(link, page.url());
    assert.match(link, /b=2456e6.*th=(light|dark)/);
    await page.click('#scales .chip.is-anchor');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '#2456e6');
    assert.equal(await page.locator('#live').innerText(), 'Copied #2456e6');
    await close();
  });

  await check('no axe violations in any tab, either theme', async () => {
    for (const theme of ['light', 'dark']) {
      for (const tab of ['palette', 'preview', 'contrast', 'scale', 'export']) {
        const { page, close } = await open(`?tab=${tab}&th=${theme}`);
        await page.addScriptTag({ path: axePath });
        // The contrast samples show deliberately unreadable pairs; that is their job.
        const result = await page.evaluate(() => window.axe.run({ exclude: ['#matrix .mx-sample', '#pairs-table .sample'] }).then((r) => r.violations));
        const summary = result.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0].target} — ${v.nodes[0].failureSummary?.split('\n')[1] ?? ''}`);
        assert.deepEqual(summary, [], `${tab} / ${theme}`);
        await close();
      }
    }
  });

  await check('phone width: no sideways scroll in any tab', async () => {
    for (const tab of ['palette', 'preview', 'contrast', 'scale', 'export']) {
      const { page, close } = await open(`?tab=${tab}`, { width: 390, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${tab} overflows by ${overflow}px`);
      await close();
    }
  });

  if (SHOTS && !failed) {
    mkdirSync('docs/screenshots', { recursive: true });
    const shots = [
      ['palette', '?b=0c7c86&th=light', false],
      ['preview-light', '?b=0c7c86&th=light&tab=preview', true],
      ['preview-dark', '?b=7c3aed&th=dark&tab=preview', true],
      ['contrast', '?b=fde047&lv=AAA&fx=0&th=light&tab=contrast', false],
      ['vision', '?b=c81e5b&th=light&cv=deuteranopia', false],
    ];
    for (const [name, query, fullPage] of shots) {
      const { page, close } = await open(query, { width: 1440, height: 900 }, { deviceScaleFactor: 2 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage });
      await close();
    }
    console.log('ok   screenshots written to docs/screenshots/');
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
