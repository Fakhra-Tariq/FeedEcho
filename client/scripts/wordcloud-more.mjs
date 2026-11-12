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
    if (!c) {
      return { empty: document.body.innerText.includes('No responses') };
    }
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let maskPx = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] <= 4 && data[i + 1] <= 5 && data[i + 2] <= 6 && data[i + 3] > 200) maskPx += 1;
    }
    return { hits: (c._allHits || []).length, maskPx, w: c.width, h: c.height };
  });
  console.log(`SHOT ${name}`, JSON.stringify(stats));
}

async function open(page, n) {
  page.removeAllListeners('console');
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[word-cloud]') || msg.type() === 'error') console.log('CONSOLE', msg.type(), t);
  });
  await page.goto(`${base}/dev/word-cloud?n=${n}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

const browser = await chromium.launch({
  headless: true,
  args: ['--window-position=0,0'],
});

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await open(desktop, '0');
await desktop.waitForTimeout(1200);
await shot(desktop, 'fix-empty-then-1-before');
await open(desktop, '1');
await desktop.waitForTimeout(4500);
await shot(desktop, 'fix-empty-then-1-after');

await open(desktop, '3');
await desktop.waitForTimeout(4500);
await shot(desktop, 'fix-n3-t0');
await desktop.waitForTimeout(10000);
await shot(desktop, 'fix-n3-t10');
await desktop.waitForTimeout(20000);
await shot(desktop, 'fix-n3-t30');
await desktop.waitForTimeout(30000);
await shot(desktop, 'fix-n3-t60');

await open(desktop, '1');
await desktop.waitForTimeout(4500);
await shot(desktop, 'fix-n1-t0');
await desktop.waitForTimeout(10000);
await shot(desktop, 'fix-n1-t10');
await desktop.waitForTimeout(20000);
await shot(desktop, 'fix-n1-t30');
await desktop.waitForTimeout(30000);
await shot(desktop, 'fix-n1-t60');

await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 360, height: 740 } });
await open(mobile, '3');
await mobile.waitForTimeout(4500);
await shot(mobile, 'fix-n3-360');
const scroll = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
console.log('MOBILE_SCROLL', JSON.stringify(scroll));
await mobile.close();

const n40 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await open(n40, '40');
await n40.waitForTimeout(4500);
await shot(n40, 'fix-n40');
await open(n40, '80');
await n40.waitForTimeout(4500);
await shot(n40, 'fix-n80');
await n40.close();

await browser.close();
console.log('done');
