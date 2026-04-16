import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright runs publisher-site against a live ucp-server so end-to-end
 * flows exercise real UCP endpoints (including /internal/demo-sign-mandate
 * which requires NODE_ENV !== 'production').
 *
 * Both dev servers are booted automatically via `webServer`; set
 * `PW_REUSE=0` to force fresh boots on every run.
 */

const reuse = process.env.PW_REUSE !== '0';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3002',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../ucp-server',
      url: 'http://localhost:3001/healthz',
      reuseExistingServer: reuse,
      timeout: 30_000,
      env: { PORT: '3001', NODE_ENV: 'development' },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3002',
      reuseExistingServer: reuse,
      timeout: 30_000,
    },
  ],
});
