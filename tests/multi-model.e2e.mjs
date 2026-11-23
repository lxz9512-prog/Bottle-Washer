import { setWorkspacePanel } from './workspace-controls.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/models', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const key = (id, field = 'machine') => `BW05S_app_v1:${id === 'bw05s' ? field : `models:${id}:${field}`}`;
  const stored = id => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key(id));
  const go = async (id, screen = 'home', experience = 'app') => {
    await page.goto(`${base}#/${experience}/cleaning-machine/models/${id}/${screen}`);
    await page.locator('.bw-header').waitFor();
  };
  const back = () => page.getByRole('button', { name: '返回', exact: true }).click();
  const open = async id => {
    await page.locator(`[data-mode="${id}"] .bw-mode-open`).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(270);
  };
  const collapse = async () => {
    await page.getByRole('button', { name: '收起浮窗', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  };
  const checkLayout = async label => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: page overflow`);
    assert.ok(await page.locator('img').evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0)), `${label}: images loaded`);
    assert.ok(await page.locator('.bw-mode-card, .bw-consumable-card, .bw-summary-item, .device-meta').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)), `${label}: content overflow`);
  };
  await page.goto(`${base}#/app`);
  await page.locator('[data-model=bw05a]').waitFor();
  assert.deepEqual(await page.locator('.device-card').evaluateAll(nodes => nodes.map(node => node.dataset.model)), ['bw05s', 'bw05p', 'bw05a']);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.home-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await checkLayout(`list ${width}`);
    assert.ok(await page.locator('[data-model=bw05a]').evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.home-tabs').getBoundingClientRect().top), 'last device is reachable above tabs');
    await page.screenshot({ path: `tests/artifacts/models/devices-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['bw05s', 'bw05p', 'bw05a']) {
    await page.locator(`[data-model=${id}]`).click();
    await page.locator('[data-mode=auto]').waitFor();
    assert.match(await page.locator('.bw-header h1').innerText(), new RegExp(id.toUpperCase()));
    const modes = await page.locator('[data-mode]').evaluateAll(nodes => nodes.map(node => node.dataset.mode));
    assert.deepEqual(modes, id === 'bw05s' ? ['smart', 'auto', 'rapid', 'sterilize-dry', 'self-clean', 'baby', 'bottles', 'food-bowl', 'delicate-wash', 'custom'] : id === 'bw05p' ? ['auto', 'rapid', 'intensive', 'sterilize-dry', 'self-clean', 'custom'] : ['auto', 'rapid', 'sterilize-dry', 'self-clean', 'custom']);
    assert.equal(await page.locator('.bw-supply-bar.water').count(), id === 'bw05a' ? 0 : 1);
    assert.equal(await page.locator('.bw-supply-bar.hepa').count(), 1);
    await open('custom');
    await page.locator('.bw-mode-name').fill(`${id}专用`);
    await page.locator('.bw-mode-name').blur();
    await page.getByRole('dialog').getByRole('checkbox').first().click();
    await page.getByRole('textbox', { name: '清洗 时长', exact: true }).fill(id === 'bw05s' ? '25' : id === 'bw05p' ? '30' : '35');
    await page.getByRole('textbox', { name: '清洗 时长', exact: true }).blur();
    await collapse();
    await open('auto');
    assert.ok(await page.locator('.bw-preset-step').first().isDisabled());
    await collapse();
    await page.locator('.bw-supply-bars').click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('.bw-consumable-card').count(), id === 'bw05a' ? 1 : 2);
    assert.equal(await page.locator('.bw-consumable-card.water').count(), id === 'bw05a' ? 0 : 1);
    await page.locator('.bw-consumable-card.hepa').click();
    await page.getByRole('dialog').waitFor();
    await collapse();
    await back();
    await page.getByRole('button', { name: '设备设置', exact: true }).click();
    assert.equal(await page.locator('.bw-device-info > span').innerText(), id.toUpperCase());
    assert.equal(await page.locator('.bw-summary-item.water').count(), id === 'bw05a' ? 0 : 1);
    assert.equal(await page.locator('.bw-summary-count').innerText(), id === 'bw05a' ? '1 项耗材' : '2 项耗材');
    await page.locator('.bw-device-info').click();
    await page.getByRole('button', { name: /设备名称/ }).click();
    await page.locator('input').fill(`${id}设备`);
    await page.getByRole('button', { name: '保存设备名称', exact: true }).click();
    await page.locator('input').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key(id, 'device-name')), `${id}设备`);
    await back(); await back(); await back();
    await page.locator('[data-model=bw05a]').waitFor();
  }
  for (const id of ['bw05s', 'bw05p', 'bw05a']) {
    await go(id);
    await page.reload();
    await page.locator('[data-mode=custom]').waitFor();
    assert.equal(await page.locator('[data-mode=custom] .bw-card-name').innerText(), `${id}专用`);
    await open('custom');
    assert.equal(await page.getByRole('textbox', { name: '清洗 时长', exact: true }).inputValue(), id === 'bw05s' ? '25' : id === 'bw05p' ? '30' : '35');
    await collapse();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await checkLayout(`${id} ${width}`);
      await page.screenshot({ path: `tests/artifacts/models/${id}-home-${width}.png` });
    }
  }
  await go('bw05p');
  await open('auto');
  await page.getByRole('button', { name: '开始清洗', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  await back();
  await page.locator('[data-model=bw05a]').click();
  await page.locator('[data-mode=rapid]').waitFor();
  assert.equal((await stored('bw05a')).cycleActive, false);
  const before = (await stored('bw05p')).elapsedSeconds;
  await page.waitForTimeout(2200);
  assert.ok((await stored('bw05p')).elapsedSeconds > before, 'hidden running model keeps counting');
  await open('rapid');
  await page.getByRole('button', { name: '定时启动', exact: true }).click();
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await page.getByRole('button', { name: '确认预约', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  assert.ok((await stored('bw05a')).scheduleAt > Date.now());
  await back();
  assert.match(await page.locator('[data-model=bw05p] .device-status').innerText(), /93 min left/);
  assert.match(await page.locator('[data-model=bw05a] .device-status').innerText(), /Scheduled/);
  assert.match(await page.locator('[data-model=bw05s] .device-status').innerText(), /Not used/);
  await page.locator('[data-model=bw05p]').click();
  await page.locator('.bw-progress').waitFor();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).isRunning === false, key('bw05p'));
  assert.equal((await stored('bw05p')).isRunning, false);
  await back();
  assert.match(await page.locator('[data-model=bw05p] .device-status').innerText(), /Paused/);
  await page.locator('[data-model=bw05p]').click();
  await page.locator('.bw-progress').waitFor();
  await page.locator('.bw-supply-bars').click(); await back();
  await page.locator('.bw-progress').waitFor();
  assert.equal((await stored('bw05p')).isRunning, false);
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).isRunning === true, key('bw05p'));
  assert.equal((await stored('bw05p')).isRunning, true);
  await back();
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...state, scheduleAt: Date.now() + 1800 }));
  }, key('bw05a'));
  await page.reload();
  await page.locator('[data-model=bw05s]').click();
  await page.locator('[data-mode=smart]').waitFor();
  await page.waitForTimeout(3000);
  assert.equal((await stored('bw05a')).cycleActive, true, 'hidden model schedule starts');
  assert.equal((await stored('bw05a')).scheduleAt, null);
  for (const id of ['bw05p', 'bw05a']) {
    await go(id);
    await page.locator('.bw-progress').waitFor();
    await page.locator('.bw-dock .bw-icon').click();
    await page.getByRole('dialog').getByRole('button', { name: '停止', exact: true }).click();
    await page.locator('[data-mode=auto]').waitFor();
    assert.equal((await stored(id)).cycleActive, false);
    await open('rapid');
    await page.getByRole('button', { name: '定时启动', exact: true }).click();
    await page.getByRole('button', { name: '1h', exact: true }).click();
    await page.getByRole('button', { name: '确认预约', exact: true }).click();
    await page.getByRole('button', { name: '取消预约', exact: true }).click();
    await page.locator('[data-mode=auto]').waitFor();
    assert.equal((await stored(id)).scheduleAt, null);
    assert.equal((await stored(id)).cycleActive, false);
  }
  for (const id of ['bw05p', 'bw05a']) {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ selectedMode: 'smart', modeConfig: { modeId: 'smart' }, cycleActive: true, scheduleAt: Date.now() + 1000, activeScreen: 'smart-mode' })), key(id));
    await go(id, 'smart-mode');
    await page.reload();
    await page.locator('[data-mode=auto]').waitFor();
    assert.equal(await page.locator('[data-mode=smart]').count(), 0);
    assert.equal((await stored(id)).cycleActive, false);
    assert.equal((await stored(id)).scheduleAt, null);
  }
  await go('bw05a');
  await page.getByRole('button', { name: '设备设置', exact: true }).click();
  await page.screenshot({ path: 'tests/artifacts/models/bw05a-settings.png' });
  await page.locator('.bw-consumables-summary').click();
  await page.screenshot({ path: 'tests/artifacts/models/bw05a-consumables.png' });
  await page.goto(`${base}#/app/cleaning-machine/models/unknown/home`);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.bw-mode-card').count(), 0);
  await page.getByRole('link', { name: '返回设备列表' }).click();
  await page.locator('[data-model=bw05s]').click();
  await page.locator('[data-mode=smart]').waitFor();
  await page.setViewportSize({ width: 1512, height: 1100 });
  for (const id of ['bw05p', 'bw05a', 'bw05s']) {
    await go(id, 'home', 'demo');
    await setWorkspacePanel(page, '页面目录', true);
    await page.locator('.console-panel > header').scrollIntoViewIfNeeded();
    await page.locator('.directory-panel').waitFor();
    assert.equal(await page.locator('.directory-panel').getByRole('button', { name: '智能模式运行', exact: true }).count(), id === 'bw05s' ? 1 : 0);
    assert.equal(await page.getByLabel('设备设计状态').locator('option[value="filter-soon"]').count(), id === 'bw05a' ? 0 : 1);
    assert.equal(await page.locator('.console-toolbar select').count(), 1, 'no model selector in console');
    await page.getByRole('button', { name: '手机体验二维码' }).click();
    assert.match(await page.getByRole('dialog', { name: '手机体验', exact: true }).locator('a').getAttribute('href'), new RegExp(`/app/cleaning-machine/models/${id}/home`));
    await page.getByRole('button', { name: '关闭手机体验' }).click();
    await page.screenshot({ path: `tests/artifacts/models/${id}-desktop.png`, fullPage: true });
    await page.locator('.directory-panel').getByRole('button', { name: '耗材管理', exact: true }).click();
    await page.locator('.bw-consumable-card.hepa').waitFor();
    assert.equal(await page.locator('.bw-consumable-card.water').count(), id === 'bw05a' ? 0 : 1);
    await page.locator('.directory-panel').getByRole('button', { name: '模式选择', exact: true }).click();
    await page.getByLabel('设备设计状态').selectOption('error-df');
    await page.getByRole('dialog', { name: '故障提示', exact: true }).getByRole('button', { name: '好的', exact: true }).click();
    assert.equal(await page.getByLabel('设备设计状态').inputValue(), 'normal');
    await page.getByLabel('设备设计状态').selectOption('offline');
    assert.ok(await page.locator('[data-mode=auto] .bw-mode-open').isDisabled());
    await page.getByLabel('设备设计状态').selectOption('normal');
    assert.equal(await page.locator('[data-mode=auto] .bw-mode-open').isDisabled(), false);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: three homepage entries, capability filtering, isolated names/custom drafts/cycles/schedules, hidden clocks, stop/cancel schedule, fault recovery, back continuity, direct links/refresh, forbidden cache guards, unknown model, mobile/desktop layouts and model-aware sharing.');
} finally { await browser.close(); }
