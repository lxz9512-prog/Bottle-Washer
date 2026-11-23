export async function openGlobalTools(page) {
  const button = page.getByRole('button', { name: '打开全局控制台', exact: true });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
}

export async function openPageExceptions(page) {
  const button = page.getByRole('button', { name: '打开异常控制台', exact: true });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
}

export async function setWorkspacePanel(page, name, open) {
  const rail = page.locator(name === '页面目录' ? '.directory-panel' : '.info-panel');
  if ((await rail.getAttribute('data-open') === 'true') !== open) {
    const restoreExceptions = await page.locator('.console-panel').count() > 0;
    await openGlobalTools(page);
    await page.getByRole('switch', { name, exact: true }).setChecked(open);
    if (await page.locator('.global-panel').count()) await page.getByRole('button', { name: '关闭全局控制台', exact: true }).click();
    if (restoreExceptions && await page.evaluate(() => innerWidth >= 1200)) await openPageExceptions(page);
  }
  await rail.evaluate(async node => {
    await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
}
