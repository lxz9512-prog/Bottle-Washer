import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/mobile-entry', { recursive: true });
try {
  for (const device of ['iPhone 13', 'Pixel 7']) {
    const context = await browser.newContext({ ...devices[device] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['#/demo', '#/demo/cleaning-machine/models/bw05s/home', '#/cleaning-machine/models/bw05p/settings', '#/demo/cleaning-machine/models/bw05a/consumables']) {
      await page.goto(`${base}${route}`);
      await page.locator('[data-app-screen]').waitFor();
      assert.equal(new URL(page.url()).hash, route.includes('/cleaning-machine') ? route.replace(/^#\/(?:demo\/)?/, '#/app/') : '#/app');
      assert.equal(await page.locator('[data-device-frame], .workspace-header, .device-status-bar, [data-home-indicator]').count(), 0);
      assert.ok(await page.locator('[data-app-screen]').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return rect.top === 0 && rect.left === 0 && Math.abs(rect.bottom - visualViewport.height) < 1 && rect.width === innerWidth && document.documentElement.scrollWidth === innerWidth;
      }), `${device}: page must cover the visible viewport`);
    }
    await page.goto(`${base}#/demo/cleaning-machine/models/bw05s/home`);
    await page.locator('[data-mode=auto] .bw-mode-open').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForTimeout(300);
    assert.ok(await dialog.evaluate(node => {
      const r = node.getBoundingClientRect();
      return Math.abs(r.bottom - visualViewport.height) < 1 && r.top >= 0;
    }), 'sheet reaches the bottom without an outer blank band');
    await page.screenshot({ path: `tests/artifacts/mobile-entry/${device.replaceAll(' ', '-')}.png` });
    await page.getByRole('button', { name: '收起浮窗', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const original = page.viewportSize();
    await page.setViewportSize({ width: original.height, height: original.width });
    await page.waitForFunction(() => Math.abs(document.querySelector('[data-app-screen]').getBoundingClientRect().height - visualViewport.height) < 1);
    assert.match(page.url(), /#\/app\//, 'rotation keeps the fullscreen experience');
    const pc = new URL(base);
    pc.searchParams.set('preview', 'pc');
    pc.hash = '/demo';
    await page.goto(pc.href);
    await page.locator('[data-device-frame]').waitFor();
    await page.getByRole('button', { name: '移动版', exact: true }).click();
    await page.locator('[data-app-screen]').waitFor();
    assert.equal(new URL(page.url()).searchParams.has('preview'), false);
    await page.setViewportSize({ width: 420, height: 912 });
    // Chromium has no native iOS safe-area emulation; exercise the actual CSS inset variables.
    await page.addStyleTag({ content: '.mobile-app { --app-safe-top: 62px; --app-safe-bottom: 34px; }' });
    assert.equal(await page.locator('meta[name=apple-mobile-web-app-status-bar-style]').getAttribute('content'), 'black-translucent');
    for (const route of ['', '/cleaning-machine/models/bw05s/home', '/cleaning-machine/models/bw05s/settings', '/cleaning-machine/models/bw05s/consumables']) {
      await page.goto(`${base}#/app${route}`);
      await page.locator('[data-app-screen]').waitFor();
      await page.addStyleTag({ content: '.mobile-app { --app-safe-top: 62px; --app-safe-bottom: 34px; }' });
      assert.ok(await page.locator('.device-content').evaluate(node => {
        const content = node.getBoundingClientRect();
        const screen = node.closest('[data-app-screen]').getBoundingClientRect();
        const back = node.querySelector('.bw-header button, .home-header button').getBoundingClientRect();
        return content.top === screen.top && content.bottom === screen.bottom && back.top >= 62;
      }), 'background covers both safe areas while header stays below status bar');
      const shot = await page.screenshot({ path: `tests/artifacts/mobile-entry/safe-${device.replaceAll(' ', '-')}-${route.split('/').at(-1) || 'devices'}.png` });
      const seam = await page.evaluate(async base64 => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const scale = image.width / innerWidth;
        const color = y => [...ctx.getImageData(Math.round(4 * scale), Math.round(y * scale), 1, 1).data];
        const delta = (a, b) => Math.max(...a.slice(0, 3).map((value, i) => Math.abs(value - b[i])));
        return { top: delta(color(60), color(64)), bottom: delta(color(innerHeight - 36), color(innerHeight - 32)) };
      }, shot.toString('base64'));
      assert.ok(seam.top < 8 && seam.bottom < 8, `no visible safe-area color band: ${JSON.stringify(seam)}`);
    }
    await page.goto(`${base}#/app/cleaning-machine/models/bw05s/home`);
    await page.locator('[data-mode=auto] .bw-mode-open').click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(300);
    assert.ok(await page.locator('.bw-sheet-footer').evaluate(node => {
      const rect = node.getBoundingClientRect();
      const button = node.querySelector('button').getBoundingClientRect();
      return rect.bottom === innerHeight && button.bottom <= innerHeight - 34;
    }), 'sheet paints to the bottom but buttons avoid the home indicator');
    await dialog.getByRole('button', { name: '收起浮窗', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('[data-mode=auto] .bw-mode-open').click();
    await page.getByRole('button', { name: '开始清洗', exact: true }).click();
    await page.locator('.bw-progress').waitFor();
    await page.waitForTimeout(600);
    assert.ok(await page.locator('.app-page-body').evaluate(node => {
      const screen = node.closest('[data-app-screen]').getBoundingClientRect();
      const body = node.getBoundingClientRect();
      const header = node.querySelector('.bw-header').getBoundingClientRect();
      const back = node.querySelector('.bw-header button').getBoundingClientRect();
      const action = node.querySelector('.bw-dock .bw-primary').getBoundingClientRect();
      return body.top === screen.top && body.bottom === screen.bottom && header.top === screen.top && back.top >= screen.top + 62 && action.bottom <= screen.bottom - 34;
    }), 'device controls protect foreground safe areas without shrinking the page background');
    assert.ok(await page.locator('[data-app-screen]').evaluate(node => {
      const screen = node.getBoundingClientRect();
      const color = getComputedStyle(node).backgroundImage;
      return screen.top === 0 && screen.bottom === innerHeight && color.includes('linear-gradient');
    }), 'device control page paints its background edge to edge');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: iPhone/Android links, model/page preservation, edge-to-edge layout, rotation, PC override and simulated iOS safe-area background pixels/controls.');
} finally {
  await browser.close();
}
