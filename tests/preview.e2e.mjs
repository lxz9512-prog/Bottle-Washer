import { openGlobalTools, openPageExceptions, setWorkspacePanel } from './workspace-controls.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/preview', { recursive: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const switchTo = async mode => {
    const old = await page.evaluate(() => window.__previewTestMarker = crypto.randomUUID());
    await page.getByRole('group', { name: '预览版本', exact: true }).getByRole('button', { name: mode === 'app' ? '移动版' : 'PC 版', exact: true }).click();
    await page.waitForFunction(({ mode, old }) => document.documentElement.dataset.experience === mode && window.__previewTestMarker !== old, { mode, old });
    await page.locator(mode === 'app' ? '[data-app-screen]' : '[data-device-frame]').waitFor();
  };
  for (const width of [768, 769, 900]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    await page.locator('.device-card').first().waitFor();
    assert.equal(new URL(page.url()).hash, width <= 768 ? '#/app' : '#/demo');
    await page.setViewportSize({ width: width <= 768 ? 1100 : 600, height: 844 });
    assert.equal(new URL(page.url()).hash, width <= 768 ? '#/app' : '#/demo', 'resize keeps experience');
  }
  for (const width of [320, 390, 900, 1023, 1024, 1512]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}#/app/cleaning-machine/models/bw05a/home`);
    await page.locator('[data-mode=auto]').waitFor();
    const wide = width >= 1024;
    const bounds = await page.locator('[data-app-screen]').boundingBox();
    assert.equal(bounds.width, wide ? 393 : width);
    assert.equal(bounds.height, wide ? 852 : 1100);
    assert.equal(await page.locator('.mobile-preview-header').isVisible(), wide);
    assert.equal(await page.locator('[data-device-frame], .device-status-bar, [data-home-indicator], .console-panel, .directory-panel, .info-panel').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (wide) assert.equal(bounds.x, (width - 393) / 2);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `tests/artifacts/preview/app-${width}.png` });
  }
  await page.setViewportSize({ width: 1512, height: 600 });
  await page.waitForFunction(() => document.querySelector('.mobile-preview').getBoundingClientRect().height === innerHeight);
  const stage = page.locator('.mobile-preview-stage');
  await stage.evaluate(node => { node.scrollTop = node.scrollHeight; });
  assert.equal((await page.locator('[data-app-screen]').boundingBox()).height, 852, 'short window does not shrink app');
  assert.ok(await stage.evaluate(node => {
    const app = node.querySelector('.mobile-app').getBoundingClientRect();
    return node.scrollHeight > node.clientHeight && app.bottom <= node.getBoundingClientRect().bottom;
  }), 'short window scroll reaches app bottom');
  await page.screenshot({ path: 'tests/artifacts/preview/app-short-scrolled.png' });
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.reload();
  for (const model of ['bw05s', 'bw05p', 'bw05a']) {
    for (const screen of ['home', 'settings', 'consumables', 'device-info', 'baby-items', 'other-settings', 'custom-mode', 'run-control']) {
      const route = `/cleaning-machine/models/${model}/${screen}`;
      await page.goto(`${base}#/demo${route}`);
      await page.locator('[data-device-frame]').waitFor();
      await switchTo('app');
      assert.equal(new URL(page.url()).hash, `#/app${route}`);
      assert.equal(await page.locator('.bw-consumable-card.water, .bw-summary-item.water, .bw-supply-bar.water').count() > 0, model !== 'bw05a' && ['home', 'custom-mode', 'run-control', 'consumables', 'settings'].includes(screen));
      await switchTo('demo');
      assert.equal(new URL(page.url()).hash, `#/demo${route}`);
    }
  }
  await page.goto(`${base}#/demo/cleaning-machine/models/bw05s/smart-mode`);
  await page.locator('[data-device-frame]').waitFor();
  await switchTo('app');
  assert.match(page.url(), /models\/bw05s\/smart-mode$/);
  await page.goto(`${base}#/demo/notifications`);
  await page.locator('[data-device-frame]').waitFor();
  await switchTo('app');
  assert.equal(new URL(page.url()).hash, '#/app');
  await page.locator('[data-model=bw05p]').click();
  await page.locator('[data-mode=auto] .bw-mode-open').click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '开始清洗', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  await switchTo('demo');
  await page.locator('[data-device-screen]').getByRole('button', { name: '设备设置', exact: true }).click();
  await page.locator('.bw-device-info').click();
  await page.getByRole('button', { name: /设备名称/ }).click();
  await page.getByRole('textbox').fill('PC 专用名称');
  await page.getByRole('button', { name: '保存设备名称', exact: true }).click();
  await page.getByRole('textbox').waitFor({ state: 'hidden' });
  await switchTo('app');
  assert.equal(await page.evaluate(() => localStorage.getItem('BW05S_app_v1:models:bw05p:device-name')), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_app_v1:models:bw05p:machine')).cycleActive), true);
  await page.goBack();
  await page.locator('[data-device-frame]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.experience), 'demo');
  await page.goto(`${base}#/cleaning-machine/models/bw05p/settings`);
  await page.locator('.bw-device-info').waitFor();
  await switchTo('app');
  assert.equal(new URL(page.url()).hash, '#/app/cleaning-machine/models/bw05p/settings');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}#/demo`);
  await page.locator('.workspace-header').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const header = await page.locator('.workspace-header').boundingBox();
  for (const button of await page.locator('.workspace-header button').all()) {
    assert.ok(await button.evaluate(node => { const a = node.getBoundingClientRect(); const b = node.closest('.workspace-header').getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom && a.right <= innerWidth; }));
  }
  assert.ok(header.height < 120);
  await page.screenshot({ path: 'tests/artifacts/preview/demo-mobile-header.png' });
  for (const size of [{ width: 375, height: 667 }, { width: 548, height: 914 }, { width: 900, height: 768 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-device-frame]').getBoundingClientRect();
      return frame.top >= 0 && frame.bottom <= innerHeight && frame.left >= 0 && frame.right <= innerWidth;
    });
  }
  for (const width of [1200, 1366, 1512, 1920]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}#/demo`);
    await page.reload();
    await page.locator('[data-device-frame]').waitFor();
    const frameBounds = () => page.locator('[data-device-frame]').evaluate(node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const initial = await frameBounds();
    assert.ok(Math.abs(initial.x + initial.width / 2 - width / 2) < 1);
    for (const [directory, info] of [[false, true], [false, false], [true, false], [true, true]]) {
      await setWorkspacePanel(page, '页面目录', directory);
      await setWorkspacePanel(page, '交互说明', info);
      assert.deepEqual(await frameBounds(), initial, 'sidebars keep the Demo position and scale');
    }
    await openGlobalTools(page);
    assert.deepEqual(await frameBounds(), initial);
    await openPageExceptions(page);
    assert.deepEqual(await frameBounds(), initial);
    assert.equal(await page.locator('.global-panel').count(), 0);
    assert.equal(await page.locator('.console-panel .tool-segments').count(), 0);
    assert.equal(await page.locator('.side-rail').first().evaluate(node => getComputedStyle(node).transitionDuration.includes('0.3s')), true);
    await page.reload();
    await page.locator('[data-device-frame]').waitFor();
    await page.screenshot({ path: `tests/artifacts/preview/demo-desktop-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: root breakpoints, resize stability, explicit entries, fixed/mobile layouts, short-window scrolling, model/page-preserving reload switches, legacy links, notifications fallback, separate stores/runtimes, browser back and header geometry.');
} finally { await browser.close(); }
