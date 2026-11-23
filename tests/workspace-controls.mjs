// Both consoles are permanently mounted. Helpers bring controls into view on narrow screens.
export async function openGlobalTools(page) {
  await page.locator('.global-panel > header').scrollIntoViewIfNeeded();
}

export async function openPageExceptions(page) {
  await page.locator('.console-panel > header').scrollIntoViewIfNeeded();
}

export async function setWorkspacePanel(page, name, open) {
  const rail = page.locator(name === '页面目录' ? '.directory-panel' : '.info-panel');
  if ((await rail.getAttribute('data-open') === 'true') !== open) {
    const scrollY = await page.evaluate(() => window.scrollY);
    await openGlobalTools(page);
    await page.getByRole('switch', { name, exact: true }).setChecked(open);
    await page.evaluate(y => window.scrollTo(0, y), scrollY);
  }
  await rail.evaluate(async node => {
    await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
}
