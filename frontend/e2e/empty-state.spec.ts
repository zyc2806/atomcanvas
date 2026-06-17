import { test, expect } from '@playwright/test';

test('landing shows onboarding and "Load a sample" loads a structure', async ({ page }) => {
  await page.goto('/');

  // The empty landing view shows the onboarding prompt instead of a black void.
  await expect(page.getByText(/drag & drop/i)).toBeVisible();
  const sample = page.getByRole('button', { name: /load a sample/i });
  await expect(sample).toBeVisible();

  await sample.click();

  // A structure loads: canvas renders, a "water" tab appears, prompt disappears.
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('water', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/drag & drop/i)).toHaveCount(0);
});
