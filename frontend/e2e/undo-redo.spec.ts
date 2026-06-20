import { test, expect } from '@playwright/test';

// Undo/redo is exercised through the display-mode toggle: it is undoable
// (setDisplayMode snapshots history) and trivially observable via the
// ToggleButton's aria-pressed state — no atom-selection dance required.
async function loadSampleAndOpenStyle(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /load a sample/i }).click();
  await expect(page.getByText('water', { exact: true }).first()).toBeVisible();
  await page.locator('[aria-label="toggle style panel"]').click();
}

const ballStick = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Ball & stick' });
const vdw = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'vdW' });

test('toolbar Undo reverts a display-mode change and Redo re-applies it', async ({ page }) => {
  await loadSampleAndOpenStyle(page);

  // Default is Ball & stick; switch to vdW (this pushes one undo frame).
  await vdw(page).click();
  await expect(vdw(page)).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[aria-label="undo"]').click();
  await expect(ballStick(page)).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[aria-label="redo"]').click();
  await expect(vdw(page)).toHaveAttribute('aria-pressed', 'true');
});

test('Cmd/Ctrl+Z undoes a display-mode change from the keyboard', async ({ page }) => {
  await loadSampleAndOpenStyle(page);

  await vdw(page).click();
  await expect(vdw(page)).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(ballStick(page)).toHaveAttribute('aria-pressed', 'true');
});
