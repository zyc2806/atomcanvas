/**
 * capture-gifs.mjs
 *
 * Standalone Node ES module that generates two animated GIFs for the AtomCanvas docs:
 *   1. docs/assets/gallery/trajectory.gif  — trajectory scrubbing (ping-pong, 10 frames)
 *   2. docs/assets/demo.gif                — money-shot demo (upload → rotate → edit → export)
 *
 * Run (proxy vars MUST be unset):
 *   env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
 *     NO_PROXY=localhost,127.0.0.1,::1 \
 *     node frontend/scripts/capture-gifs.mjs
 *
 * Prerequisites: server already running on :8000 (or scripts/serve.sh is available),
 * @playwright/test installed, /opt/homebrew/bin/ffmpeg available.
 */

import { chromium } from '@playwright/test';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');
const FIXTURES = path.join(projectRoot, 'fixtures');
const GALLERY_DIR = path.join(projectRoot, 'docs', 'assets', 'gallery');
const DOCS_ASSETS_DIR = path.join(projectRoot, 'docs', 'assets');
const TMP_DIR = path.join(projectRoot, 'tmp');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

mkdirSync(GALLERY_DIR, { recursive: true });
mkdirSync(DOCS_ASSETS_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const BASE_URL = 'http://localhost:8000';
const SERVE_SCRIPT = path.join(projectRoot, 'scripts', 'serve.sh');

// ── helpers ──────────────────────────────────────────────────────────────────

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

/** Wait until the render frame counter advances beyond `baseline`. */
async function waitForNewFrame(page, baseline, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() =>
      typeof window.__atomcanvas?.frames === 'function'
        ? window.__atomcanvas.frames()
        : -1
    );
    if (current > baseline) return current;
    await sleep(50);
  }
  throw new Error(`No new render frame after ${timeoutMs}ms (baseline=${baseline})`);
}

/** Upload fixture file(s) and wait for canvas + initial render. */
async function uploadAndWait(page, filenames) {
  const paths = (Array.isArray(filenames) ? filenames : [filenames])
    .map(f => path.join(FIXTURES, f));
  await page.locator('[data-testid="file-input"]').setInputFiles(paths);
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
  // Wait for __atomcanvas hook to be ready and frames to start ticking
  await page.waitForFunction(
    () => typeof window.__atomcanvas?.frames === 'function' && window.__atomcanvas.frames() > 0,
    { timeout: 20_000 }
  );
  await sleep(2000); // extra settle for bonds/labels to render
}

/** Get current frame counter. */
async function getFrames(page) {
  return page.evaluate(() => window.__atomcanvas?.frames() ?? 0);
}

function runFfmpeg(args) {
  const cmd = `${FFMPEG} ${args}`;
  console.log(`  [ffmpeg] ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

/** Clean tmp files matching a prefix. */
function cleanTmp(prefix) {
  try {
    for (const f of readdirSync(TMP_DIR)) {
      if (f.startsWith(prefix)) unlinkSync(path.join(TMP_DIR, f));
    }
  } catch { /* ignore */ }
}

// ── server lifecycle ──────────────────────────────────────────────────────────

let serverProc = null;
let weStartedServer = false;

async function ensureServer() {
  if (await isServerUp(BASE_URL)) {
    console.log('Server already running on :8000, reusing it.');
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
  weStartedServer = true;
  await pollUntilReady(BASE_URL, 90_000);
  console.log('Server is up.');
}

function stopServer() {
  if (!serverProc || !weStartedServer) return;
  try { process.kill(-serverProc.pid, 'SIGTERM'); } catch { /* already gone */ }
}

// ── GIF 1: trajectory.gif ─────────────────────────────────────────────────────

async function makeTrajectoryGif(browser) {
  console.log('\n=== GIF 1: trajectory.gif ===');
  cleanTmp('traj_');

  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(800);

    console.log('  Uploading water_traj.extxyz ...');
    await uploadAndWait(page, 'water_traj.extxyz');
    console.log('  Upload complete, trajectory loaded.');

    // Capture ping-pong frames: 0..9 then 8..1 (total 18 frames → traj_000..traj_017)
    const forward = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const backward = [8, 7, 6, 5, 4, 3, 2, 1];
    const sequence = [...forward, ...backward];

    for (let idx = 0; idx < sequence.length; idx++) {
      const frameIdx = sequence[idx];
      const padded = String(idx).padStart(3, '0');
      const outPath = path.join(TMP_DIR, `traj_${padded}.png`);

      console.log(`  Frame ${padded}: setting trajectory frame ${frameIdx}`);
      const beforeFrames = await getFrames(page);

      await page.evaluate((n) => window.__atomcanvas.getState().setCurrentFrame(n), frameIdx);
      // Wait for a new render frame
      await waitForNewFrame(page, beforeFrames, 8_000);
      await sleep(120); // brief settle

      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`    → traj_${padded}.png`);
    }

    const outGif = path.join(GALLERY_DIR, 'trajectory.gif');
    console.log('  Assembling GIF with ffmpeg (ping-pong, 18 frames, 8fps) ...');
    runFfmpeg(
      `-y -framerate 8 -i ${TMP_DIR}/traj_%03d.png ` +
      `-vf "scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse" ` +
      `${outGif}`
    );

    // Check size; if > 2 MB, rebuild at 720
    const { size } = (await import('fs')).statSync(outGif);
    console.log(`  Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
    if (size > 2 * 1024 * 1024) {
      console.log('  > 2 MB — rebuilding at scale=720, max_colors=128');
      runFfmpeg(
        `-y -framerate 8 -i ${TMP_DIR}/traj_%03d.png ` +
        `-vf "scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff:max_colors=128[p];[s1][p]paletteuse" ` +
        `${outGif}`
      );
    }

    console.log(`  → trajectory.gif written to ${outGif}`);
    return outGif;
  } finally {
    await context.close();
  }
}

// ── GIF 2: demo.gif ──────────────────────────────────────────────────────────

async function makeDemoGif(browser) {
  console.log('\n=== GIF 2: demo.gif ===');
  const videoDir = path.join(TMP_DIR, 'video');
  mkdirSync(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1100, height: 720 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(1000);

    // ── Step 1: Upload benzene.xyz ──
    console.log('  Step 1: Upload benzene.xyz');
    await uploadAndWait(page, 'benzene.xyz');
    await sleep(1500);

    // ── Step 2: Rotate the molecule (drag on canvas) ──
    console.log('  Step 2: Rotate');
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Slow arc drag to make rotation visible on video
    await page.mouse.move(cx - 100, cy);
    await sleep(100);
    await page.mouse.down();
    for (let step = 0; step <= 20; step++) {
      const x = cx - 100 + step * 10; // move 200px right
      const y = cy + step * 3;         // slight downward arc
      await page.mouse.move(x, y);
      await sleep(60);
    }
    await page.mouse.up();
    await sleep(800);

    // Second drag — spin back a bit
    await page.mouse.move(cx + 80, cy - 20);
    await sleep(80);
    await page.mouse.down();
    for (let step = 0; step <= 10; step++) {
      await page.mouse.move(cx + 80 - step * 12, cy - 20 + step * 4);
      await sleep(70);
    }
    await page.mouse.up();
    await sleep(800);

    // ── Step 3: Open selection panel, select C1,C2 ──
    console.log('  Step 3: Selection panel → select C1,C2');
    await page.locator('[aria-label="toggle selection panel"]').click();
    await sleep(800);
    await page.getByRole('button', { name: 'Label' }).click();
    await sleep(400);
    await page.getByRole('textbox', { name: /labels/i }).fill('C1,C2');
    await sleep(300);
    await page.getByRole('button', { name: 'Apply' }).click();
    await sleep(1200);

    // ── Step 4: Open bonds panel, delete bond ──
    console.log('  Step 4: Bonds panel → delete bond');
    await page.locator('[aria-label="toggle bonds panel"]').click();
    await sleep(800);

    // Try the delete-bond button inside the drawer
    const drawer = page.locator('.MuiDrawer-paper');
    const deleteBtn = drawer.getByRole('button', { name: /delete bond/i });
    const deleteBtnCount = await deleteBtn.count();
    if (deleteBtnCount > 0) {
      await deleteBtn.first().click();
      await sleep(1000);
    } else {
      console.log('  (delete bond button not found — skipping)');
    }

    // ── Step 5: Open Export menu ──
    console.log('  Step 5: Open Export menu');
    await page.locator('[aria-label="Export"]').click();
    await sleep(1500);

    // Brief linger so the export options are visible
    await sleep(800);

    console.log('  Recording done.');
  } finally {
    const videoPath = await page.video().path();
    await context.close(); // finalizes .webm

    const outGif = path.join(DOCS_ASSETS_DIR, 'demo.gif');
    console.log(`  Converting ${videoPath} → demo.gif`);
    runFfmpeg(
      `-y -i ${videoPath} ` +
      `-vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
      `${outGif}`
    );

    const { size } = (await import('fs')).statSync(outGif);
    console.log(`  Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
    if (size > 3 * 1024 * 1024) {
      console.log('  > 3 MB — rebuilding at fps=10, scale=700');
      runFfmpeg(
        `-y -i ${videoPath} ` +
        `-vf "fps=10,scale=700:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
        `${outGif}`
      );
    }

    console.log(`  → demo.gif written to ${outGif}`);
    return outGif;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await ensureServer();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--proxy-bypass-list=*', '--no-sandbox'],
  });

  try {
    const trajGif = await makeTrajectoryGif(browser);
    const demoGif = await makeDemoGif(browser);

    console.log('\n=== Done ===');
    console.log(`trajectory.gif : ${trajGif}`);
    console.log(`demo.gif       : ${demoGif}`);

    // Quick ffmpeg probe of each
    for (const [label, gifPath] of [['trajectory.gif', trajGif], ['demo.gif', demoGif]]) {
      try {
        const info = execSync(`${FFMPEG} -i ${gifPath} 2>&1 || true`, { encoding: 'utf8' });
        const dims = info.match(/(\d+x\d+)/)?.[1] ?? 'unknown';
        const frames = (info.match(/frame=\s*(\d+)/)?.[1]) ?? '?';
        console.log(`  ${label}: dims=${dims} frames=${frames}`);
      } catch { /* ffprobe output goes to stderr; probe via ffprobe instead */ }
    }
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
