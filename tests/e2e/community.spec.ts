import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { EventFixture } from './api-fixture.ts';

async function choose(page: Page) {
  for (const id of [1, 2, 3]) await page.locator(`button[data-card-id="${id}"]`).click();
  await expect(page.locator('#result')).toBeVisible();
}

let fixture: EventFixture;
test.beforeEach(async ({ context, baseURL }) => {
  fixture = new EventFixture();
  await fixture.install(context, baseURL!);
});
test.afterEach(() => { expect(fixture.unexpectedRequests).toEqual([]); });

test('a genuine zero response count becomes one private browser response', async ({ page }) => {
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#save-status')).toContainText('Your response is saved.');
  await expect(page.locator('#exactcount')).toHaveText('0');
  await expect(page.locator('#closecount')).toHaveText('0');
  expect(fixture.authSignups).toBe(1);
  expect(fixture.putBodies).toHaveLength(1);
  expect(fixture.putBodies[0].expectedRevision).toBe(0);
  await page.reload();
  await expect(page.locator('#connection-stats')).toBeVisible();
  expect(fixture.authSignups).toBe(1);
  expect(fixture.putBodies).toHaveLength(1);
  await expect(page.locator('#contact-section')).not.toBeVisible();
});

test('lost acknowledgement retains the same request ID and revision when retried', async ({ page }) => {
  fixture.loseNextPutResponse = true;
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#retry-save')).toBeEnabled();
  await expect(page.locator('#save-status')).not.toContainText('Your response is saved.');
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('Your response is saved.');
  expect(fixture.putBodies).toHaveLength(2);
  expect(fixture.putBodies[1]).toEqual(fixture.putBodies[0]);
  expect(fixture.committedWrites).toBe(1);
});

test('a conflict offers the newer composition without silently overwriting it', async ({ page }) => {
  fixture.conflictNextPut = true;
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#retry-save')).toHaveText('LOAD LATEST RESULT');
  await expect(page.locator('#connection-stats')).not.toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#trio img').nth(2)).toHaveAttribute('alt', 'Hypnotic');
  await expect(page.locator('button[data-card-id="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-card-id="3"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#save-status')).toContainText('Your response is saved.');
  expect(fixture.putBodies).toHaveLength(1);
});

test('personal exact and close values use the returned coherent snapshot', async ({ page }) => {
  fixture.matches = { exact: 1, close: 3 };
  fixture.snapshot = { total: 7, cardCounts: { '1': 5, '2': 4, '3': 4, '4': 4, '5': 2, '6': 2 },
    pairCounts: { '1-2': 3, '1-3': 3, '2-3': 3, '1-4': 2, '2-4': 2, '3-4': 2, '1-5': 1, '1-6': 1, '5-6': 2, '4-5': 1, '4-6': 1 },
    version: 7, asOf: '2026-10-06T12:00:00Z' };
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#exactcount')).toHaveText('1');
  await expect(page.locator('#closecount')).toHaveText('3');
  await expect(page.locator('#strongpaircount')).toContainText('2 other responses');
});

test('a delayed latest-result read cannot reopen or change a result after closing it', async ({ page }) => {
  fixture.conflictNextPut = true;
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#retry-save')).toHaveText('LOAD LATEST RESULT');
  fixture.holdNextPersonalRead = true;
  await page.locator('#retry-save').click();
  await expect.poll(() => fixture.heldReads).toBe(1);
  await page.locator('#close').click();
  const response = page.waitForResponse(response => response.url().endsWith('/me') && response.request().method() === 'GET');
  await fixture.releasePersonalReads();
  await (await response).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('#result')).not.toBeVisible();
  await expect(page.locator('button[data-card-id="3"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-card-id="4"]')).toHaveAttribute('aria-pressed', 'false');
});

test('shared links fetch public aggregates without creating an identity or response', async ({ page }) => {
  await page.goto('./#/r/big-2026/impersonae-v1/1-2-3');
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#make-own')).toBeVisible();
  await expect(page.locator('#save-status')).toContainText('Viewing it does not register a response.');
  await page.reload();
  await expect(page.locator('#result')).toBeVisible();
  expect(fixture.authSignups).toBe(0);
  expect(fixture.putBodies).toHaveLength(0);
  expect(fixture.contactBodies).toHaveLength(0);
});

test('catalogue failure keeps the form and retry ID; only acknowledgement shows success', async ({ page }) => {
  fixture.config.contactEnabled = true; fixture.failContacts = 1;
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#save-status')).toContainText('Your response is saved.');
  await page.locator('#contact-email').fill('buyer@example.invalid');
  await page.locator('#privacy-ack').check();
  await page.locator('#submit-contact').click();
  await expect(page.locator('#contact-status')).toContainText('could not be saved');
  await expect(page.locator('#contact-email')).toHaveValue('buyer@example.invalid');
  await expect(page.locator('#submit-contact')).toBeEnabled();
  await page.locator('#submit-contact').click();
  await expect(page.locator('#submit-contact')).toHaveText('REQUEST RECEIVED');
  await expect(page.locator('#contact-email')).toHaveValue('');
  expect(fixture.contactBodies).toHaveLength(2);
  expect(fixture.contactBodies[0]).toEqual(fixture.contactBodies[1]);
  expect(fixture.contactBodies[0].name).toBe('');
  expect(fixture.contactBodies[0]).not.toHaveProperty('participationId');
});

test('deletion failure keeps the local response; confirmed deletion clears it', async ({ page }) => {
  fixture.failDeletes = 1;
  await page.goto('./');
  await choose(page);
  await expect(page.locator('#save-status')).toContainText('Your response is saved.');
  await page.locator('#close').click();
  await page.locator('#erase-data').click();
  await page.locator('#confirm-delete').click();
  await expect(page.locator('#delete-status')).toContainText('temporarily unavailable');
  await expect(page.locator('#counter')).toHaveText('3 / 3 selected');
  await page.locator('#confirm-delete').click();
  await expect(page.locator('#delete-dialog')).not.toBeVisible();
  await expect(page.locator('#counter')).toHaveText('0 / 3 selected');
  await page.reload();
  await expect(page.locator('#counter')).toHaveText('0 / 3 selected');
  expect(fixture.deleteCalls).toBe(2);
});
