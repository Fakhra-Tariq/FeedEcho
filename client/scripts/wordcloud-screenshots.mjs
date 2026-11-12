import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'wordcloud-shots');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.WORDCLOUD_BASE || 'http://127.0.0.1:3001';

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { hits: -1, maskPx: -1, empty: !!document.body.innerText.includes('No responses') };
    const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let maskPx = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] <= 4 && data[i + 1] <= 5 && data[i + 2] <= 6 && data[i + 3] > 200) maskPx += 1;
    }
    return {
      hits: (c._allHits || []).length,
      maskPx,
      w: width,
      h: height,
    };
  });
  console.log(`SHOT ${name}`, JSON.stringify(stats), '->', file);
  return file;
}

async function open(page, n) {
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[word-cloud]') || msg.type() === 'error') console.log('CONSOLE', msg.type(), t);
  });
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
  await page.goto(`${base}/dev/word-cloud?n=${n}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await open(page, '1');
await page.waitForTimeout(4500);
await shot(page, 'fix-n1-0s');
await page.waitForTimeout(10000);
await shot(page, 'fix-n1-10s');

await open(page, '3');
await page.waitForTimeout(4500);
await shot(page, 'fix-n3-0s');
await page.waitForTimeout(10000);
await shot(page, 'fix-n3-10s');

await open(page, '40');
await page.waitForTimeout(4500);
await shot(page, 'fix-n40');

await open(page, '80');
await page.waitForTimeout(4500);
await shot(page, 'fix-n80');

await open(page, '3');
await page.waitForTimeout(4500);
await open(page, '4');
await page.waitForTimeout(4500);
await shot(page, 'fix-n3-then-4');

await open(page, '0');
await page.waitForTimeout(1500);
await shot(page, 'fix-n0-empty');

await open(page, '3');
await page.waitForTimeout(4500);
await page.getByRole('button', { name: 'Whole answer' }).click();
await page.waitForTimeout(1500);
await shot(page, 'fix-n3-whole');
await page.getByRole('button', { name: 'Each word' }).click();
await page.waitForTimeout(1500);
await shot(page, 'fix-n3-each');

await page.setViewportSize({ width: 360, height: 740 });
await open(page, '3');
await page.waitForTimeout(4500);
await shot(page, 'fix-n3-360');

if (process.env.WORDCLOUD_WAIT60 === '1') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '3');
  await page.waitForTimeout(2500);
  await shot(page, 'fix-n3-t0');
  await page.waitForTimeout(10000);
  await shot(page, 'fix-n3-t10');
  await page.waitForTimeout(20000);
  await shot(page, 'fix-n3-t30');
  await page.waitForTimeout(30000);
  await shot(page, 'fix-n3-t60');
}

await browser.close();
console.log('done', outDir);
