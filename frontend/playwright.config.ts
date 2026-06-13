import { defineConfig, devices } from '@playwright/test';

// This machine has a system HTTP proxy (http_proxy=127.0.0.1:15236) that
// intercepts localhost and breaks the test browser with
// ERR_PROXY_CONNECTION_FAILED. Make sure the local hosts bypass it for any
// Node-side fetch Playwright performs (webServer readiness probes, etc.).
const ensureLocalNoProxy = (): void => {
  const existing = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    if (!existing.includes(host)) {
      existing.push(host);
    }
  }

  const merged = existing.join(',');
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
};

ensureLocalNoProxy();

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // The browser MUST bypass the system HTTP proxy or it cannot reach the
    // local dev server (ERR_PROXY_CONNECTION_FAILED).
    launchOptions: {
      args: ['--no-proxy-server', '--proxy-bypass-list=*'],
    },
  },
  webServer: [
    {
      command: './run.sh',
      cwd: '/Users/zhangyichen/Desktop/Scripts/atomcanvas/backend',
      url: 'http://127.0.0.1:8000/docs',
      reuseExistingServer: true,
      timeout: 60 * 1000,
    },
    {
      command: 'npm run dev',
      cwd: '/Users/zhangyichen/Desktop/Scripts/atomcanvas/frontend',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 60 * 1000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
