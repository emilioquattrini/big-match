import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Catalogue } from '../../src/types.ts';
import { startStaticOrigin } from './static-origin.ts';

const catalogue = JSON.parse(readFileSync(new URL('../../catalog/impersonae-v1.json', import.meta.url), 'utf8')) as Catalogue;

async function choose(page: Page, ids = [1, 2, 3]) {
  for (const id of ids) await page.locator(`button[data-card-id="${id}"]`).click();
  await expect(page.locator('#result')).toBeVisible();
}

async function expectCardProportions(page: Page, selector: string, count: number) {
  const images = page.locator(selector);
  await expect(images).toHaveCount(count);
  const sizes = await images.evaluateAll(elements => elements.map(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  }));
  for (const [index, { width, height }] of sizes.entries()) {
    expect(width, `${selector} image ${index + 1} has a rendered width`).toBeGreaterThan(0);
    // HTML width/height attributes reserve space, but must not force a 640px-tall
    // image when responsive CSS narrows the card. Allow only pixel rounding.
    expect(Math.abs(height - width * 640 / 432), `${selector} image ${index + 1} keeps its card proportions`).toBeLessThanOrEqual(1);
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  // No browser test can write into a real event, even if the artifact is misconfigured.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) await route.abort('blockedbyclient');
    else await route.continue();
  });
});

test('the current Pages prefix loads all cards and supports search without selection loss', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('button[data-card-id]')).toHaveCount(catalogue.cards.length);
  await expectCardProportions(page, '#grid .card img', catalogue.cards.length);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  await expect(page.locator('#update-notice')).toBeHidden();
  await page.locator('button[data-card-id="1"]').click();
  await page.locator('#search').fill('oCeAn');
  const matchingIds = catalogue.cards.filter(card => card.name.toLocaleLowerCase().includes('ocean')).map(card => String(card.id));
  await expect(page.locator('button[data-card-id]:visible')).toHaveCount(matchingIds.length);
  await expect.poll(() => page.locator('button[data-card-id]:visible').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-card-id')))).toEqual(matchingIds);
  await expect(page.locator('button[data-card-id="10"]')).toBeVisible();
  await page.locator('#search').fill('');
  await expect(page.locator('button[data-card-id="1"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('third-card transition, modal focus, close and reopen remain consistent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await choose(page);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#result')))).toBe(true);
    }
  }
  await page.locator('#close').click();
  await expect(page.locator('#result')).not.toBeVisible();
  await page.getByRole('button', { name: /view.*match/i }).click();
  await expect(page.locator('#result')).toBeVisible();
  expect(errors).toEqual([]);
});

test('removing the third card before reveal cancels the obsolete transition', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  // A single event-loop turn reproduces the original rapid-tap race without timing jitter.
  await page.evaluate(() => {
    for (const id of [1, 2, 3, 3]) document.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)!.click();
  });
  await expect(page.locator('#counter')).toHaveText('2 / 3 selected');
  // Let the 300 ms reveal deadline elapse while only two cards remain.
  await page.waitForTimeout(400);
  await expect(page.locator('#result')).not.toBeVisible();
  await page.locator('button[data-card-id="4"]').click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#trio img')).toHaveCount(3);
  await expect(page.locator('#trio img').nth(2)).toHaveAttribute('alt', 'Hypnotic');
  expect(errors).toEqual([]);
});

test('reload restores the local composition without manufacturing community data', async ({ page }) => {
  await page.goto('./');
  await choose(page);
  await page.reload();
  for (const id of [1, 2, 3]) await expect(page.locator(`button[data-card-id="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).not.toContainText('CONTACT SAVED');
  await expect(page.locator('body')).not.toContainText('PEOPLE SHARE YOUR VISION');
});

test('one Share gesture triggers one native handoff and cancel never forces a download', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__shareCalls', { value: [], configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (payload: ShareData) => {
        (window as unknown as { __shareCalls: unknown[] }).__shareCalls.push({ files: payload.files?.length || 0 });
        throw new DOMException('Cancelled by test', 'AbortError');
      }, configurable: true,
    });
  });
  const downloads: unknown[] = [];
  page.on('download', download => downloads.push(download));
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#share')).toBeEnabled();
  await page.locator('#share').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shareCalls: unknown[] }).__shareCalls.length)).toBe(1);
  await expect(page.locator('#share')).toBeEnabled();
  expect(downloads).toHaveLength(0);
});

test('download creates a real 1080 by 1920 PNG', async ({ page }, testInfo) => {
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#download')).toBeEnabled();
  await expectCardProportions(page, '#trio img', 3);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const location = await download.path();
  expect(location).toBeTruthy();
  const png = await readFile(location!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  expect(png.byteLength).toBeGreaterThan(20_000);
  const artifact = testInfo.outputPath('big-match-story-1080x1920.png');
  await download.saveAs(artifact);
  await testInfo.attach('Native canvas Story — 1080×1920', { path: artifact, contentType: 'image/png' });
  const screenshot = testInfo.outputPath('big-match-result-view.png');
  await page.locator('#result').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.locator('#result').evaluate(element => element.scrollTop)).toBe(0);
  // A full-page capture composites a fixed dialog into the longer, inert page.
  // The actual viewport preserves the user-visible modal geometry instead.
  await page.screenshot({ path: screenshot });
  await testInfo.attach('Result dialog viewport', { path: screenshot, contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('#close').click();
  await expect(page.locator('#result')).not.toBeVisible();
  await page.locator('#pick-title').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const selectionScreenshot = testInfo.outputPath('big-match-selection-view.png');
  await page.screenshot({ path: selectionScreenshot });
  await testInfo.attach('Card selection viewport', { path: selectionScreenshot, contentType: 'image/png' });
});

test('a shared composition is read-only; invalid card routes do not become selections', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (['POST', 'PUT', 'DELETE'].includes(request.method())) writes.push(request.url()); });
  await page.goto('./#/r/big-2026/impersonae-v1/1-2-3');
  await expect(page.locator('#result')).toBeVisible();
  await page.reload();
  expect(writes).toEqual([]);
  await page.goto('./#/r/big-2026/impersonae-v1/1-1-3');
  await expect(page.locator('#result')).not.toBeVisible();
});

test('preloaded shell survives an unavailable network origin without claiming a server save', async ({ page, context, browserName, baseURL }, testInfo) => {
  // Playwright 1.63 WebKit rejects even literal SW responses under setOffline:
  // https://github.com/microsoft/playwright/issues/42775. Stop an isolated origin instead.
  const isolated = browserName === 'webkit' ? await startStaticOrigin(new URL(baseURL!).pathname) : null;
  try {
    if (isolated) {
      await page.unrouteAll({ behavior: 'wait' });
      const origin = new URL(isolated.url).origin;
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
      testInfo.annotations.push({ type: 'coverage', description: 'WebKit 1.63: stopped-origin recovery; physical airplane mode remains a device acceptance test.' });
    }
    await page.goto(isolated?.url || './');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    expect(await page.evaluate(async () => Boolean(await caches.match(location.origin + location.pathname)))).toBe(true);
    if (isolated) await isolated.stop(); else await context.setOffline(true);
    // Negative control: a request explicitly bypassing the worker cannot reach the origin.
    expect(await page.evaluate(async () => { try { await fetch(location.href, { cache: 'no-store' }); return false; } catch { return true; } })).toBe(true);
    const recovered = await page.reload();
    expect(recovered?.status()).toBe(200);
    expect(recovered?.fromServiceWorker()).toBe(true);
    await expect(page.locator('button[data-card-id]')).toHaveCount(catalogue.cards.length);
    await choose(page);
    await expect(page.locator('#download')).toBeEnabled();
    await expect(page.locator('#export-status')).toContainText('Your Story is ready');
    await expect(page.locator('body')).not.toContainText('CONTACT SAVED');
    await expect(page.locator('#save-status')).toContainText(/unavailable|on this device|offline/i);
  } finally {
    await isolated?.stop();
    await context.setOffline(false);
  }
});
