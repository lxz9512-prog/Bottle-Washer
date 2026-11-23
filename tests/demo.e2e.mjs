import { openGlobalTools, openPageExceptions, setWorkspacePanel } from './workspace-controls.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.DEMO_URL ?? 'http://127.0.0.1:5173/#/demo';
await mkdir('tests/artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('.global-panel').waitFor();
  assert.equal(await page.locator('.side-rail[data-open=true]').count(), 2);
  await openGlobalTools(page);
  await page.getByRole('heading', { name: '全局控制台' }).waitFor();
  await page.locator('[data-device-frame]').waitFor();
  assert.equal(await page.locator('.phone-stage [aria-label="演示工具"]').count(), 0);
  assert.equal(await page.locator('.global-panel .tool-segments button').count(), 2);
  assert.equal(await page.getByRole('button', { name: '切换深色模式', exact: true }).count(), 0);
  assert.equal(await page.locator('.global-panel .preview-controls').count(), 1);
  assert.equal(await page.locator('.workspace-header').count(), 0);
  await page.getByRole('switch', { name: '显示手机边框' }).uncheck();
  assert.equal(await page.locator('[data-device-chrome]:visible').count(), 0);
  await page.reload();
  await page.locator('[data-device-screen]').waitFor();
  assert.equal(await page.locator('.global-panel').count(), 1);
  await openGlobalTools(page);
  assert.equal(await page.getByRole('switch', { name: '显示手机边框' }).isChecked(), false);
  await page.getByRole('switch', { name: '显示手机边框' }).check();
  assert.equal(await page.locator('[data-device-chrome]:visible').count(), 5);
  const go = async title => {
    await setWorkspacePanel(page, '页面目录', true);
    await page.locator('.directory-panel').getByRole('button', { name: title, exact: true }).click();
    await page.waitForTimeout(100);
  };
  const checkFraming = async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const bounds = await page.evaluate(() => {
      const frame = document.querySelector('[data-device-frame]').getBoundingClientRect();
      return {
        width: innerWidth, height: innerHeight, scrollY,
        overflow: document.documentElement.scrollWidth > innerWidth,
        contentOverflow: [...document.querySelectorAll('.device-content')].some(node => node.scrollWidth > node.clientWidth + 1),
        frame: { x: frame.x, y: frame.y, right: frame.right, bottom: frame.bottom },
      };
    });
    assert.equal(bounds.overflow, false, JSON.stringify(bounds));
    assert.equal(bounds.contentOverflow, false, JSON.stringify(bounds));
    assert.ok(bounds.frame.x >= 0 && bounds.frame.right <= bounds.width + 1, JSON.stringify(bounds));
    assert.ok(bounds.frame.y >= 0 && bounds.frame.bottom <= bounds.height + 1, JSON.stringify(bounds));
    assert.equal(bounds.scrollY, 0, JSON.stringify(bounds));
  };
  await openPageExceptions(page);
  await page.getByLabel('异常场景', { exact: true }).selectOption('global.offline');
  await page.locator('[data-operation-state]').getByText('模拟网络不可用，本次操作未提交。').waitFor();
  await page.getByLabel('异常场景', { exact: true }).selectOption('global.weak');
  await page.locator('[data-operation-state] progress').waitFor();
  await go('设备设置');
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('[data-operation-state]').count(), 0);
  await go('设备列表');
  await page.getByLabel('异常场景', { exact: true }).selectOption('global.weak');
  await page.locator('.console-panel').getByRole('button', { name: '恢复连接', exact: true }).click();
  await page.locator('[data-model=bw05s]').waitFor();

  await page.getByLabel('异常场景', { exact: true }).selectOption('devices.failure');
  await page.locator('[data-operation-state]').getByText('暂时无法获取设备列表').waitFor();
  await page.getByLabel('重试结果').selectOption('failure');
  await page.locator('.console-panel').getByRole('button', { name: '重试', exact: true }).click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator('[data-operation-state]').innerText(), /暂时无法获取/);
  await page.getByLabel('重试结果').selectOption('success');
  await page.locator('.console-panel').getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('[data-model=bw05s]').waitFor();
  await page.screenshot({ path: 'tests/artifacts/desktop.png', fullPage: true });
  await go('模式选择');
  await page.getByLabel('异常场景', { exact: true }).selectOption('cleaning.failure');
  await page.locator('[data-operation-state]').getByText('设备未确认启动，清洗尚未开始。').waitFor();
  await page.locator('.console-panel').getByRole('button', { name: '恢复正常', exact: true }).click();
  assert.equal(await page.locator('[data-operation-state]').count(), 0);
  await page.locator('[data-device-screen]').getByRole('button', { name: /Breast Pump|吸奶器/ }).first().click();
  await page.locator('[data-mode-overlay]').waitFor();
  const overlayBounds = await page.evaluate(() => {
    const screen = document.querySelector('[data-device-screen]').getBoundingClientRect();
    const overlay = document.querySelector('[data-mode-overlay]').getBoundingClientRect();
    return { contained: overlay.left >= screen.left - 1 && overlay.right <= screen.right + 1 && overlay.top >= screen.top - 1 && overlay.bottom <= screen.bottom + 1 };
  });
  assert.equal(overlayBounds.contained, true, 'mode sheet must stay inside phone');
  await checkFraming();
  await page.getByRole('button', { name: '收起浮窗', exact: true }).click();
  await page.locator('[data-mode-overlay]').waitFor({ state: 'hidden' });
  await page.waitForTimeout(350);
  await page.locator('[data-device-screen]').getByRole('button', { name: /Standard|标准/ }).first().click();
  await page.getByLabel('异常场景', { exact: true }).selectOption('cleaning.timeout');
  await page.getByRole('button', { name: '开始清洗', exact: true }).click();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).waitFor();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).getByText(/继续|Continue/).waitFor();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).getByText(/暂停|Pause/).waitFor();
  await page.screenshot({ path: 'tests/artifacts/running.png', fullPage: true });
  await page.getByLabel('异常场景', { exact: true }).selectOption('running.interrupted');
  await page.waitForTimeout(6000);
  assert.match(await page.locator('[data-operation-state]').innerText(), /连接已中断/);
  await go('设备信息');
  await page.locator('[data-device-screen]').getByRole('button', { name: /设备名称|Device Name/ }).click();
  await page.locator('[data-device-screen] input').fill('BW05S Test');
  await page.getByLabel('异常场景', { exact: true }).selectOption('settings.rename');
  assert.equal(await page.locator('[data-device-screen] input').inputValue(), 'BW05S Test');
  await page.locator('.console-panel').getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('[data-device-screen] input').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_demo_v1:device-name'))), 'BW05S Test');
  await page.locator('[data-device-screen]').getByRole('button', { name: /设备名称|Device Name/ }).click();
  await page.locator('[data-device-screen] input').fill('Cancelled Modal Save');
  await page.getByRole('button', { name: '保存设备名称', exact: true }).click();
  await page.locator('[data-device-screen] input').press('Escape');
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_demo_v1:device-name'))), 'BW05S Test');
  await page.locator('[data-device-screen]').getByRole('button', { name: /设备名称|Device Name/ }).click();
  await page.locator('[data-device-screen] input').fill('Must Not Save');
  await page.getByRole('button', { name: '保存设备名称', exact: true }).click();
  await go('设备设置');
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_demo_v1:device-name'))), 'BW05S Test');
  await go('宝宝物品');
  await page.locator('[data-device-screen] button').filter({ has: page.locator('svg.lucide-plus') }).click();
  await page.getByLabel('异常场景', { exact: true }).selectOption('items.save');
  const inputs = page.locator('[data-device-screen] input');
  await inputs.first().fill('Test Bottle');
  await inputs.nth(1).fill('2026-11-01');
  await page.getByRole('button', { name: '保存物品', exact: true }).click();
  await page.locator('[data-device-screen]').getByText('Test Bottle', { exact: true }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_demo_v1:items')));
  assert.equal(saved.filter(item => item.name === 'Test Bottle').length, 1);
  await page.evaluate(() => localStorage.setItem('unrelated-test', 'keep'));
  await page.locator('.console-panel').getByRole('button', { name: '重置当前环节', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('BW05S_demo_v1:items')), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_demo_v1:device-name'))), 'BW05S Test');
  await openGlobalTools(page);
  await page.getByRole('button', { name: '重置整个 Demo', exact: true }).click();
  await openPageExceptions(page);
  await page.locator('[data-model=bw05s]').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('BW05S_demo_v1:device-name')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-test')), 'keep');
  await page.getByLabel('异常场景', { exact: true }).selectOption('devices.loading');
  await openGlobalTools(page);
  await page.getByRole('button', { name: '重置整个 Demo', exact: true }).click();
  await openPageExceptions(page);
  await page.waitForTimeout(1200);
  await page.locator('[data-model=bw05s]').waitFor();
  assert.equal(await page.locator('.global-panel > header button, .console-panel > header button').count(), 0);
  assert.equal(await page.getByRole('button', { name: /打开全局控制台|打开异常控制台|隐藏控制台/ }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.console-panel').count(), 1);
  assert.equal(await page.locator('.global-panel').count(), 1);
  await page.setViewportSize({ width: 1200, height: 768 });
  await setWorkspacePanel(page, '页面目录', true);
  await setWorkspacePanel(page, '交互说明', true);
  await openPageExceptions(page);
  await checkFraming();
  for (const title of ['设备列表', '模式选择', '自定义模式', '智能模式运行', '运行控制', '设备设置', '设备信息', '宝宝物品', '其他设置', '系统通知']) {
    await go(title);
    await checkFraming();
  }
  await page.setViewportSize({ width: 1199, height: 768 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.side-rail[data-open=true]').count(), 0);
  await setWorkspacePanel(page, '页面目录', true);
  await setWorkspacePanel(page, '交互说明', true);
  await openPageExceptions(page);
  await page.keyboard.press('Escape');
  for (const size of [{ width: 375, height: 667 }, { width: 548, height: 914 }, { width: 900, height: 768 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    await checkFraming();
  }
  await go('设备列表');
  for (const width of [390, 375, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.locator('[data-device-frame]').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
    const rect = await page.locator('[data-device-frame]').boundingBox();
    assert.ok(rect.width > 300 && rect.x >= 0 && rect.x + rect.width <= width + 1, `phone framing at ${width}: ${JSON.stringify(rect)}`);
    await openPageExceptions(page);
    await page.getByLabel('异常场景', { exact: true }).selectOption('devices.empty');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `tests/artifacts/mobile-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile, immediate scenes, retry policies, forms, isolated resets, persistent stacked controls, framing, no runtime errors');
} finally { await browser.close(); }
