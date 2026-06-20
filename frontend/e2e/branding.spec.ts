import { test, expect } from '@playwright/test';

test('app is branded as AtomCanvas', async ({ page }) => {
  await page.goto('/');

  // Tab title comes straight from index.html — no hydration wait needed.
  await expect(page).toHaveTitle('AtomCanvas');

  // The shell header renders the wordmark unconditionally (no structure required).
  await expect(page.getByText('AtomCanvas', { exact: true })).toBeVisible();
});

test('favicon link points at a resolvable asset', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const res = await page.request.get('/favicon.svg');
  expect(res.ok()).toBeTruthy();
});
