import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function choose(page: Page, ids = [1, 2, 3]) {
  for (const id of ids) await page.locator(`button[data-card-id="${id}"]`).click();
  await expect(page.locator('#result')).toBeVisible();
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
  await expect(page.locator('button[data-card-id]')).toHaveCount(13);
  await page.locator('button[data-card-id="1"]').click();
  await page.locator('#search').fill('oCeAn');
  await expect(page.locator('button[data-card-id]:visible')).toHaveCount(1);
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
  await testInfo.attach('Result view', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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

test('preloaded shell can reload offline and never claims a server save', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('button[data-card-id]')).toHaveCount(13);
  await choose(page);
  await expect(page.locator('body')).not.toContainText('CONTACT SAVED');
  await expect(page.locator('#save-status')).toContainText(/unavailable|on this device|offline/i);
  await context.setOffline(false);
});
