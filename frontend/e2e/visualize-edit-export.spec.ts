import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// This project is ESM ("type": "module"), so __dirname is not defined; derive
// the spec directory from import.meta.url instead.
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, '../../fixtures/water.xyz');

test('upload → render → delete bond → export scene.json', async ({ page }) => {
  await page.goto('/');

  // Upload the water fixture through the hidden file input.
  await page.locator('[data-testid="file-input"]').setInputFiles(FIXTURE);

  // Structure renders: the r3f canvas is visible and the tab chip reads "water".
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('water', { exact: true }).first()).toBeVisible();

  // Select the O1-H1 bonded pair via the Selection panel's "Label" method.
  await page.locator('[aria-label="toggle selection panel"]').click();
  await page.getByRole('button', { name: 'Label' }).click();
  await page.getByRole('textbox', { name: /labels/i }).fill('O1,H1');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/2 atoms selected/i)).toBeVisible();

  // Open the bonds panel. With exactly two atoms selected, Delete bond enables.
  // Scope to the side panel — the floating action bar also has a delete-bond button.
  await page.locator('[aria-label="toggle bonds panel"]').click();
  const deleteBond = page.locator('.MuiDrawer-paper').getByRole('button', { name: /delete bond/i });
  await expect(deleteBond).toBeEnabled();
  await deleteBond.click();

  // The manual-override list registers the deleted bond. The entry renders the
  // atom-index pair (joined by an en-dash in the DOM) followed by "delete".
  await expect(page.getByText(/0.1\s*→\s*delete/)).toBeVisible();

  // Export the scene as scene.json and assert a *.scene.json download.
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[aria-label="Export"]').click();
  // "scene.json" collides with "Open scene.json / style.json…" -> exact match.
  await page.getByRole('menuitem', { name: 'scene.json', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.scene\.json$/);
});
