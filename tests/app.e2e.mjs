import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/app', { recursive: true });
const errors = [];
let checks = 0;
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('BW05S_demo_v1:device-name', JSON.stringify('PC only'));
    localStorage.setItem('BW05S_demo_v1:preferences', JSON.stringify({ locale: 'en', darkMode: true }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const inspect = async name => {
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-app-screen]');
      return node && Math.abs(node.getBoundingClientRect().bottom - innerHeight) < 2;
    });
    const bounds = await page.locator('[data-app-screen]').evaluate(node => {
      const r = node.getBoundingClientRect();
      const content = node.querySelector('.device-content').getBoundingClientRect();
      return { width: r.width, height: r.height, top: r.top, bottom: r.bottom, viewport: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth || node.scrollWidth > node.clientWidth,
        contentFits: content.bottom <= r.bottom + 1 && content.top >= r.top,
        fakeChrome: document.querySelectorAll('[data-device-frame], [data-device-chrome], .device-status-bar, [data-home-indicator], .console-panel, .workspace-header').length };
    });
    assert.equal(bounds.overflow, false, `${name}: ${JSON.stringify(bounds)}`);
    assert.equal(bounds.fakeChrome, 0, name);
    assert.ok(bounds.contentFits && Math.abs(bounds.bottom - bounds.viewport) < 2, `${name}: ${JSON.stringify(bounds)}`);
    for (const img of await page.locator('img').all()) {
      await img.evaluate(node => node.complete ? undefined : new Promise(resolve => { node.onload = node.onerror = resolve; }));
      assert.ok(await img.evaluate(node => node.complete && node.naturalWidth > 0), `${name}: broken image`);
    }
    checks++;
  };
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${base}#/app`);
    await page.reload();
    await page.locator('[data-model=bw05s]').waitFor();
    await inspect(`devices-${viewport.width}`);
    const home = page.locator('.device-home');
    assert.equal(await home.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(252, 249, 247)');
    assert.equal(await home.locator('[data-model=bw05s]').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(232, 243, 255)');
    assert.equal(await home.locator('.home-tab-icon').count(), 4);
    assert.equal(await home.locator('.home-tab[aria-current=page]').innerText(), 'Device');
    assert.ok((await home.locator('[data-model=bw05s] .device-image img').getAttribute('src')).includes('device-bw05s'));
    await home.locator('.home-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.ok(await home.evaluate(node => {
      const card = node.querySelector('[data-model=bw05a]').getBoundingClientRect();
      const tabs = node.querySelector('.home-tabs').getBoundingClientRect();
      return card.bottom <= tabs.top && tabs.bottom <= node.getBoundingClientRect().bottom;
    }), `devices-${viewport.width}: tab bar obscures device card`);
    await page.screenshot({ path: `tests/artifacts/app/devices-${viewport.width}.png` });
    await page.locator('[data-model=bw05s]').click();
    await page.locator('.bw-mode-card').first().waitFor();
    assert.equal(await page.locator('.bw-dock').count(), 0, 'Selection has no start dock');
    await inspect(`home-${viewport.width}`);
    await page.screenshot({ path: `tests/artifacts/app/home-${viewport.width}.png` });
    await page.locator('[data-mode="food-bowl"] .bw-mode-open').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('slider').count(), 0, 'Do not import the local slider interaction');
    await page.waitForTimeout(250);
    await inspect(`sheet-${viewport.width}`);
    assert.ok(await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1;
    }), `sheet-${viewport.width}: clipped dialog`);
    await page.screenshot({ path: `tests/artifacts/app/sheet-${viewport.width}.png` });
    await dialog.getByRole('button', { name: '1套以上', exact: true }).click();
    await dialog.getByRole('button', { name: '开始清洗', exact: true }).click();
    await page.waitForURL(/run-control/);
    await page.locator('.bw-progress').waitFor();
    await inspect(`running-${viewport.width}`);
    await page.reload();
    await page.locator('.bw-progress').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_app_v1:machine')).modeConfig.babyDishCount), '1+');
    await page.screenshot({ path: `tests/artifacts/app/running-${viewport.width}.png` });
    await page.getByRole('button', { name: '设备设置', exact: true }).click();
    await page.getByText('设备功能', { exact: true }).waitFor();
    await inspect(`settings-${viewport.width}`);
    await page.goBack();
    await page.locator('.bw-progress').waitFor();
    // Preserve only the isolated demo fixture between viewports.
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('BW05S_app_v1:')) localStorage.removeItem(key); });
    await page.reload();
    await page.locator('[data-app-screen]').waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}#/app/cleaning-machine/home`);
  await page.getByRole('button', { name: '设备设置', exact: true }).click();
  await page.getByRole('button', { name: /其他设置/ }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: /Dark Mode/ }).click();
  await page.reload();
  await page.getByText('Other Settings', { exact: true }).waitFor();
  assert.equal(await page.locator('.mobile-app.app-dark').count(), 1);
  await inspect('dark-settings');
  await page.getByRole('button', { name: /中文/ }).click();
  await page.getByRole('button', { name: /暗黑模式/ }).click();
  await page.goto(`${base}#/app/cleaning-machine/settings`);
  await page.getByRole('button', { name: /宝宝用品管理/ }).click();
  await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).click();
  await page.locator('input[type=text]').first().fill('Phone item');
  await page.locator('input[type=text]').nth(1).fill('2026-11-17');
  await page.locator('input[type=text]').first().focus();
  await page.setViewportSize({ width: 390, height: 450 });
  await inspect('keyboard-height');
  const save = page.getByRole('button', { name: '保存物品', exact: true });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await page.getByText('Phone item', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => localStorage.getItem('BW05S_app_v1:items')?.includes('Phone item')));
  assert.equal(await page.evaluate(() => localStorage.getItem('BW05S_demo_v1:items')), null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tests/artifacts/app/items.png' });
  await page.getByText('Phone item', { exact: true }).click();
  await page.goBack();
  await page.getByText('Phone item', { exact: true }).waitFor();
  await page.goto(`${base}#/app/cleaning-machine/home`);
  await page.screenshot({ path: 'tests/artifacts/app/home.png' });
  assert.deepEqual(errors, []);

  if (process.env.PWA_TEST === '1') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
    assert.equal(await page.title(), '清洗机系列');
    assert.equal(manifest.name, '清洗机系列');
    assert.equal(manifest.short_name, '清洗机系列');
    assert.equal(manifest.start_url, './#/app');
    assert.equal(manifest.display, 'standalone');
    await context.setOffline(true);
    await page.reload();
    await page.locator('.bw-mode-card').first().waitFor();
    await inspect('offline');
    await page.goto(`${base}#/app`);
    await page.locator('[data-model=bw05s]').waitFor();
    await inspect('offline-devices');
    await context.setOffline(false);
  }
  await page.goto(base);
  await page.locator('[data-app-screen]').waitFor();
  assert.match(page.url(), /#\/app$/);
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.goto(`${base}#/demo`);
  await page.locator('.global-panel').waitFor();
  await page.goto(`${base}#/app`);
  await page.locator('[data-app-screen]').waitFor();
  assert.equal(await page.locator('.workspace-header').count(), 0);
  const pc = await context.newPage();
  await pc.setViewportSize({ width: 1512, height: 1100 });
  await pc.goto(base);
  await pc.locator('.global-panel').waitFor();
  assert.match(pc.url(), /#\/demo$/);
  await pc.goto(`${base}#/cleaning-machine`);
  await pc.locator('.bw-mode-card').first().waitFor();
  await pc.goto(`${base}#/demo`);
  await pc.locator('.global-panel').waitFor();
  await pc.getByRole('button', { name: '手机体验二维码' }).click();
  await pc.getByRole('dialog', { name: '手机体验', exact: true }).waitFor();
  await pc.screenshot({ path: 'tests/artifacts/app/pc-qr.png' });
  await pc.getByRole('button', { name: '关闭手机体验' }).click();
  await pc.screenshot({ path: 'tests/artifacts/app/desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`PASS: ${checks} app layout checks, 5 viewports, quantity/start/settings/back, isolated storage, preferences, keyboard-height and ${process.env.PWA_TEST === '1' ? 'offline PWA' : 'PC entry'}.`);
} finally { await browser.close(); }
