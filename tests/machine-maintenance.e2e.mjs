import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const constants = ts.transpile(await readFile(new URL('../client/src/pages/DemoShowcasePage/demo-constants.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext });
const { DEFAULT_CUSTOM_MODES } = await import(`data:text/javascript;base64,${Buffer.from(constants).toString('base64')}`);
const washOnly = DEFAULT_CUSTOM_MODES.map(step => ({ ...step, enabled: step.id === 'wash' }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/maintenance', { recursive: true });
try {
  for (const experience of ['app', 'demo']) for (const model of ['bw05p', 'bw05s', 'bw05a']) {
    const context = await browser.newContext({ viewport: experience === 'app' ? { width: 390, height: 844 } : { width: 1512, height: 1100 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const prefix = `BW05S_${experience}_v1:` + (model === 'bw05s' ? '' : `models:${model}:`);
    await context.addInitScript(({ prefix, washOnly }) => {
      if (!localStorage.getItem(prefix + 'machine-maintenance')) localStorage.setItem(prefix + 'machine-maintenance', JSON.stringify({ completedWorkCount: 9, dismissedCleaningReminderAt: 0 }));
      if (!localStorage.getItem(prefix + 'mode-preferences')) localStorage.setItem(prefix + 'mode-preferences', JSON.stringify({ names: {}, customIds: ['custom'], steps: { auto: washOnly } }));
    }, { prefix, washOnly });
    await page.clock.install({ time: new Date('2026-11-24T04:00:00Z') });
    const homeUrl = `${base}#/${experience}/cleaning-machine/models/${model}/home`;
    await page.goto(homeUrl);
    const screen = page.locator('[data-device-screen]');
    const banner = screen.locator('[data-cleaning-reminder]');
    const saved = () => page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + 'machine-maintenance')), prefix);
    const open = async mode => {
      await screen.locator(`[data-mode="${mode}"] .bw-mode-open`).click();
      await page.clock.runFor(350);
      await screen.getByRole('dialog').waitFor();
    };
    const start = async () => {
      await screen.getByRole('dialog').getByRole('button', { name: '开始清洗', exact: true }).click();
      await page.clock.runFor(1800);
      await screen.locator('.bw-progress').waitFor();
    };
    const finishWork = async () => {
      await open('auto'); await start();
      assert.equal(await banner.count(), 0, 'no reminder during running');
      const before = (await saved()).completedWorkCount;
      await page.clock.fastForward(29 * 60 * 1000);
      await screen.getByRole('button', { name: '暂停或继续清洗', exact: true }).getByText('完成', { exact: true }).waitFor();
      assert.equal((await saved()).completedWorkCount, before + 1);
      await page.clock.runFor(2100);
      assert.equal((await saved()).completedWorkCount, before + 1, 'repeated completion ticks never duplicate uses');
      assert.equal(await banner.count(), 0, 'completion screen does not show the home reminder');
      await screen.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
      await screen.locator('[data-mode=auto]').waitFor();
    };
    const seedIdle = async (count, dismissed) => {
      await page.evaluate(({ prefix, count, dismissed }) => {
        localStorage.setItem(prefix + 'machine-maintenance', JSON.stringify({ completedWorkCount: count, dismissedCleaningReminderAt: dismissed }));
        const machine = JSON.parse(localStorage.getItem(prefix + 'machine') ?? '{}');
        localStorage.setItem(prefix + 'machine', JSON.stringify({ ...machine, cycleActive: false, selectedMode: null, customConfig: null, modeConfig: null, isRunning: false, scheduleAt: null, elapsedSeconds: 0, runStartedAt: null, activeScreen: 'home', cycleUsageRecorded: false }));
      }, { prefix, count, dismissed });
      await page.goto(homeUrl); await page.reload();
      await screen.locator('[data-mode=auto]').waitFor();
    };

    await screen.locator('[data-mode=auto]').waitFor();
    assert.equal(await banner.count(), 0, 'nine completed uses do not trigger a reminder');
    await finishWork();
    await banner.waitFor();
    assert.equal(await banner.locator('p').innerText(), '已使用10次，建议使用机器清洁模式对设备进行一次清洁');
    const geometry = await banner.evaluate(node => {
      const header = node.parentElement.querySelector('.bw-header').getBoundingClientRect();
      const hero = node.parentElement.querySelector('.bw-product').getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return { headerBottom: header.bottom, top: box.top, bottom: box.bottom, heroTop: hero.top, radius: parseFloat(getComputedStyle(node).borderRadius), overflow: node.scrollWidth > node.clientWidth };
    });
    assert.ok(geometry.top >= geometry.headerBottom && geometry.bottom <= geometry.heroTop, 'notice is below back button and above device image');
    assert.ok(geometry.radius >= 24 && !geometry.overflow);
    await page.screenshot({ path: `tests/artifacts/maintenance/${experience}-${model}-10.png` });

    if (model === 'bw05p' && experience === 'app') {
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await banner.evaluate(node => node.scrollWidth <= node.clientWidth && [...node.children].every(child => child.getBoundingClientRect().right <= node.getBoundingClientRect().right)));
        await page.screenshot({ path: `tests/artifacts/maintenance/mobile-${width}.png` });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await banner.getByRole('button', { name: '关闭机器清洁提醒', exact: true }).click();
    await page.reload(); await screen.locator('[data-mode=auto]').waitFor();
    assert.equal(await banner.count(), 0, 'dismissal persists on refresh');
    await finishWork();
    assert.equal((await saved()).completedWorkCount, 11);
    assert.equal(await banner.count(), 0, 'dismissed tenth-use reminder stays hidden on eleventh completion');

    for (const threshold of model === 'bw05p' ? [20, 30, 40, 50, 60, 100] : [20]) {
      await seedIdle(threshold - 1, threshold - 10);
      assert.equal(await banner.count(), 0);
      await finishWork(); await banner.waitFor();
      assert.equal(await banner.locator('p').innerText(), `已使用${threshold}次，建议使用机器清洁模式对设备进行一次清洁`);
      await banner.getByRole('button', { name: '关闭机器清洁提醒', exact: true }).click();
      assert.equal((await saved()).dismissedCleaningReminderAt, threshold);
    }

    // Merely opening the mode must keep the count; successful start resets immediately.
    const countBeforeClean = (await saved()).completedWorkCount;
    await open('self-clean');
    assert.equal((await saved()).completedWorkCount, countBeforeClean);
    await start();
    assert.deepEqual(await saved(), { completedWorkCount: 0, dismissedCleaningReminderAt: 0 });
    await screen.getByRole('button', { name: '停止', exact: true }).click();
    await screen.getByRole('dialog', { name: '停止', exact: true }).getByRole('button', { name: '停止', exact: true }).click();
    await screen.locator('[data-mode=auto]').waitFor();
    assert.equal((await saved()).completedWorkCount, 0, 'cancelling machine clean keeps the reset');
    await page.reload(); await screen.locator('[data-mode=auto]').waitFor();
    assert.equal(await banner.count(), 0);
    await seedIdle(9, 0); await finishWork(); await banner.waitFor();
    assert.match(await banner.innerText(), /已使用10次/);

    // Other model counters remain independent in the same browser.
    const otherPrefix = `BW05S_${experience}_v1:` + (model === 'bw05s' ? 'models:bw05a:' : '');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).completedWorkCount, otherPrefix + 'machine-maintenance'), 0);
    if (model === 'bw05p') {
      await page.evaluate(experience => localStorage.setItem(`BW05S_${experience}_v1:preferences`, JSON.stringify({ locale: 'en', darkMode: false })), experience);
      await page.reload(); await banner.waitFor();
      assert.match(await banner.innerText(), /Used 10 times/);
      assert.ok(await banner.evaluate(node => node.scrollWidth <= node.clientWidth));
      await page.screenshot({ path: `tests/artifacts/maintenance/${experience}-english.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS: ${experience}/${model} completion, next entry, dismissal, refresh, next milestones, immediate self-clean reset/cancel, model isolation.`);
  }
} finally { await browser.close(); }
