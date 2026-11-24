import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-11-19T08:00:00Z') });
  await page.goto(`${base}#/app`);
  await page.locator('[data-model=bw05s]').waitFor();
  const seed = async updates => {
    await page.evaluate(updates => {
      for (const [id, patch] of Object.entries(updates)) {
        const key = `BW05S_app_v1:${id === 'bw05s' ? 'machine' : `models:${id}:machine`}`;
        const state = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...state, selectedMode: 'auto', customConfig: null, cycleActive: true, scheduleAt: null, isRunning: true, elapsedSeconds: 0, runStartedAt: Date.now(), ...patch }));
      }
    }, updates);
    await page.reload();
    await page.locator('[data-model=bw05s]').waitFor();
  };
  const status = id => page.locator(`[data-model=${id}] .device-status`);
  await seed({ bw05s: {}, bw05p: { isRunning: false, runStartedAt: null }, bw05a: { cycleActive: false, scheduleAt: Date.parse('2026-11-19T09:00:00Z') } });
  assert.equal((await status('bw05s').innerText()).trim(), '93 min left');
  assert.equal(await status('bw05s').locator('.device-mode').count(), 0, 'running cards have no mode name');
  assert.doesNotMatch(await status('bw05s').innerText(), /In Progress/);
  assert.match(await status('bw05p').innerText(), /Paused/);
  assert.equal((await status('bw05a').innerText()).trim(), '预计完成 18:33', 'scheduled completion is start plus 93 minutes, without 72h storage');
  assert.equal(await status('bw05a').locator('.device-mode').count(), 0, 'scheduled cards have no mode name');
  await page.clock.runFor(61000);
  assert.match(await status('bw05s').innerText(), /92 min left/);
  await mkdir('tests/artifacts/device-status', { recursive: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator('.device-meta').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)));
    await page.screenshot({ path: `tests/artifacts/device-status/running-${width}.png` });
  }
  await seed({ bw05a: { cycleActive: false, scheduleAt: Date.parse('2026-11-19T15:50:00Z') } });
  assert.match(await status('bw05a').innerText(), /预计完成 .*01:23/);
  assert.doesNotMatch(await status('bw05a').innerText(), /Scheduled|Standard|标准洗/);
  const custom = [{ id: 'wash', label: 'Wash', enabled: true, duration: 19, min: 19, max: 45, step: 1, unit: 'min' }, { id: 'keep-warm', label: 'Storage', enabled: true, duration: 72, min: 10, max: 72, step: 1, unit: 'h' }];
  await seed({ bw05a: { cycleActive: false, selectedMode: 'custom', customConfig: custom, scheduleAt: Date.parse('2026-11-19T09:00:00Z') } });
  assert.equal((await status('bw05a').innerText()).trim(), '预计完成 17:19', 'uses actual custom steps and excludes storage');
  await seed({ bw05a: { cycleActive: false, selectedMode: 'self-clean', scheduleAt: Date.parse('2026-11-19T09:00:00Z') } });
  assert.equal((await status('bw05a').innerText()).trim(), '预计完成 17:30', 'machine clean includes its fixed 20+10 minutes');
  await seed({ bw05s: { elapsedSeconds: 93 * 60 + 60 } });
  assert.match(await status('bw05s').innerText(), /保管中/);
  assert.match(await status('bw05s').innerText(), /72 h left/);
  assert.doesNotMatch(await status('bw05s').innerText(), /标准洗/);
  await seed({ bw05s: { elapsedSeconds: (93 + 72 * 60 - 59) * 60 } });
  assert.match(await status('bw05s').innerText(), /保管中/);
  assert.match(await status('bw05s').innerText(), /59 min left/);
  assert.doesNotMatch(await status('bw05s').innerText(), /标准洗/);
  await seed({ bw05s: { elapsedSeconds: (93 + 72 * 60) * 60, isRunning: false, runStartedAt: null } });
  assert.match(await status('bw05s').innerText(), /Done/);
  assert.doesNotMatch(await status('bw05s').innerText(), /0 min/);

  const pc = await browser.newPage({ viewport: { width: 1512, height: 1100 }, timezoneId: 'Asia/Shanghai' });
  pc.on('pageerror', error => errors.push(error.message));
  await pc.clock.install({ time: new Date('2026-11-19T08:00:00Z') });
  await pc.goto(`${base}#/demo/cleaning-machine/models/bw05p/home`);
  const pcScreen = pc.locator('[data-device-screen]');
  await pcScreen.locator('[data-mode=auto] .bw-mode-open').click();
  await pc.clock.runFor(350);
  await pcScreen.getByRole('button', { name: '定时启动', exact: true }).click();
  await pcScreen.getByRole('button', { name: '1h', exact: true }).click();
  await pcScreen.getByRole('button', { name: '确认预约', exact: true }).click();
  await pc.clock.runFor(600);
  await pcScreen.locator('.bw-progress').waitFor();
  await pcScreen.getByRole('button', { name: '返回', exact: true }).click();
  const pcStatus = pc.locator('[data-model=bw05p] .device-status');
  await pcStatus.waitFor();
  assert.equal((await pcStatus.innerText()).trim(), '预计完成 18:33');
  assert.equal(await pcStatus.locator('.device-mode').count(), 0);
  await pc.screenshot({ path: 'tests/artifacts/device-status/pc-scheduled-completion.png' });
  await pc.getByRole('button', { name: 'EN', exact: true }).click();
  assert.equal((await pcStatus.innerText()).trim(), 'Finishes at 18:33');
  await pc.clock.fastForward(60 * 60 * 1000 + 2000);
  assert.equal((await pcStatus.innerText()).trim(), '93 min left', 'scheduled card becomes a remaining-time card when the device starts');
  await pc.clock.runFor(61000);
  assert.equal((await pcStatus.innerText()).trim(), '92 min left');
  assert.equal(await pcStatus.locator('.device-mode').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: running cards show only remaining time; scheduled completion uses configured work duration without storage, handles next-day and machine clean; storage/paused/done states fit 320/390px.');
} finally { await browser.close(); }
