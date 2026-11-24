import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/standalone', { recursive: true });
try {
  for (const reserved of [false, true]) {
    const height = reserved ? 850 : 912;
    const context = await browser.newContext({ viewport: { width: 420, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.addInitScript(({ reserved }) => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      Object.defineProperty(screen, 'width', { get: () => innerWidth });
      Object.defineProperty(screen, 'height', { get: () => reserved ? innerHeight + 62 : innerHeight });
      window.__testViewport = { height: reserved ? innerHeight : innerHeight - 96, top: reserved ? 0 : 62 };
      Object.defineProperty(visualViewport, 'height', { get: () => window.__testViewport.height });
      Object.defineProperty(visualViewport, 'offsetTop', { get: () => window.__testViewport.top });
      const key = 'BW05S_app_v1:models:bw05p:machine-maintenance';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ completedWorkCount: 10, dismissedCleaningReminderAt: 0 }));
    }, { reserved });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}#/app/cleaning-machine/models/bw05p/home`);
    await page.locator('[data-mode=auto]').waitFor();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--app-native-safe-top', '62px');
      document.documentElement.style.setProperty('--app-native-safe-bottom', '34px');
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(reserved => document.documentElement.dataset.appDisplay === 'standalone' && document.documentElement.style.getPropertyValue('--app-reserved-top') === `${reserved ? 62 : 0}px`, reserved);
    const screen = page.locator('[data-app-screen]');
    const bounds = await screen.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const header = node.querySelector('.bw-header').getBoundingClientRect();
      const back = node.querySelector('.bw-header button').getBoundingClientRect();
      const body = node.querySelector('.app-page-body').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, headerTop: header.top, backTop: back.top, bodyTop: body.top, bodyBottom: body.bottom,
        width: innerWidth, rootNative: getComputedStyle(document.documentElement).getPropertyValue('--app-native-safe-top'), safeTop: getComputedStyle(node.closest('.mobile-app')).getPropertyValue('--app-safe-top'), reservedTop: getComputedStyle(document.documentElement).getPropertyValue('--app-reserved-top'), probeHeight: document.querySelector('.app-safe-area-probe').getBoundingClientRect().height, headerPadding: getComputedStyle(node.querySelector('.bw-header')).paddingTop,
        rootBackground: getComputedStyle(document.documentElement).backgroundImage, screenBackground: getComputedStyle(node).backgroundImage,
        bodyScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight };
    });
    assert.equal(bounds.top, 0); assert.equal(bounds.bottom, height, 'standalone background must reach the layout bottom despite short VisualViewport');
    assert.equal(bounds.headerTop, 0); assert.equal(bounds.bodyTop, 0); assert.equal(bounds.bodyBottom, height);
    assert.ok(bounds.backTop >= (reserved ? 0 : 62) && bounds.backTop < (reserved ? 16 : 78), `native status bar is accounted for exactly once: ${JSON.stringify({ reserved, ...bounds })}`);
    assert.equal(bounds.rootBackground, bounds.screenBackground, 'outer shell uses the screen background rather than a separate color band');
    assert.equal(bounds.bodyScroll, false);
    await page.screenshot({ path: `tests/artifacts/standalone/${reserved ? 'reserved-status-bar' : 'full-screen'}-home.png` });
    await page.locator('.bw-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.ok(await page.locator('.bw-scroll').evaluate(node => node.lastElementChild.getBoundingClientRect().bottom <= node.getBoundingClientRect().bottom - 34), 'last mode row is reachable above the home-indicator area');
    await page.locator('[data-mode=auto] .bw-mode-open').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor(); await page.waitForTimeout(350);
    assert.ok(await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const button = node.querySelector('.bw-sheet-footer button').getBoundingClientRect();
      return rect.bottom === innerHeight && button.bottom <= innerHeight - 34;
    }), 'sheet background fills the bottom and its buttons stay above the gesture area');
    await page.screenshot({ path: `tests/artifacts/standalone/${reserved ? 'reserved-status-bar' : 'full-screen'}-sheet.png` });
    await dialog.getByRole('button', { name: '收起浮窗', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    if (!reserved) {
      await page.locator('[data-mode=custom] .bw-mode-open').click();
      const input = dialog.locator('.bw-mode-name');
      await input.fill('测试模式');
      await page.evaluate(() => {
        window.__testViewport = { height: 450, top: 0 };
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('.mobile-app').getBoundingClientRect().height === 450);
      await input.press('Enter');
      await page.evaluate(() => {
        window.__testViewport = { height: 450, top: 62 };
        visualViewport.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => document.querySelector('.mobile-app').getBoundingClientRect().height === innerHeight && document.querySelector('.mobile-app').getBoundingClientRect().top === 0);
      await dialog.getByRole('button', { name: '收起浮窗', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.evaluate(() => { window.__testViewport = { height: innerHeight - 96, top: 62 }; });
      await page.setViewportSize({ width: 912, height: 420 });
      await page.waitForFunction(() => document.querySelector('.mobile-app').getBoundingClientRect().height === 420);
      assert.equal(await page.locator('.mobile-app').evaluate(node => node.getBoundingClientRect().top), 0);
    }
    assert.deepEqual(errors, []); await context.close();
  }
  console.log('PASS: installed-mode short/offset viewport, already-reserved status bar, edge-to-edge mode page, reachable last card, bottom sheet safe controls, keyboard restore and rotation (simulated iOS geometry).');
} finally { await browser.close(); }
