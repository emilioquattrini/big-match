import { test, expect } from '@playwright/test';

test('the result page explains the final collective reveal and links to Justcolors', async ({ page }) => {
  await page.goto('./');
  const reveal = page.locator('#collective-reveal');
  await expect(reveal).toContainText('3 most selected Impersonae');
  await expect(reveal).toContainText('At the end of the event');
  const instagram = reveal.locator('a[href="https://www.instagram.com/justcolors____/"]');
  await expect(instagram).toHaveCount(1);
  await expect(instagram).toHaveAttribute('target', '_blank');
  await expect(instagram).toHaveAttribute('rel', /noopener/);
});
