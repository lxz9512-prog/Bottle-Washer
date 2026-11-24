import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:5185/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tests/artifacts/modes', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    if (!localStorage.getItem('BW05S_app_v1:mode-preferences')) localStorage.setItem('BW05S_app_v1:mode-preferences', JSON.stringify({ names: { auto: '旧的标准洗改名' }, steps: {}, customIds: ['custom'] }));
  });
  await page.goto(`${base}#/app/cleaning-machine/home`);
  await page.locator('[data-mode=auto]').waitFor();
  assert.equal(await page.locator('.bw-header').evaluate(node => node.clientHeight), 60);
  assert.ok(await page.locator('.bw-header button').evaluateAll(nodes => nodes.every(node => node.clientWidth === 44 && node.clientHeight === 44 && node.querySelector('svg').getAttribute('width') === '24')));
  const dialog = page.getByRole('dialog');
  const open = async id => { await page.locator(`[data-mode="${id}"] .bw-mode-open`).click(); await dialog.waitFor(); await page.waitForTimeout(300); };
  const collapse = async () => {
    await page.getByRole('button', { name: '收起浮窗', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.bw-mode-card.selected').count(), 0);
    assert.equal(await page.locator('.bw-mode-open[aria-expanded=true]').count(), 0);
  };
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('BW05S_app_v1:machine')));
  assert.equal(await page.locator('.bw-child-lock').count(), 0);
  assert.equal(await page.locator('.bw-dock').count(), 0);
  assert.deepEqual(await page.locator('.bw-supply-track > span').evaluateAll(nodes => nodes.map(node => node.style.height)), ['60%', '60%']);
  assert.equal(await page.locator('.bw-product button').count(), 1, 'consumables share one hit target');
  assert.equal(await page.locator('[data-mode=auto] .bw-card-duration').innerText(), '93 分钟');
  assert.equal(await page.locator('[data-mode=smart] .bw-card-duration').innerText(), '自动调节');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.locator('.bw-product').evaluate(node => {
      const product = node.getBoundingClientRect();
      const image = node.querySelector('img').getBoundingClientRect();
      const supplies = node.querySelector('.bw-supply-bars').getBoundingClientRect();
      return { centered: Math.abs(image.x + image.width / 2 - product.x - product.width / 2),
        gap: supplies.left - image.right, right: product.right - supplies.right,
        bottom: product.bottom - supplies.bottom,
        tracks: [...node.querySelectorAll('.bw-supply-track')].map(track => track.getBoundingClientRect().width) };
    });
    assert.ok(geometry.centered < 1, `product image stays centered at ${width}`);
    assert.ok(geometry.gap >= 0, `product and supplies do not overlap at ${width}`);
    assert.equal(geometry.right, 0);
    assert.equal(geometry.bottom, 6);
    assert.deepEqual(geometry.tracks, [8, 8]);
    assert.ok(await page.locator('.bw-mode-card').evaluateAll(nodes => nodes.every(node => {
      const name = node.querySelector('.bw-card-name').getBoundingClientRect();
      const duration = node.querySelector('.bw-card-duration').getBoundingClientRect();
      return name.bottom <= duration.top;
    })), 'mode names and durations do not overlap');
    assert.ok(await page.locator('.bw-supply-bar').evaluateAll(nodes => nodes.every(node => {
      const number = node.querySelector('strong').getBoundingClientRect();
      const track = node.querySelector('.bw-supply-track').getBoundingClientRect();
      const icon = node.querySelector('svg').getBoundingClientRect();
      return number.bottom <= track.top && track.bottom <= icon.top;
    })), 'counts above bars and icons below');
    await page.screenshot({ path: `tests/artifacts/modes/home-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.bw-supply-bars').click();
  await page.waitForURL(/consumables/);
  assert.equal(await dialog.count(), 0);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.bw-mode-grid').first().waitFor();
  assert.equal(await page.locator('.bw-mode-card input').count(), 0, 'all card names are read-only');
  assert.equal(await page.locator('[data-mode=auto] .bw-card-name').innerText(), '标准洗', 'ignore old saved preset rename');
  await page.locator('[data-mode=auto] .bw-card-name').click();
  await dialog.waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-mode=auto] .bw-mode-open').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'mode button must not inherit demo toolbar selection styling');
  assert.equal(await dialog.locator('.bw-mode-name').count(), 0, 'preset sheet name is not editable');
  assert.equal(await dialog.getByRole('heading').first().innerText(), '标准洗');
  await dialog.getByRole('button', { name: '下一个模式', exact: true }).click();
  assert.equal(await dialog.getByRole('heading').first().innerText(), '快速洗');
  assert.equal(await dialog.locator('.bw-mode-switch-title').evaluate(node => getComputedStyle(node).animationDuration), '0.24s');
  await dialog.getByRole('button', { name: '上一个模式', exact: true }).click();
  assert.equal(await dialog.getByRole('heading').first().innerText(), '标准洗');
  assert.equal(await dialog.locator('.bw-mode-switch-title').evaluate(node => getComputedStyle(node).getPropertyValue('--mode-enter-x').trim()), '-10px');
  await page.waitForTimeout(280);
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 93 分钟');
  assert.equal(await dialog.locator('.bw-storage-section h3').count(), 0);
  assert.equal(await dialog.locator('.bw-storage-section > p').innerText(), '清洗结束后自动保管，不计入清洗时长');
  assert.equal(await dialog.locator('.bw-storage-section').getByRole('checkbox').count(), 1);
  assert.equal(await dialog.locator('.bw-preset-steps input').count(), 0);
  assert.equal(await dialog.locator('.bw-preset-step').count(), 3);
  assert.equal(await dialog.locator('.bw-preset-step').first().isDisabled(), true);
  assert.equal(await dialog.locator('.bw-preset-step').first().getAttribute('aria-checked'), 'true');
  assert.equal(await dialog.locator('.bw-required-label, .lucide-lock-keyhole').count(), 0, 'required wash has no extra label or lock icon');
  assert.ok(await dialog.locator('.bw-preset-step, .bw-custom-row').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderWidth === '0px')), 'step blocks have no borders');
  assert.notEqual(await dialog.locator('.bw-preset-step .bw-check').nth(0).evaluate(node => getComputedStyle(node).backgroundColor), await dialog.locator('.bw-preset-step .bw-check').nth(1).evaluate(node => getComputedStyle(node).backgroundColor), 'fixed selection is visually distinct from optional selection');
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(await dialog.locator('.bw-preset-step').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), 'steps fit narrow sheets');
  await page.screenshot({ path: 'tests/artifacts/modes/required-320.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator('.bw-preset-step').nth(1).click();
  assert.equal(await dialog.locator('.bw-preset-step').nth(1).getAttribute('aria-checked'), 'false');
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 84 分钟');
  await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).fill('12');
  await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).blur();
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 84 分钟');
  const drag = async distance => {
    const box = await page.locator('.bw-sheet-handle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + distance, { steps: 8 });
    const translation = await dialog.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42);
    assert.ok(Math.abs(translation - distance) < 3, `sheet should follow gesture: ${translation}`);
    await page.mouse.up();
  };
  await drag(35);
  await page.waitForTimeout(350);
  assert.ok(await dialog.isVisible(), 'short drag springs back');
  assert.equal(await dialog.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42), 0);
  await drag(110);
  await dialog.waitFor({ state: 'hidden' });
  await open('auto');
  await page.getByRole('button', { name: '收起面板', exact: true }).click({ position: { x: 10, y: 60 } });
  await dialog.waitFor({ state: 'hidden' });
  await open('self-clean');
  assert.equal(await dialog.locator('.bw-preset-step').count(), 2);
  assert.equal(await dialog.locator('.bw-preset-step:disabled').count(), 2);
  assert.deepEqual(await dialog.locator('.bw-preset-step strong').allTextContents(), ['20 分钟', '10 分钟']);
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 30 分钟');
  assert.equal(await dialog.locator('.bw-storage-section').count(), 0);
  await collapse();
  await open('sterilize-dry');
  assert.equal(await dialog.locator('.bw-preset-step').count(), 2);
  assert.equal(await dialog.locator('.bw-preset-step:disabled').count(), 0);
  assert.equal(await dialog.locator('.bw-required-label').count(), 0);
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 64 分钟');
  await collapse();

  for (const [id, label, wash] of [['custom', '奶瓶晚间洗', 30], ['custom-2', '玩具清洗', 35], ['custom-3', '周末清洗', 40]]) {
    if (id === 'custom') await open(id);
    else { await page.getByRole('button', { name: '添加自定义模式', exact: true }).click(); await dialog.waitFor(); }
    await dialog.locator('.bw-mode-name').click();
    assert.equal(await dialog.locator('.bw-mode-name-field').evaluate(node => getComputedStyle(node).borderBottomWidth), '0px', 'custom names have no underline, including during editing');
    assert.equal(await dialog.locator('.bw-mode-name').evaluate(node => node === document.activeElement), true, 'clicking the name directly focuses editing');
    await dialog.locator('.bw-mode-name').fill(label);
    assert.equal(await dialog.locator('.bw-mode-name-field > svg').count(), 0);
    assert.equal(await dialog.locator('.bw-mode-name').evaluate(node => getComputedStyle(node).textAlign), 'center');
    await dialog.locator('.bw-mode-name').evaluate(node => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    });
    assert.equal(await dialog.locator('.bw-mode-name').evaluate(node => node === document.activeElement), true, 'IME confirmation keeps name input focused');
    await dialog.locator('.bw-mode-name').press('Enter');
    assert.equal(await dialog.locator('.bw-mode-name').evaluate(node => node === document.activeElement), false);
    await dialog.locator('.bw-cycle-section').getByRole('checkbox').first().click();
    const input = dialog.getByRole('textbox', { name: '清洗 时长', exact: true });
    await input.fill(String(wash)); await input.blur();
    assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), `清洗周期时长 · ${wash} 分钟`);
    await collapse();
    assert.equal(await page.locator(`[data-mode="${id}"] .bw-card-name`).innerText(), label);
    assert.equal(await page.locator(`[data-mode="${id}"] input`).count(), 0);
  }
  assert.equal(await page.getByRole('button', { name: '添加自定义模式', exact: true }).count(), 0);
  await page.reload();
  for (const [id, label, wash] of [['custom', '奶瓶晚间洗', 30], ['custom-2', '玩具清洗', 35], ['custom-3', '周末清洗', 40]]) {
    await open(id);
    assert.equal(await dialog.locator('.bw-mode-name').inputValue(), label);
    assert.equal(await dialog.getByRole('textbox', { name: '清洗 时长', exact: true }).inputValue(), String(wash));
    await collapse();
  }
  await page.screenshot({ path: 'tests/artifacts/modes/customs.png' });
  await page.setViewportSize({ width: 320, height: 568 });
  await open('custom');
  for (const checkbox of await dialog.locator('.bw-cycle-section').getByRole('checkbox').all()) {
    if (await checkbox.getAttribute('aria-checked') === 'false') await checkbox.click();
  }
  assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
  assert.ok(await dialog.locator('.bw-custom-row').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)));
  const customName = dialog.locator('.bw-mode-name');
  await customName.fill('这是一个用来检查自定义模式名称输入框宽度的长名称');
  assert.equal(await customName.inputValue().then(value => value.length), 24);
  assert.ok(await dialog.locator('.bw-mode-name-field').evaluate(node => node.scrollWidth <= node.clientWidth));
  await customName.fill('   ');
  await customName.blur();
  assert.equal(await customName.inputValue(), '自定义清洗');
  await customName.fill('奶瓶晚间洗');
  await customName.blur();
  await page.screenshot({ path: 'tests/artifacts/modes/custom-small.png' });
  await collapse();
  await page.setViewportSize({ width: 390, height: 844 });
  await open('auto');
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(), '清洗周期时长 · 84 分钟');
  assert.equal(await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).inputValue(), '12');
  await page.screenshot({ path: 'tests/artifacts/modes/preset.png' });
  await page.evaluate(() => {
    window.launchTransition = new Promise(resolve => {
      const observer = new MutationObserver(() => {
        const overlay = document.querySelector('.bw-sheet-starting.bw-sheet-closing');
        if (!overlay) return;
        resolve({
          duration: getComputedStyle(overlay.querySelector('.bw-sheet')).transitionDuration,
          disabled: overlay.querySelector('[aria-label="开始清洗"]').disabled,
        });
        observer.disconnect();
      });
      observer.observe(document.querySelector('[data-mode-overlay]'), { attributes: true, attributeFilter: ['class'] });
    });
  });
  await dialog.getByRole('button', { name: '开始清洗', exact: true }).click();
  const launchTransition = await page.evaluate(() => window.launchTransition);
  assert.equal(launchTransition.duration, '0.28s', 'launch exit stays brief while retaining a visible transition');
  assert.equal(launchTransition.disabled, true, 'no duplicate launch during exit');
  await page.locator('.bw-progress').waitFor();
  assert.equal(await page.locator('.bw-progress').evaluate(node => getComputedStyle(node).animationDuration), '0.52s');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.bw-run-title').innerText(), '标准洗');
  assert.equal(await page.locator('.bw-progress .bw-run-title').count(), 1, 'mode title belongs inside the stage block');
  assert.equal(await page.locator('.bw-progress .bw-run-time').count(), 0, 'remaining time stays outside the stage block');
  assert.equal(await page.locator('.bw-progress-heading').evaluate(node => getComputedStyle(node).borderBottomWidth), '0px', 'mode heading has no divider');
  assert.ok(await page.locator('.bw-run-time').evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.bw-progress').getBoundingClientRect().top), 'remaining time stays above the stage block');
  assert.match(await page.locator('.bw-progress-row.active > span:last-child').innerText(), /^\d+min$/, 'active stage displays minutes without seconds');
  await page.screenshot({ path: 'tests/artifacts/modes/running-minutes.png' });
  let machine = await stored();
  assert.equal(machine.customConfig[0].enabled, true);
  assert.equal(machine.customConfig[1].enabled, false);
  assert.equal(machine.customConfig[3].duration, 12);
  assert.ok(machine.lastUsedAt > 0);
  const before = machine.elapsedSeconds;
  await page.locator('.bw-supply-bars').click();
  await page.waitForURL(/consumables/);
  assert.equal(await dialog.count(), 0, 'entering supplies does not auto-open detail');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.deepEqual(await page.locator('.bw-consumable-card > .bw-life-track > span').evaluateAll(nodes => nodes.map(node => node.style.width)), ['60%', '60%']);
    assert.ok(await page.locator('.bw-consumable-card').evaluateAll(nodes => nodes.every(node => {
      const heading = node.querySelector('.bw-consumable-heading').getBoundingClientRect();
      const icon = node.querySelector('.bw-consumable-icon').getBoundingClientRect();
      const info = node.querySelector('.bw-consumable-info').getBoundingClientRect();
      const track = node.querySelector('.bw-life-track').getBoundingClientRect();
      return node.scrollWidth <= node.clientWidth && icon.right <= info.left && Math.abs(icon.y + icon.height / 2 - info.y - info.height / 2) < 1 && heading.bottom <= track.top;
    })), `consumable card content fits at ${width}`);
    await page.screenshot({ path: `tests/artifacts/modes/consumables-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tests/artifacts/modes/consumables.png' });
  await page.waitForTimeout(1200);
  assert.ok((await stored()).elapsedSeconds > before);
  await page.locator('.bw-consumable-card.hepa').click();
  await dialog.waitFor();
  await collapse();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  assert.equal((await stored()).isRunning, true);
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('BW05S_app_v1:machine')).isRunning);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await dialog.getByRole('heading').innerText(), '标准洗');
  assert.equal(await dialog.getByRole('checkbox').first().isDisabled(), true);
  assert.equal(await dialog.getByRole('textbox').count(), 1, 'preset only storage duration is editable');
  assert.equal(await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).count(), 1);
  await dialog.getByRole('checkbox').nth(1).click();
  await dialog.getByRole('checkbox').nth(2).click();
  await dialog.getByRole('checkbox').nth(2).click();
  await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).fill('24');
  await dialog.getByRole('textbox', { name: '保管 时长', exact: true }).blur();
  await page.screenshot({ path: 'tests/artifacts/modes/preset-paused-edit.png' });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  machine = await stored();
  assert.deepEqual(machine.customConfig.map(step => step.enabled), [true, true, true, true]);
  assert.deepEqual(machine.customConfig.map(step => step.duration), [29, 9, 55, 24]);
  assert.equal(machine.isRunning, false, 'saving edits stays paused');
  await page.reload();
  await page.locator('.bw-progress').waitFor();
  assert.equal((await stored()).customConfig[3].duration, 24);
  await page.evaluate(() => {
    const key = 'BW05S_app_v1:machine';
    const state = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...state, elapsedSeconds: 29 * 60, runStartedAt: null }));
  });
  await page.reload();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.locator('.bw-progress-row.active > span:last-child').innerText(), '9min', 'newly started steam displays rounded-up minutes');
  assert.equal(await dialog.getByRole('checkbox').nth(0).isDisabled(), true, 'completed wash stays locked');
  assert.equal(await dialog.getByRole('checkbox').nth(1).isDisabled(), true, 'current steam stays locked');
  assert.equal(await dialog.getByRole('checkbox').nth(2).isDisabled(), false, 'future dry remains editable');
  await collapse();
  await page.evaluate(elapsed => {
    const key = 'BW05S_app_v1:machine';
    const state = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...state, elapsedSeconds: elapsed }));
  }, machine.elapsedSeconds);
  await page.reload();
  await page.locator('.bw-supply-bars').click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  assert.equal((await stored()).isRunning, false);
  const headerTop = await page.locator('.bw-header').evaluate(node => node.getBoundingClientRect().top);
  await page.getByRole('button', { name: '设备设置', exact: true }).click();
  assert.equal(await page.locator('.bw-header').evaluate(node => node.getBoundingClientRect().top), headerTop);
  assert.equal(await page.locator('.bw-summary-count').innerText(), '2 项耗材');
  assert.deepEqual(await page.locator('.bw-summary-info strong').allTextContents(), ['软水滤芯', 'HEPA 滤芯']);
  assert.deepEqual(await page.locator('.bw-summary-info > span').allTextContents(), ['剩余 36 次', '剩余 216 次']);
  assert.deepEqual(await page.locator('.bw-summary-ring > span').allTextContents(), ['60%', '60%']);
  assert.deepEqual(await page.locator('.bw-summary-ring-value').evaluateAll(nodes => nodes.map(node => node.getAttribute('stroke-dasharray'))), ['60 100', '60 100']);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator('.bw-summary-item').evaluateAll(nodes => nodes.every(node => {
      const row = node.getBoundingClientRect();
      const icon = node.querySelector('.bw-summary-icon').getBoundingClientRect();
      const info = node.querySelector('.bw-summary-info').getBoundingClientRect();
      const ring = node.querySelector('.bw-summary-ring').getBoundingClientRect();
      return node.scrollWidth <= node.clientWidth && icon.right <= info.left && info.right <= ring.left && ring.right <= row.right;
    })), `settings consumable rows fit at ${width}`);
    const rows = await page.locator('.bw-summary-item').evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })));
    assert.ok(rows[0].bottom <= rows[1].top, 'consumables stack vertically');
    await page.screenshot({ path: `tests/artifacts/modes/settings-${width}.png` });
  }
  await page.screenshot({ path: 'tests/artifacts/modes/settings.png' });
  await page.locator('.bw-consumables-summary').click();
  assert.equal(await page.locator('.bw-header').evaluate(node => node.getBoundingClientRect().top), headerTop);
  await page.reload();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.bw-settings-content').waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('[data-model=bw05s]').waitFor();
  assert.equal(await page.locator('.bw-mode-grid').count(), 0, 'running back goes straight to list');
  await page.locator('[data-model=bw05s]').click();
  await page.locator('.bw-progress').waitFor();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '停止', exact: true }).click();
  await page.locator('.bw-mode-grid').first().waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('[data-model=bw05s]').waitFor();
  assert.match(await page.locator('[data-model=bw05s] .device-status').innerText(), /Last used/);
  assert.match(await page.locator('[data-model=bw05s] .device-status').innerText(), /Last used · \d{2}:\d{2}$/);
  assert.doesNotMatch(await page.locator('[data-model=bw05s] .device-status').innerText(), /Standby/);
  const todayLastUsed = (await stored()).lastUsedAt;
  await page.evaluate(() => {
    const key = 'BW05S_app_v1:machine';
    const state = JSON.parse(localStorage.getItem(key));
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    localStorage.setItem(key, JSON.stringify({ ...state, lastUsedAt: yesterday.getTime() }));
  });
  await page.reload();
  assert.doesNotMatch(await page.locator('[data-model=bw05s] .device-status').innerText(), /Last used · \d{2}:\d{2}$/, 'previous days keep the date');
  await page.evaluate(lastUsedAt => {
    const key = 'BW05S_app_v1:machine';
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), lastUsedAt }));
  }, todayLastUsed);
  await page.reload();
  await page.locator('[data-model=bw05s]').click();
  await open('custom-2');
  await dialog.getByRole('button', { name: '定时启动', exact: true }).click();
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await page.getByRole('button', { name: '确认预约', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  assert.equal((await stored()).selectedMode, 'custom-2');
  assert.ok((await stored()).scheduleAt > Date.now());
  await page.getByRole('button', { name: '取消预约', exact: true }).click();
  await open('custom-2');
  await dialog.getByRole('button', { name: '开始清洗', exact: true }).click();
  await page.locator('.bw-progress').waitFor();
  await page.getByRole('button', { name: '暂停或继续清洗', exact: true }).click();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('BW05S_app_v1:machine')).isRunning);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await dialog.getByRole('checkbox').first().isDisabled(), true);
  await dialog.getByRole('checkbox').nth(2).click();
  await dialog.getByRole('textbox', { name: '烘干 时长', exact: true }).fill('60');
  await dialog.getByRole('textbox', { name: '烘干 时长', exact: true }).blur();
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  assert.equal((await stored()).customConfig[2].duration, 60);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await dialog.getByRole('button', { name: '停止', exact: true }).click();
  await open('custom-2');
  assert.equal(await dialog.getByRole('textbox', { name: '烘干 时长', exact: true }).inputValue(), '60');
  await collapse();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}#/demo/cleaning-machine/home`);
  await page.locator('[data-mode=auto]').waitFor();
  const neutralBackground = await page.locator('[data-mode=auto]').evaluate(node => getComputedStyle(node).backgroundColor);
  await open('auto');
  assert.equal(await page.locator('[data-mode=auto] .bw-mode-open').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'demo toolbar styles must not color the mode disclosure');
  await collapse();
  await page.waitForFunction(background => getComputedStyle(document.querySelector('[data-mode=auto]')).backgroundColor === background, neutralBackground);
  assert.equal(await page.locator('[data-mode=auto]').evaluate(node => getComputedStyle(node).backgroundColor), neutralBackground);
  await page.screenshot({ path: 'tests/artifacts/modes/demo-home.png' });
  for (const darkMode of [false, true]) {
    await page.evaluate(dark => localStorage.setItem('BW05S_app_v1:preferences', JSON.stringify({ locale: 'en', darkMode: dark })), darkMode);
    await page.setViewportSize({ width: 320, height: 844 });
    const localizedUrl = new URL(base);
    localizedUrl.searchParams.set('mode-layout-check', darkMode ? 'dark' : 'light');
    localizedUrl.hash = '/app/cleaning-machine/home';
    await page.goto(localizedUrl.href);
    assert.equal(await page.locator('[data-mode=smart] .bw-card-duration').innerText(), 'Auto-adjusts');
    await open('auto');
    assert.equal(await dialog.locator('.bw-required-label, .lucide-lock-keyhole').count(), 0);
    assert.ok(await dialog.locator('.bw-preset-step, .bw-custom-row').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderWidth === '0px')), 'localized step blocks have no borders');
    assert.ok(await dialog.locator('.bw-preset-step').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), 'English steps fit narrow sheets');
    await page.screenshot({ path: `tests/artifacts/modes/required-en-${darkMode ? 'dark' : 'light'}.png` });
    await page.getByRole('button', { name: 'Collapse panel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.deepEqual(await page.locator('.bw-summary-info strong').allTextContents(), ['Water softener', 'HEPA filter']);
    assert.ok(await page.locator('.bw-summary-item').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), 'English supply rows fit narrow settings');
    await page.screenshot({ path: `tests/artifacts/modes/settings-en-${darkMode ? 'dark' : 'light'}.png` });
    await page.locator('.bw-consumables-summary').click();
    assert.equal(await dialog.count(), 0);
    assert.ok(await page.locator('.bw-consumable-card, .bw-consumable-heading, .bw-consumable-info').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), 'English consumable cards fit narrow screens');
    await page.screenshot({ path: `tests/artifacts/modes/consumables-en-${darkMode ? 'dark' : 'light'}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: modes, fixed steps, storage exclusion, drag/follow/spring/dismiss, three saved custom slots, launch/schedule, supplies navigation, running continuity, header alignment and last-used status.');
} finally { await browser.close(); }
