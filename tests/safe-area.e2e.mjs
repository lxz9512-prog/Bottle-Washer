import { openGlobalTools, setWorkspacePanel } from './workspace-controls.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const directory = 'tests/artifacts/safe-area';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const captures = [];
const errors = [];
let checks = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:5173/#/demo');
  await openGlobalTools(page);
  await page.locator('.console-toolbar').waitFor();
  const go = async title => {
    await setWorkspacePanel(page, '页面目录', true);
    await page.locator('.directory-panel').getByRole('button', { name: title, exact: true }).click();
    await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0,0));
  };
  const setTheme = async dark => {
    await go('其他设置');
    const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('BW05S_demo_v1:preferences')??'{}').darkMode===true);
    if(current!==dark)await page.locator('[data-device-screen] button').filter({has:page.locator('svg.lucide-moon')}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
  };
  const consoleOpen = async () => {
    await openGlobalTools(page);
  };
  const inspect = async (name, capture = false) => {
    const screen = page.locator('[data-device-screen]');
    const geometry = await screen.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const content = node.querySelector('.device-content').getBoundingClientRect();
      const status = node.querySelector('.device-status-bar').getBoundingClientRect();
      const indicator = node.querySelector('[data-home-indicator]').firstElementChild;
      return {
        gap: Math.abs(content.bottom - rect.bottom),
        headerHeight: status.height / (rect.width / node.clientWidth),
        contentTop: content.top - status.bottom,
        indicatorColor: getComputedStyle(indicator).backgroundColor,
        inViewport: rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1,
        horizontalOverflow: node.scrollWidth > node.clientWidth,
      };
    });
    assert.ok(geometry.gap < 1, `${name}: bottom gap ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.headerHeight - 59) < 1, `${name}: status safe area`);
    assert.ok(Math.abs(geometry.contentTop) < 1, `${name}: top gap`);
    assert.notEqual(geometry.indicatorColor, 'rgba(0, 0, 0, 0)', `${name}: invisible home indicator`);
    assert.equal(geometry.inViewport, true, `${name}: screen clipped`);
    assert.equal(geometry.horizontalOverflow, false, `${name}: horizontal overflow`);

    // Compare real rendered pixels across the former status/content and bottom-padding seams.
    const shot = await screen.screenshot();
    const seams = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const scale = image.width / 377;
      const color = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
      const difference = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      return {
        top: difference(color(image.width * .12, 57 * scale), color(image.width * .12, 61 * scale)),
        bottom: difference(color(image.width * .25, image.height - 22 * scale), color(image.width * .25, image.height - 18 * scale)),
      };
    }, shot.toString('base64'));
    if (seams.top > 8 || seams.bottom > 8) await screen.screenshot({ path: `${directory}/failure-${name}.png` });
    assert.ok(seams.top <= 8 && seams.bottom <= 8, `${name}: background seam ${JSON.stringify(seams)}`);
    if (capture) {
      await screen.screenshot({ path: `${directory}/${name}.png` });
      captures.push({ name, data: shot.toString('base64') });
    }
    checks++;
  };
  const checkScrollEnds = async name => {
    const results = await page.locator('.device-content').evaluate(node => {
      const screen = node.getBoundingClientRect();
      return [...node.querySelectorAll('div')].filter(el => getComputedStyle(el).overflowY === 'auto').map(el => {
        el.scrollTop = el.scrollHeight;
        const last = el.lastElementChild?.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return { reachable: !last || last.bottom <= rect.bottom + 1, inside: rect.bottom <= screen.bottom + 1 };
      });
    });
    assert.ok(results.every(result => result.reachable && result.inside), `${name}: inaccessible scroll end ${JSON.stringify(results)}`);
  };
  const titles = ['设备列表', '模式选择', '自定义模式', '智能模式运行', '运行控制', '设备设置', '耗材管理', '设备信息', '宝宝物品', '其他设置', '系统通知'];
  for (const compact of [false, true]) {
    await page.setViewportSize(compact ? { width: 375, height: 667 } : { width: 1512, height: 1100 });
    await page.waitForTimeout(200);
    for (const dark of [false, true]) {
      await consoleOpen();
      await setTheme(dark);
      for (const frame of [true, false]) {
        await consoleOpen();
        await page.getByRole('switch', { name: '显示手机边框' }).setChecked(frame);
        if (compact) await page.keyboard.press('Escape');
        for (let i = 0; i < titles.length; i++) {
          await go(titles[i]);
          const name = `${compact ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}-${frame ? 'frame' : 'plain'}-${i}`;
          await inspect(name, !compact && frame);
          await checkScrollEnds(name);
        }
        await go('宝宝物品');
        const phone = page.locator('[data-device-screen]');
        await phone.getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).click();
        await inspect(`form-${compact}-${dark}-${frame}`);
        await checkScrollEnds('new item form');
        await phone.getByRole('button').filter({ has: page.locator('svg.lucide-chevron-left') }).click();
        await phone.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first().click();
        await inspect(`detail-${compact}-${dark}-${frame}`, !compact && frame);
        await checkScrollEnds('item detail');
        await phone.getByRole('button').filter({ has: page.locator('svg.lucide-pencil') }).click();
        await inspect(`edit-${compact}-${dark}-${frame}`);
        await checkScrollEnds('edit item form');
      }
    }
  }
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.waitForTimeout(200);
  await consoleOpen();
  await page.getByRole('switch', { name: '显示手机边框' }).check();
  await setTheme(false);
  await go('模式选择');
  await page.locator('[data-device-screen]').getByRole('button', { name: /Breast Pump|吸奶器/ }).first().click();
  await page.waitForTimeout(400);
  await inspect('mode-sheet', true);
  await page.screenshot({ path: `${directory}/preview.png`, fullPage: true });
  assert.deepEqual(errors, []);

  const gallery = await browser.newPage({ viewport: { width: 1120, height: 1600 } });
  await gallery.setContent(`<style>body{margin:0;padding:20px;background:#edf0f2;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px 0}</style><div class="grid">${captures.map(({ name, data }) => `<figure><img src="data:image/png;base64,${data}"><figcaption>${name}</figcaption></figure>`).join('')}</div>`);
  await gallery.screenshot({ path: `${directory}/all-pages.png`, fullPage: true });
  console.log(`PASS: ${checks} safe-area checks across all pages, nested forms/details, desktop/mobile, both themes and frame states; continuous top/bottom pixels, reachable scroll ends, no runtime errors.`);
} finally {
  await browser.close();
}
