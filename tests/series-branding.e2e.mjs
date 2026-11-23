import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/series', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const artworkSize = async selector => page.locator(selector).evaluate(async image => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
    // Ignore transparent margins and the near-white floor beneath the product.
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] < 180 || Math.min(data[i], data[i + 1], data[i + 2]) > 220) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    const rect = image.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    return { width: (right - left + 1) * scale, height: (bottom - top + 1) * scale };
  });
  const comparable = (s, p, label) => {
    for (const axis of ['width', 'height']) {
      const ratio = s[axis] / p[axis];
      assert.ok(ratio >= .95 && ratio <= 1.05, `${label} ${axis}: S/P = ${ratio}`);
    }
    console.log(`${label}:`, { bw05s: s, bw05p: p });
  };
  for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1512, height: 1100 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${base}#/app`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-model=bw05p]').waitFor();
    assert.equal(await page.title(), '清洗机系列');
    comparable(await artworkSize('[data-model=bw05s] img'), await artworkSize('[data-model=bw05p] img'), `list ${viewport.width}`);
    await page.screenshot({ path: `tests/artifacts/series/list-${viewport.width}.png` });
    const sizes = {};
    for (const id of ['bw05s', 'bw05p']) {
      await page.goto(`${base}#/app/cleaning-machine/models/${id}/home`, { waitUntil: 'domcontentloaded' });
      await page.locator('.bw-product img').waitFor();
      sizes[id] = await artworkSize('.bw-product img');
      assert.ok(await page.locator('.bw-product').evaluate(product => {
        const image = product.querySelector('img').getBoundingClientRect();
        const bars = product.querySelector('.bw-supply-bars').getBoundingClientRect();
        const parent = product.getBoundingClientRect();
        return image.right <= bars.left + 1 && Math.abs((image.left + image.right - parent.left - parent.right) / 2) < 2;
      }), `${id}: centered image does not overlap consumables`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `tests/artifacts/series/${id}-${viewport.width}.png` });
      await page.getByRole('button', { name: '设备设置', exact: true }).click();
      await page.locator('.bw-device-info img').waitFor();
      await artworkSize('.bw-device-info img');
      await page.screenshot({ path: `tests/artifacts/series/${id}-settings-${viewport.width}.png` });
      await page.locator('.bw-consumables-summary').click();
      await artworkSize('.bw-management-product img');
      await page.screenshot({ path: `tests/artifacts/series/${id}-supplies-${viewport.width}.png` });
    }
    comparable(sizes.bw05s, sizes.bw05p, `control ${viewport.width}`);
  }
  await page.goto(`${base}#/demo`, { waitUntil: 'domcontentloaded' });
  await page.locator('.global-panel').waitFor();
  assert.equal(await page.title(), '清洗机系列');
  assert.equal(await page.locator('.workspace-header').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: series branding, comparable S/P artwork, centered products, consumables clearance and responsive screenshots.');
} finally { await browser.close(); }
