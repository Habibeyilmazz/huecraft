// Records docs/demo.gif from the real studio. Needs the production build served on PORT (default 4141) and ffmpeg.
//   npm run build && npm run preview   (other terminal)   node scripts/demo.mjs
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = `http://localhost:${process.env.PORT ?? 4141}/`;
const dir = 'shots/demo';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
let n = 0;
const frame = async (hold = 1) => {
  for (let i = 0; i < hold; i++) await page.screenshot({ path: `${dir}/f${String(n++).padStart(3, '0')}.png` });
};
await page.goto(`${base}?b=7c3aed&tab=palette`);
await page.waitForSelector('#scales .chip');
await frame(6);
for (const hex of ['#0c7c86', '#d9480f', '#2f9e44', '#7c3aed']) {
  await page.locator('#brand-hex').fill(hex);
  await page.locator('#brand-hex').blur();
  await page.waitForTimeout(150);
  await frame(6);
}
await page.getByRole('tab', { name: /preview/i }).click();
await page.waitForTimeout(200);
await frame(6);
await page.locator('input[name="theme"][value="dark"]').check({ force: true });
await page.waitForTimeout(200);
await frame(8);
await page.getByRole('tab', { name: /contrast/i }).click();
await page.waitForTimeout(200);
await frame(8);
await page.getByRole('tab', { name: /export/i }).click();
await page.waitForTimeout(200);
await frame(10);
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', `${dir}/f%03d.png`,
  '-vf', 'scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'docs/demo.gif']);
