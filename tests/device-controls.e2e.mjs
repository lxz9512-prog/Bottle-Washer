import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/device-controls', { recursive: true });
try {
  const app = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  app.on('pageerror', error => errors.push(error.message));
  await app.clock.install({ time: new Date('2026-11-24T08:00:00Z') });
  await app.goto(`${base}#/app`);
  await app.locator('[data-model=bw05s]').waitFor();
  const key = id => `BW05S_app_v1:${id === 'bw05s' ? '' : `models:${id}:`}machine`;
  const state = id => app.evaluate(key => JSON.parse(localStorage.getItem(key)), key(id));
  await app.evaluate(() => {
    for (const id of ['bw05s', 'bw05p', 'bw05a']) {
      const key = `BW05S_app_v1:${id === 'bw05s' ? '' : `models:${id}:`}machine`;
      const original = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...original, selectedMode: 'auto', customConfig: null, cycleActive: id !== 'bw05a', isRunning: id === 'bw05s', scheduleAt: id === 'bw05a' ? Date.now() + 3600000 : null, elapsedSeconds: 900, runStartedAt: id === 'bw05s' ? Date.now() : null }));
    }
  });
  await app.reload();
  const card = id => app.locator(`[data-model=${id}]`);
  const control = id => card(id).locator('[data-device-control]');
  await control('bw05s').waitFor();
  assert.equal(await app.locator('button button').count(), 0, 'navigation and quick control are separate native buttons');
  assert.equal(await control('bw05s').getAttribute('aria-label'), '暂停 BW05S');
  assert.equal(await control('bw05p').getAttribute('aria-label'), '启动 BW05P');
  assert.equal(await control('bw05a').count(), 0, 'scheduled devices keep their navigation arrow');
  assert.equal(await card('bw05a').locator('.lucide-chevron-right').count(), 1);
  const currentUrl = app.url();

  // Two rapid requests for different devices must not retarget the first command.
  await app.evaluate(() => {
    document.querySelector('[data-device-control=bw05s]').click();
    document.querySelector('[data-device-control=bw05p]').click();
  });
  assert.equal(await control('bw05s').getAttribute('aria-busy'), 'true');
  assert.equal(await control('bw05p').isDisabled(), true);
  await app.clock.runFor(1200);
  assert.equal(app.url(), currentUrl, 'quick controls never navigate');
  assert.equal((await state('bw05s')).isRunning, false);
  assert.equal((await state('bw05p')).isRunning, false, 'rapid second click cannot target another device');
  const paused = await state('bw05s');
  await app.clock.runFor(61000);
  assert.equal((await state('bw05s')).elapsedSeconds, paused.elapsedSeconds, 'paused timer stays frozen');
  assert.equal(await control('bw05s').getAttribute('aria-label'), '启动 BW05S');
  await control('bw05s').click(); await app.clock.runFor(1200);
  assert.equal((await state('bw05s')).isRunning, true);
  assert.ok((await state('bw05s')).elapsedSeconds >= paused.elapsedSeconds, 'resume preserves progress');
  await app.clock.runFor(61000);
  assert.ok((await state('bw05s')).elapsedSeconds >= paused.elapsedSeconds + 60);
  await control('bw05p').click(); await app.clock.runFor(1200);
  assert.equal((await state('bw05p')).isRunning, true);
  assert.equal((await state('bw05s')).isRunning, true);
  for (const width of [320, 390, 430]) {
    await app.setViewportSize({ width, height: 844 });
    assert.ok(await app.locator('[data-device-control]').evaluateAll(buttons => buttons.every(button => {
      const box = button.getBoundingClientRect(), card = button.closest('[data-model]').getBoundingClientRect();
      return box.width === 44 && box.height === 44 && box.right <= card.right && box.left >= card.left;
    })));
    await app.screenshot({ path: `tests/artifacts/device-controls/app-${width}.png` });
  }
  await card('bw05p').locator('.device-card-open').click();
  await app.locator('.bw-progress').waitFor();
  assert.equal(await app.getByRole('button', { name: '暂停或继续清洗', exact: true }).innerText(), '暂停', 'detail page shares the resumed state');
  await app.getByRole('button', { name: '返回', exact: true }).click();
  await control('bw05p').waitFor();

  // A finished cycle returns to an arrow, while storage remains controllable.
  await app.evaluate(() => {
    for (const [id, elapsedSeconds] of [['bw05s', 93 * 60], ['bw05p', 93 * 60 + 72 * 3600]]) {
      const key = `BW05S_app_v1:${id === 'bw05s' ? '' : `models:${id}:`}machine`;
      const state = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...state, elapsedSeconds, isRunning: id === 'bw05s', runStartedAt: null }));
    }
  });
  await app.reload(); await card('bw05s').waitFor();
  assert.match(await card('bw05s').innerText(), /保管中/);
  assert.equal(await control('bw05s').count(), 1);
  assert.equal(await control('bw05p').count(), 0);
  assert.equal(await card('bw05p').locator('.lucide-chevron-right').count(), 1);

  const pc = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  pc.on('pageerror', error => errors.push(error.message));
  await pc.clock.install({ time: new Date('2026-11-24T08:00:00Z') });
  await pc.goto(`${base}#/demo`);
  const pcScreen = pc.locator('[data-device-screen]');
  for (const id of ['bw05s', 'bw05p', 'bw05a']) {
    await pc.locator(`[data-model=${id}] .device-card-open`).click();
    await pcScreen.locator('[data-mode=auto] .bw-mode-open').click(); await pc.clock.runFor(350);
    await pcScreen.getByRole('button', { name: '开始清洗', exact: true }).click(); await pc.clock.runFor(1800);
    await pcScreen.locator('.bw-progress').waitFor();
    await pcScreen.getByRole('button', { name: '返回', exact: true }).click();
  }
  const pcControl = id => pc.locator(`[data-device-control=${id}]`);
  await pcControl('bw05p').click(); await pc.clock.runFor(1200);
  assert.equal(await pcControl('bw05p').getAttribute('aria-label'), '启动 BW05P');
  assert.equal(await pcControl('bw05a').getAttribute('aria-label'), '暂停 BW05A', 'controls target the card, not the last opened model');
  await pcControl('bw05p').click(); await pc.clock.runFor(1200);
  await pc.getByLabel('异常场景', { exact: true }).selectOption('running.failure');
  assert.equal(await pcControl('bw05p').getAttribute('aria-label'), '暂停 BW05P', 'failure preview does not change the running state');
  await pc.getByLabel('重试结果', { exact: true }).selectOption('failure');
  await pcControl('bw05p').click(); await pc.clock.runFor(1200);
  assert.equal(await pcControl('bw05p').getAttribute('aria-label'), '暂停 BW05P', 'failed command does not pause early');
  await pc.getByLabel('重试结果', { exact: true }).selectOption('success');
  await pc.locator('.device-control-feedback').getByRole('button', { name: '重试', exact: true }).click();
  await pc.clock.runFor(1200);
  assert.equal(await pcControl('bw05p').getAttribute('aria-label'), '启动 BW05P');
  assert.equal(await pcControl('bw05s').getAttribute('aria-label'), '暂停 BW05S');
  assert.equal(await pcControl('bw05a').getAttribute('aria-label'), '暂停 BW05A');
  await pc.screenshot({ path: 'tests/artifacts/device-controls/pc.png' });

  // Entering details cancels an unconfirmed list command instead of applying it later.
  await pcControl('bw05p').click();
  await pc.locator('[data-model=bw05p] .device-card-open').click();
  await pc.clock.runFor(1500); await pcScreen.locator('.bw-progress').waitFor();
  assert.equal(await pcScreen.getByRole('button', { name: '暂停或继续清洗', exact: true }).innerText(), '继续');
  assert.deepEqual(errors, []);
  console.log('PASS: PC/mobile per-device pause/resume, frozen/resumed progress, no navigation or double dispatch, scheduled/done arrows, storage controls, failure/retry and route cancellation, 320/390/430px layouts.');
} finally { await browser.close(); }
