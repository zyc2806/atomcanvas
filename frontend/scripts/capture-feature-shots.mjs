/**
 * capture-feature-shots.mjs
 *
 * Standalone Node ES module that:
 *  1. Spawns the AtomCanvas production server (scripts/serve.sh) on port 8000
 *     (or uses an already-running one — idempotent)
 *  2. Opens Chromium via Playwright, viewport 1600×1000
 *  3. Drives 7 UI states and captures full-window screenshots to docs/assets/features/
 *  4. Tears down the server (if we started it) at the end
 *
 * Run (proxy vars MUST be unset):
 *   env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
 *     NO_PROXY=localhost,127.0.0.1,::1 \
 *     node frontend/scripts/capture-feature-shots.mjs
 */

import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');
const FIXTURES = path.join(projectRoot, 'fixtures');
const OUT_DIR = path.join(projectRoot, 'docs', 'assets', 'features');

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://localhost:8000';
const SERVE_SCRIPT = path.join(projectRoot, 'scripts', 'serve.sh');

// ── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function isServerUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 404;
  } catch { return false; }
}

async function pollUntilReady(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp(url)) return;
    await sleep(1000);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Create a fresh browser context + page for a single shot.
 * Fix 1: each shot gets its own context so localStorage/session starts empty.
 */
async function newShotPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await sleep(800);
  return { context, page };
}

/** Upload one or more fixture files and wait for the canvas to be non-blank. */
async function uploadAndWait(page, filenames) {
  const paths = (Array.isArray(filenames) ? filenames : [filenames])
    .map(f => path.join(FIXTURES, f));
  await page.locator('[data-testid="file-input"]').setInputFiles(paths);
  // Wait for canvas to appear
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
  // Give React + Three.js time to render frames
  await sleep(3000);
}

/**
 * Move mouse to neutral corner and wait so no tooltip is showing.
 * Fix 2: call before every screenshot.
 */
async function clearTooltips(page) {
  await page.mouse.move(20, 520);
  await sleep(400);
}

// ── server lifecycle ─────────────────────────────────────────────────────────

let serverProc = null;
let weStartedServer = false;

async function ensureServer() {
  if (await isServerUp(BASE_URL)) {
    console.log('Server already running on port 8000, reusing it.');
    return;
  }
  console.log('Starting AtomCanvas server via scripts/serve.sh ...');
  serverProc = spawn('bash', [SERVE_SCRIPT], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ATOMCANVAS_FORCE_STALE: '1',
      http_proxy: '', https_proxy: '', all_proxy: '',
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '',
    },
  });
  serverProc.stdout.on('data', d => process.stdout.write('[server] ' + d));
  serverProc.stderr.on('data', d => process.stderr.write('[server] ' + d));
  serverProc.on('error', err => console.error('Server process error:', err));
  weStartedServer = true;
  await pollUntilReady(BASE_URL, 90_000);
  console.log('Server is up.');
}

function stopServer() {
  if (!serverProc || !weStartedServer) return;
  try { process.kill(-serverProc.pid, 'SIGTERM'); } catch { /* already gone */ }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await ensureServer();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--proxy-bypass-list=*', '--no-sandbox'],
  });

  try {
    // ── Shot 1: load ─────────────────────────────────────────────────────────
    console.log('Shot 1: load.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'benzene.xyz');
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'load.png'), fullPage: false });
      await context.close();
      console.log('  → load.png written');
    }

    // ── Shot 2: bonding ──────────────────────────────────────────────────────
    console.log('Shot 2: bonding.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'benzene.xyz');
      await page.locator('[aria-label="toggle bonds panel"]').click();
      await sleep(1000);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'bonding.png'), fullPage: false });
      await context.close();
      console.log('  → bonding.png written');
    }

    // ── Shot 3: bond-edit ────────────────────────────────────────────────────
    console.log('Shot 3: bond-edit.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'benzene.xyz');
      // Open bonds panel then selection panel and select 2 bonded atoms
      await page.locator('[aria-label="toggle bonds panel"]').click();
      await sleep(600);
      await page.locator('[aria-label="toggle selection panel"]').click();
      await sleep(600);
      await page.getByRole('button', { name: 'Label' }).click();
      await sleep(400);
      await page.getByRole('textbox', { name: /labels/i }).fill('C1,C2');
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.waitForSelector('text=2 atoms selected', { timeout: 10_000 });
      await sleep(500);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'bond-edit.png'), fullPage: false });
      await context.close();
      console.log('  → bond-edit.png written');
    }

    // ── Shot 4: selection ────────────────────────────────────────────────────
    console.log('Shot 4: selection.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'benzene.xyz');
      // Open selection panel
      await page.locator('[aria-label="toggle selection panel"]').click();
      await sleep(600);
      // Expand "Expression (advanced)"
      const exprToggle = page.locator('button').filter({ hasText: 'Expression' });
      await exprToggle.waitFor({ state: 'visible', timeout: 8_000 });
      await exprToggle.click();
      await sleep(600);
      // The expression autocomplete input has label "Selection Expression"
      const exprInput = page.getByLabel('Selection Expression');
      await exprInput.waitFor({ state: 'visible', timeout: 6_000 });
      await exprInput.fill('elem:C');
      await sleep(300);
      // Apply via the icon button with aria-label "Apply Selection"
      await page.getByRole('button', { name: 'Apply Selection' }).click();
      await sleep(1200);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'selection.png'), fullPage: false });
      await context.close();
      console.log('  → selection.png written');
    }

    // ── Shot 5: style ────────────────────────────────────────────────────────
    console.log('Shot 5: style.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'benzene.xyz');
      await page.locator('[aria-label="toggle style panel"]').click();
      await sleep(1000);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'style.png'), fullPage: false });
      await context.close();
      console.log('  → style.png written');
    }

    // ── Shot 6: tabs ─────────────────────────────────────────────────────────
    // Fix 3: upload exactly 3 distinct structures from a fresh context
    console.log('Shot 6: tabs.png');
    {
      const { context, page } = await newShotPage(browser);
      await page.locator('[data-testid="file-input"]').setInputFiles([
        path.join(FIXTURES, 'benzene.xyz'),
        path.join(FIXTURES, 'nacl.cif'),
        path.join(FIXTURES, 'water.xyz'),
      ]);
      await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
      // Wait longer so all 3 structures load and tabs render
      await sleep(4000);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'tabs.png'), fullPage: false });
      await context.close();
      console.log('  → tabs.png written');
    }

    // ── Shot 7: trajectory ───────────────────────────────────────────────────
    console.log('Shot 7: trajectory.png');
    {
      const { context, page } = await newShotPage(browser);
      await uploadAndWait(page, 'water_traj.extxyz');
      // Extra wait for trajectory bar to render
      await sleep(2000);
      await clearTooltips(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'trajectory.png'), fullPage: false });
      await context.close();
      console.log('  → trajectory.png written');
    }

    console.log('\nAll 7 screenshots captured successfully.');
  } finally {
    await browser.close().catch(() => {});
    stopServer();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  stopServer();
  process.exit(1);
});
